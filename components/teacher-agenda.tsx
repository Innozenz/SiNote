"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import type { InstrumentFamily, SkillLevel } from "@prisma/client";
import {
  CalendarX,
  Check,
  FileText,
  Globe,
  Home,
  Info,
  Loader2,
  MapPin,
  PenLine,
  Sparkles,
  ShieldAlert,
  X,
} from "lucide-react";

import { Eyebrow } from "@/components/editorial";
import { InstrumentChip } from "@/components/instrument-chip";
import {
  LESSON_MODE_LABELS,
  LESSON_STATUS_LABELS,
  LessonStatusBadge,
} from "@/components/lesson-status";
import { LEVEL_LABELS } from "@/components/student-profile-detail";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { checkTransition, type BookingAction } from "@/lib/bookings/transitions";
import { canDocument } from "@/lib/reports/eligibility";
import { formatPrice } from "@/lib/format/price";
import { postJson } from "@/lib/http/failure";
import { notifyFailure, notifySuccess } from "@/lib/toast";
import {
  localMinutesInZone,
  MINUTES_PER_DAY,
  wallClockToInstant,
} from "@/lib/availability/zone";
import {
  buildWeekAgenda,
  type AgendaDay,
  type PlacedEvent,
} from "@/lib/teacher/agenda";
import { formatTime } from "@/lib/teacher/weekly-grid";
import { cn } from "@/lib/utils";

/**
 * Agenda hebdomadaire du prof.
 *
 * La mise en page vit dans `lib/teacher/agenda.ts`, qui est pure et testée ;
 * ici il n'y a que du rendu et des appels. Et surtout, aucune règle de cycle de
 * vie n'est réimplémentée : les actions proposées sortent de `checkTransition`,
 * la même machine à états que le serveur applique — ce qui interdit à cet écran
 * d'offrir un bouton que PATCH refuserait, ou d'en cacher un qu'il accepterait.
 */

export type AgendaRow = {
  id: string;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "NO_SHOW";
  /** Instants ISO : le fuseau d'affichage est celui du prof, pas du navigateur. */
  startsAt: string;
  endsAt: string;
  /** Réception de la demande : c'est elle qui date l'attente de l'élève. */
  createdAt: string;
  mode: "ONLINE" | "TEACHER_PLACE" | "STUDENT_PLACE";
  isTrial: boolean;
  priceCents: number | null;
  studentMessage: string | null;
  instrumentName: string;
  instrumentFamily: InstrumentFamily;
  /** Niveau de l'élève **sur l'instrument demandé** — jamais sur les autres. */
  studentLevel: SkillLevel | null;
  studentId: string;
  studentName: string | null;
  studentImage: string | null;
  studentAge: number | null;
  studentIsMinor: boolean;
  /** Contact du responsable, résumé par `guardianSummary`. */
  guardianContact: string | null;
};

/** Règle hebdomadaire, bornes de validité en dates civiles AAAA-MM-JJ. */
export type AgendaRule = {
  weekday: number;
  startMinute: number;
  endMinute: number;
  validFrom: string | null;
  validUntil: string | null;
};

export type AgendaException = {
  date: string;
  type: "BLOCKED" | "EXTRA";
  startMinute: number | null;
  endMinute: number | null;
  reason: string | null;
};

/** Même ligne, dates converties : la mise en page raisonne sur des instants. */
type AgendaLesson = Omit<AgendaRow, "startsAt" | "endsAt"> & {
  startsAt: Date;
  endsAt: Date;
};

/** Amorce d'un glisser, gardée jusqu'au franchissement du seuil de mouvement. */
type PendingDrag = {
  id: string;
  pointerId: number;
  durationMin: number;
  dayIndex: number;
  startMinute: number;
  grabClientY: number;
};

/** Glisser en cours : l'aperçu suit le pointeur, aimanté au pas de créneau. */
type ActiveDrag = {
  id: string;
  durationMin: number;
  originDayIndex: number;
  originStartMinute: number;
  dayIndex: number;
  startMinute: number;
  /** Sort de la journée [0, 1440] : dépôt refusé. */
  invalid: boolean;
};

/** Au-delà, un appui devient un déplacement plutôt qu'un clic de sélection. */
const DRAG_THRESHOLD_PX = 5;

/** Gestionnaires de glisser-déposer, passés du parent jusqu'aux blocs. */
type Dnd = {
  onPointerDown: (
    event: ReactPointerEvent,
    info: {
      id: string;
      durationMin: number;
      dayIndex: number;
      startMinute: number;
    }
  ) => void;
  onPointerMove: (event: ReactPointerEvent) => void;
  onPointerUp: () => void;
  /** Bloc en cours de déplacement, à estomper. */
  draggingId: string | null;
};

/** Borne un index de colonne à [0, length). */
function clampIndex(value: number, length: number): number {
  return Math.max(0, Math.min(length - 1, value));
}

/** Hauteur d'une heure de grille. En dessous, un cours de 30 min est illisible. */
const HOUR_HEIGHT = 56;

/**
 * Lignes horaires : des dégradés répétés plutôt qu'un div par heure et par jour.
 * Deux couches superposées — la ligne pleine à l'heure, une ligne plus pâle à la
 * demi-heure, pour situer un créneau de 30 min sans compter. En style inline,
 * car une valeur à virgules dans une classe Tailwind fait inventer au scanner
 * une règle illisible.
 */
const HOUR_LINES = [
  `repeating-linear-gradient(to bottom, var(--border) 0, var(--border) 1px, transparent 1px, transparent ${HOUR_HEIGHT}px)`,
  `repeating-linear-gradient(to bottom, color-mix(in oklab, var(--border) 45%, transparent) 0, color-mix(in oklab, var(--border) 45%, transparent) 1px, transparent 1px, transparent ${HOUR_HEIGHT / 2}px)`,
].join(", ");

/** Hachures du congé. Partagées avec la légende, pour qu'elles ne divergent pas. */
const HATCH =
  "repeating-linear-gradient(45deg, var(--border-strong) 0, var(--border-strong) 2px, transparent 2px, transparent 7px)";

const WEEKDAY_SHORT = [
  "lun.",
  "mar.",
  "mer.",
  "jeu.",
  "ven.",
  "sam.",
  "dim.",
];

const MODE_LABELS = LESSON_MODE_LABELS;

/**
 * Une règle tient l'ensemble : **les neutres appartiennent à la grille, les
 * teintes aux cours.** Blanc, gris et hachures disent l'état d'une plage
 * horaire ; bleu, ambre, vert et rouge disent l'état d'un cours. Aucun cours ne
 * peut donc être confondu avec un fond.
 *
 * Elle a été apprise à l'envers : un cours terminé a partagé `surface-strong`
 * avec les heures fermées, et toutes les heures fermées de la semaine se sont
 * mises à se lire « Passé » dans la légende — sur des dates à venir. Le blanc
 * bordé essayé ensuite entrait en collision avec « Ouvert ». Un vert « terminé »
 * n'entre en collision avec rien.
 *
 * Une demande est en outre bordée en pointillés : rien n'est acquis tant que le
 * prof n'a pas répondu, et le créneau reste immobilisé pendant ce temps.
 */
const STATUS_STYLES: Record<AgendaRow["status"], string> = {
  PENDING: "border-dashed border-warning/60 bg-warning-soft text-warning",
  CONFIRMED: "border-primary/40 bg-primary-soft text-primary",
  COMPLETED: "border-success/40 bg-success-soft text-success",
  NO_SHOW: "border-danger/40 bg-danger-soft text-danger",
};

/**
 * Barre de statut, à gauche du bloc : un aplat plein de la teinte du statut,
 * là où le fond n'en est qu'une version douce. Rendue en `<span>` plutôt qu'en
 * bordure gauche pour rester pleine même quand la demande est en pointillés.
 * Classes écrites en toutes lettres — Tailwind ne génère pas une classe montée
 * à l'exécution.
 */
const STATUS_BAR: Record<AgendaRow["status"], string> = {
  PENDING: "bg-warning",
  CONFIRMED: "bg-primary",
  COMPLETED: "bg-success",
  NO_SHOW: "bg-danger",
};

const MODE_ICONS: Record<AgendaRow["mode"], typeof Globe> = {
  ONLINE: Globe,
  TEACHER_PLACE: Home,
  STUDENT_PLACE: MapPin,
};

/** Les cinq transitions que le volet peut proposer, dans l'ordre du parcours. */
const ACTIONS: BookingAction[] = [
  "confirm",
  "decline",
  "complete",
  "no_show",
  "cancel",
];

// Confirmation en toast des actions qui gardent le cours à l'agenda. Annuler et
// refuser libèrent le créneau et sont annoncés à part (préavis, réservable).
const ACTION_SUCCESS: Record<BookingAction, string> = {
  confirm: "Cours confirmé.",
  decline: "Demande refusée.",
  cancel: "Cours annulé.",
  complete: "Cours marqué comme donné.",
  no_show: "Élève marqué absent.",
};

/**
 * Actions irréversibles, confirmées avant d'être envoyées. Le motif est
 * transmis à l'élève pour refuser et annuler (le serveur le stocke en
 * `cancellationReason`) ; l'absence n'a pas de motif à donner.
 */
const DESTRUCTIVE: Partial<
  Record<
    BookingAction,
    { title: string; description: string; confirm: string; reason?: string }
  >
> = {
  decline: {
    title: "Refuser cette demande ?",
    description:
      "Le créneau redevient réservable et l'élève est prévenu. Cette décision est définitive.",
    confirm: "Refuser la demande",
    reason: "Motif (facultatif, transmis à l'élève)",
  },
  cancel: {
    title: "Annuler ce cours ?",
    description:
      "Le cours est retiré de l'agenda et l'élève est prévenu. Cette décision est définitive.",
    confirm: "Annuler le cours",
    reason: "Motif (facultatif, transmis à l'élève)",
  },
  no_show: {
    title: "Marquer l'élève absent ?",
    description:
      "Le cours est clos comme non honoré : il ne compte pas dans vos cours donnés et l'élève ne pourra pas laisser d'avis.",
    confirm: "Élève absent",
  },
};

export function TeacherAgenda({
  rows: initial,
  rules,
  exceptions,
  weekStart,
  days,
  view,
  timezone,
  granularityMin,
}: {
  rows: AgendaRow[];
  rules: AgendaRule[];
  exceptions: AgendaException[];
  /** Clé civile du premier jour affiché (lundi en semaine, jour choisi en jour). */
  weekStart: string;
  /** 7 (semaine) ou 1 (jour). */
  days: number;
  view: "jour" | "semaine";
  timezone: string;
  /** Pas de départ des créneaux, pour aimanter le glisser-déposer. */
  granularityMin: number;
}) {
  const [rows, setRows] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Le volet latéral n'existe qu'à partir de `lg` ; en dessous, le même contenu
  // s'ouvre en feuille. On ne peut pas laisser le CSS trancher : un Radix Dialog
  // « ouvert » monte son overlay quelle que soit la largeur, et le volet et la
  // feuille se superposeraient sur grand écran.
  const isDesktop = useIsDesktop();

  // Glisser-déposer. `bodyRef` sert à convertir la position du pointeur en
  // (jour, minute) ; `pending` retient l'amorce tant que le seuil n'est pas
  // franchi (pour ne pas confondre un clic de sélection avec un déplacement) ;
  // `drag` porte l'aperçu affiché ; `movedRef` neutralise le clic qui suit un
  // vrai déplacement.
  const bodyRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<PendingDrag | null>(null);
  const movedRef = useRef(false);
  const [drag, setDrag] = useState<ActiveDrag | null>(null);

  // Figé au montage, comme dans la boîte de réception : recalculer à chaque
  // rendu ferait apparaître et disparaître des boutons pendant que le prof clique.
  const [now] = useState(() => new Date());

  // La semaine affichée vient de l'URL : changer de semaine remonte au serveur,
  // donc les lignes reçues correspondent toujours à `weekStart`.
  useEffect(() => {
    setRows(initial);
    setSelectedId(null);
  }, [initial]);

  const agenda = useMemo(
    () =>
      buildWeekAgenda({
        timezone,
        weekStart,
        days,
        rules: rules.map((rule) => ({
          ...rule,
          validFrom: civilDate(rule.validFrom),
          validUntil: civilDate(rule.validUntil),
        })),
        exceptions: exceptions.map((exception) => ({
          ...exception,
          date: civilDate(exception.date)!,
        })),
        events: rows.map(
          (row): AgendaLesson => ({
            ...row,
            startsAt: new Date(row.startsAt),
            endsAt: new Date(row.endsAt),
          })
        ),
        now,
      }),
    [rows, rules, exceptions, weekStart, days, timezone, now]
  );

  const title =
    view === "jour"
      ? dayTitle(agenda.days[0]?.date ?? weekStart)
      : weekLabel(agenda.days);

  const span = agenda.endMinute - agenda.startMinute;
  const height = (span / 60) * HOUR_HEIGHT;

  /** Position verticale d'une minute locale, en pourcentage de la grille. */
  const offset = (minute: number) =>
    ((minute - agenda.startMinute) / span) * 100;

  // Trait « maintenant » : sur la colonne du jour, à l'heure murale courante.
  // `now` est figé au montage — le trait ne défile pas en direct, ce qui suffit
  // pour un repère au chargement et reste cohérent avec le `now` des actions.
  const todayIndex = agenda.days.findIndex((day) => day.isToday);
  const nowMinute = localMinutesInZone(now, timezone);
  const showNow =
    todayIndex >= 0 &&
    nowMinute >= agenda.startMinute &&
    nowMinute <= agenda.endMinute;

  const selected = rows.find((row) => row.id === selectedId) ?? null;

  const hasOpenings = agenda.days.some((day) => day.open.length > 0);

  // Deux comptes distincts, parce qu'ils appellent deux gestes différents : un
  // cours est posé, une demande attend une réponse et immobilise son créneau.
  const lessonCount = rows.filter((row) => row.status !== "PENDING").length;
  const requestCount = rows.filter((row) => row.status === "PENDING").length;

  // Heures ouvertes de la période affichée : c'est la surface blanche de la
  // grille, celle qu'un élève peut encore réserver. Minutes murales, comme le
  // reste du dessin.
  const openMinutes = agenda.days.reduce(
    (sum, day) =>
      sum +
      day.open.reduce(
        (dayTotal, interval) => dayTotal + (interval.end - interval.start),
        0
      ),
    0
  );

  // Action qui retire quelque chose à quelqu'un : confirmée dans une boîte de
  // dialogue avant d'atteindre le serveur. Confirmer et clôturer, non.
  const [pending, setPending] = useState<{
    id: string;
    action: BookingAction;
  } | null>(null);

  const act = async (
    id: string,
    action: BookingAction,
    reason?: string
  ): Promise<boolean> => {
    setBusy(true);

    try {
      const result = await postJson<{
        status: AgendaRow["status"] | "CANCELLED" | "DECLINED";
        lateCancellation?: boolean;
      }>(`/api/bookings/${id}`, {
        method: "PATCH",
        body: JSON.stringify(reason ? { action, reason } : { action }),
      });

      if (!result.ok) {
        notifyFailure(result.failure, { onRetry: () => act(id, action, reason) });
        return false;
      }

      const { status } = result.data;

      // Annulé et refusé libèrent le créneau : le cours quitte l'agenda, et la
      // plage réapparaît comme ouverte. Son historique reste dans les demandes.
      if (status === "CANCELLED" || status === "DECLINED") {
        setRows((current) => current.filter((row) => row.id !== id));
        setSelectedId(null);
        if (result.data.lateCancellation) {
          notifySuccess(
            "Cours annulé.",
            "C'était dans votre délai de prévenance : pensez à prévenir l'élève."
          );
        } else {
          notifySuccess(
            status === "DECLINED" ? "Demande refusée." : "Cours annulé.",
            "Le créneau est de nouveau réservable."
          );
        }
        return true;
      }

      setRows((current) =>
        current.map((row) => (row.id === id ? { ...row, status } : row))
      );
      notifySuccess(ACTION_SUCCESS[action]);
      return true;
    } finally {
      setBusy(false);
    }
  };

  const select = (id: string) => {
    // Un clic qui conclut un vrai déplacement ne doit pas aussi sélectionner.
    if (movedRef.current) {
      movedRef.current = false;
      return;
    }
    setSelectedId(id);
  };

  // --- Glisser-déposer d'un cours confirmé vers un nouvel horaire ---

  const beginDrag = (
    event: ReactPointerEvent,
    info: { id: string; durationMin: number; dayIndex: number; startMinute: number }
  ) => {
    if (event.button !== 0) return; // clic gauche / doigt seulement
    pendingRef.current = {
      ...info,
      pointerId: event.pointerId,
      grabClientY: event.clientY,
    };
    movedRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: ReactPointerEvent) => {
    const pending = pendingRef.current;
    const body = bodyRef.current;
    if (!pending || !body) return;

    // Tant que le seuil n'est pas franchi, c'est peut-être un simple clic.
    if (!drag && Math.abs(event.clientY - pending.grabClientY) < DRAG_THRESHOLD_PX) {
      return;
    }

    const rect = body.getBoundingClientRect();
    const dayIndex = clampIndex(
      Math.floor((event.clientX - rect.left) / (rect.width / agenda.days.length)),
      agenda.days.length
    );
    // On aimante le **déplacement** (delta) au pas, pas la position absolue :
    // l'heure d'origine étant un créneau valide, bouger de k×pas garde la même
    // phase et retombe sur un créneau que le serveur acceptera.
    const deltaMinutes = ((event.clientY - pending.grabClientY) / rect.height) * span;
    const snapped = Math.round(deltaMinutes / granularityMin) * granularityMin;
    const startMinute = pending.startMinute + snapped;

    movedRef.current = true;
    setDrag({
      id: pending.id,
      durationMin: pending.durationMin,
      originDayIndex: pending.dayIndex,
      originStartMinute: pending.startMinute,
      dayIndex,
      startMinute,
      invalid: startMinute < 0 || startMinute + pending.durationMin > MINUTES_PER_DAY,
    });
  };

  const endDrag = () => {
    const active = drag;
    pendingRef.current = null;
    setDrag(null);
    if (!active) return;

    const moved =
      active.dayIndex !== active.originDayIndex ||
      active.startMinute !== active.originStartMinute;

    if (!moved || active.invalid) {
      // Rien à reprogrammer ; on laisse le clic éventuel sélectionner.
      movedRef.current = false;
      return;
    }

    const targetDate = agenda.days[active.dayIndex].date;
    const startsAt = new Date(
      wallClockToInstant(targetDate, active.startMinute, timezone)
    );
    void reschedule(active.id, startsAt);
  };

  const reschedule = async (id: string, startsAt: Date) => {
    setBusy(true);

    try {
      const result = await postJson<{ startsAt: string; endsAt: string }>(
        `/api/bookings/${id}/reschedule`,
        { method: "POST", body: JSON.stringify({ startsAt: startsAt.toISOString() }) }
      );

      if (!result.ok) {
        notifyFailure(result.failure, { onRetry: () => reschedule(id, startsAt) });
        return;
      }

      setRows((current) =>
        current.map((row) =>
          row.id === id
            ? { ...row, startsAt: result.data.startsAt, endsAt: result.data.endsAt }
            : row
        )
      );
      notifySuccess("Cours déplacé.", "L'élève a été prévenu.");
    } finally {
      setBusy(false);
    }
  };

  const dnd: Dnd = {
    onPointerDown: beginDrag,
    onPointerMove: moveDrag,
    onPointerUp: endDrag,
    draggingId: drag?.id ?? null,
  };

  const pendingSpec = pending ? DESTRUCTIVE[pending.action] : undefined;

  const inspector = selected ? (
    <LessonInspector
      row={selected}
      timezone={timezone}
      now={now}
      busy={busy}
      onAct={(id, action) =>
        DESTRUCTIVE[action] ? setPending({ id, action }) : void act(id, action)
      }
      onClose={() => setSelectedId(null)}
    />
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      {pending && pendingSpec ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setPending(null);
          }}
          title={pendingSpec.title}
          description={pendingSpec.description}
          confirmLabel={pendingSpec.confirm}
          destructive
          busy={busy}
          reason={
            pendingSpec.reason ? { label: pendingSpec.reason } : undefined
          }
          onConfirm={async (reason) => {
            const ok = await act(pending.id, pending.action, reason || undefined);
            if (ok) setPending(null);
          }}
        />
      ) : null}
      {/* Grille et volet côte à côte à partir de `lg`. En dessous, le volet
          disparaît et son contenu revient en feuille : deux colonnes de 320 px
          ne tiennent pas sur un téléphone, et comprimer la grille lui ferait
          perdre ce qui la rend lisible. */}
      <div className="flex items-start gap-6">
        <Card className="min-w-0 flex-1">
          <CardHeader>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <CardTitle className="font-display text-2xl font-semibold tracking-[-0.01em]">
                {title}
              </CardTitle>
              <CardDescription>
                {[
                  rows.length === 0
                    ? "Aucun cours prévu"
                    : lessonCount > 0
                      ? `${lessonCount} cours`
                      : null,
                  requestCount > 0
                    ? `${requestCount} demande${requestCount > 1 ? "s" : ""}`
                    : null,
                  `${formatDuration(openMinutes)} ouvertes`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            {/* Sept colonnes horaires ne tiennent pas sur un téléphone : la
                grille défile horizontalement plutôt que de se comprimer. La
                colonne des heures reste épinglée à gauche — sans elle, un bloc
                vu au milieu du défilement ne dit plus à quelle heure il est. */}
            {/* `overflow-y-clip` et non le défaut : dès qu'un axe cesse d'être
                `visible`, l'autre est ramené à `auto` par la spécification, et la
                grille se retrouvait avec un ascenseur vertical propre qui
                décrochait la ligne des jours de ses colonnes. `clip` n'est pas
                `visible`, donc il coupe court à cette coercition sans rien
                rogner : la hauteur du contenu est fixée par construction. */}
            <div className="-mx-2 overflow-x-auto overflow-y-clip px-2">
              <div className={cn(days > 1 ? "min-w-[44rem]" : "min-w-[18rem]")}>
                <div className="flex">
                  <div className="sticky left-0 z-20 w-12 shrink-0 border-r border-border bg-background" />
                  {agenda.days.map((day) => (
                    <DayHeader key={day.date} day={day} />
                  ))}
                </div>

                <div className="flex" style={{ height }}>
                  <div className="sticky left-0 z-20 w-12 shrink-0 border-r border-border bg-background">
                    {hourMarks(agenda.startMinute, agenda.endMinute).map(
                      (minute) => (
                        <span
                          key={minute}
                          className="absolute right-1 -translate-y-1/2 text-[11px] tabular-nums text-subtle"
                          style={{ top: `${offset(minute)}%` }}
                        >
                          {formatTime(minute)}
                        </span>
                      )
                    )}
                  </div>

                  <div
                    ref={bodyRef}
                    className="relative flex flex-1 border-t border-border"
                  >
                    {agenda.days.map((day, dayIndex) => (
                      <DayColumn
                        key={day.date}
                        day={day}
                        dayIndex={dayIndex}
                        offset={offset}
                        rangeStart={agenda.startMinute}
                        rangeEnd={agenda.endMinute}
                        selectedId={selectedId}
                        onSelect={select}
                        dnd={dnd}
                      />
                    ))}

                    {/* Aperçu du glisser : où le cours atterrirait, aimanté au pas. */}
                    {drag ? (
                      <div
                        aria-hidden
                        className={cn(
                          "pointer-events-none absolute z-20 overflow-hidden rounded-sm border-2 border-dashed",
                          drag.invalid
                            ? "border-danger bg-danger-soft/70"
                            : "border-primary bg-primary-soft/70"
                        )}
                        style={{
                          top: `${offset(drag.startMinute)}%`,
                          height: `${offset(drag.startMinute + drag.durationMin) - offset(drag.startMinute)}%`,
                          left: `calc(${(drag.dayIndex / agenda.days.length) * 100}% + 1px)`,
                          width: `calc(${100 / agenda.days.length}% - 2px)`,
                        }}
                      >
                        {!drag.invalid ? (
                          <span className="px-1 text-[11px] font-medium text-primary">
                            {formatTime(drag.startMinute)}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    {/* Repère « maintenant », posé par-dessus la colonne du
                        jour. En rouge, la convention de tous les agendas — et
                        non en or : l'or nomme l'étiquette éditoriale partout
                        ailleurs dans le site, le dépenser ici le banaliserait. */}
                    {showNow ? (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute z-10 h-0.5 bg-danger"
                        style={{
                          top: `${offset(nowMinute)}%`,
                          left: `${(todayIndex / agenda.days.length) * 100}%`,
                          width: `${100 / agenda.days.length}%`,
                        }}
                      >
                        <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-danger" />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <Legend />

            {!hasOpenings ? (
              <p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-sm text-warning">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Aucune plage d&apos;ouverture cette semaine : personne ne peut
                  vous réserver de cours.{" "}
                  <Link
                    href="/dashboard/prof/disponibilites"
                    className="font-medium underline"
                  >
                    Définir mes disponibilités
                  </Link>
                </span>
              </p>
            ) : null}
          </CardContent>
        </Card>

        {/* Le volet : 320 px, collant, toujours présent à partir de `lg`. Vide,
            il dit à quoi il sert plutôt que de laisser un trou dans la page. */}
        <aside className="sticky top-6 hidden w-80 shrink-0 lg:block">
          {inspector ? (
            <div className="rounded-lg border border-border bg-elevated p-5">
              {inspector}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-5 text-sm text-muted">
              Cliquez un cours pour l&apos;ouvrir ici : détail de l&apos;élève,
              tarif, message, et les actions possibles.
            </div>
          )}
        </aside>
      </div>

      {/* Sous `lg`, le même contenu en feuille. Un seul composant, deux
          contenants — dupliquer le détail garantirait qu'ils divergent. */}
      <Dialog
        open={!isDesktop && selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        {/* Feuille ancrée en bas plutôt que boîte centrée : sur un téléphone
            tenu à une main, le pouce atteint le bas de l'écran, pas son milieu —
            et les actions du volet sont en fin de contenu. Posé en classes ici
            plutôt qu'en variante de la primitive : c'est ce dialogue-ci qui est
            une feuille, pas tous. */}
        <DialogContent className="bottom-0 left-0 top-auto max-h-[80vh] w-full max-w-none translate-x-0 translate-y-0 rounded-b-none pb-8">
          <DialogHeader className="sr-only">
            <DialogTitle>
              {selected
                ? `${selected.studentName ?? "Élève"} — ${selected.instrumentName}`
                : "Cours"}
            </DialogTitle>
          </DialogHeader>
          {inspector}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Vrai à partir de `lg` (1024 px), la largeur à laquelle le volet apparaît.
 *
 * Nécessairement en JavaScript : le CSS peut cacher le volet, il ne peut pas
 * empêcher un Radix Dialog « ouvert » de monter son overlay. Faux au premier
 * rendu (le serveur ne connaît pas la fenêtre), ce qui est sans conséquence :
 * aucun cours n'est sélectionné au montage.
 */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(query.matches);

    sync();
    query.addEventListener("change", sync);

    return () => query.removeEventListener("change", sync);
  }, []);

  return isDesktop;
}

function DayHeader({ day }: { day: AgendaDay<AgendaLesson> }) {
  return (
    <div
      className={cn(
        "flex-1 border-l border-border px-1 pb-2 text-center",
        day.isToday && "bg-primary-soft"
      )}
    >
      <p
        className={cn(
          "text-xs font-medium",
          day.isToday ? "text-primary" : "text-muted"
        )}
      >
        {WEEKDAY_SHORT[day.weekday - 1]}
      </p>
      <p
        className={cn(
          "text-sm tabular-nums",
          day.isToday ? "font-semibold text-primary" : "text-foreground"
        )}
      >
        {Number(day.date.slice(8, 10))}
      </p>
    </div>
  );
}

function DayColumn({
  day,
  dayIndex,
  offset,
  rangeStart,
  rangeEnd,
  selectedId,
  onSelect,
  dnd,
}: {
  day: AgendaDay<AgendaLesson>;
  dayIndex: number;
  offset: (minute: number) => number;
  rangeStart: number;
  rangeEnd: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  dnd: Dnd;
}) {
  const band = (start: number, end: number) => ({
    top: `${offset(start)}%`,
    height: `${offset(end) - offset(start)}%`,
  });

  // « Fermé » n'est écrit que sur une journée sans aucune ouverture, une
  // fois, au centre. Un mot par creux — jusqu'à sept par écran — chargeait la
  // grille sans rien apprendre : la légende nomme déjà le gris, et sur une
  // journée partielle le blanc des ouvertures dit le reste.
  const fullyClosed = day.open.length === 0;

  return (
    // Gris par défaut : hors des plages ouvertes, personne ne peut réserver.
    // C'est le fond qui porte l'information, la couche blanche des ouvertures
    // se posant par-dessus.
    <div className="relative flex-1 border-l border-border bg-surface-strong">
      {/* Ouvertures : la crème claire de la carte dit « réservable », sans
          avoir à l'écrire. `elevated` et non `background` : la grille vit dans
          une carte `elevated`, et peindre les ouvertures du crème *du papier*
          les rendait plus sombres que la carte — l'inverse de « éclairci ». */}
      {day.open.map((interval) => (
        <div
          key={`open-${interval.start}`}
          className="absolute inset-x-0 bg-elevated"
          style={band(interval.start, interval.end)}
        />
      ))}

      {/* Congés : hachures sur le blanc de l'ouverture, pour dire « c'était
          ouvert, je l'ai fermé » — et non « jamais ouvert », qui est le gris.
          Le mot est écrit à même la bande, pas seulement en légende, dès qu'elle
          est assez haute — sur un fond opaque pour rester lisible sur la hachure. */}
      {day.closed.map((interval) => (
        <div
          key={`closed-${interval.start}`}
          className="absolute inset-x-0 flex items-center justify-center overflow-hidden bg-elevated"
          style={{ ...band(interval.start, interval.end), backgroundImage: HATCH }}
          title="Congé"
        >
          {interval.end - interval.start >= 45 ? (
            <span className="pointer-events-none rounded bg-elevated/85 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted">
              Congé
            </span>
          ) : null}
        </div>
      ))}

      {/* Les lignes horaires passent par-dessus les fonds, sinon la bande
          blanche des ouvertures les effacerait là où on en a le plus besoin. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: HOUR_LINES }}
      />

      {/* « Fermé » au centre d'une journée entièrement fermée — au-dessus des
          lignes horaires, sous les cours (un cours posé hors ouverture le
          recouvre). */}
      {fullyClosed ? (
        <span
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-elevated/85 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted"
          style={{ top: `${offset((rangeStart + rangeEnd) / 2)}%` }}
        >
          Fermé
        </span>
      ) : null}

      {day.events.map((placed) => (
        <EventBlock
          key={`${placed.event.id}-${day.date}`}
          placed={placed}
          dayIndex={dayIndex}
          offset={offset}
          selected={placed.event.id === selectedId}
          onSelect={onSelect}
          dnd={dnd}
        />
      ))}
    </div>
  );
}

function EventBlock({
  placed,
  dayIndex,
  offset,
  selected,
  onSelect,
  dnd,
}: {
  placed: PlacedEvent<AgendaLesson>;
  dayIndex: number;
  offset: (minute: number) => number;
  selected: boolean;
  onSelect: (id: string) => void;
  dnd: Dnd;
}) {
  const { event, column, columns } = placed;
  const top = offset(placed.startMinute);
  const height = offset(placed.endMinute) - top;

  // Déplaçable : seuls les cours confirmés, et seulement le bloc entier (pas un
  // morceau à cheval sur minuit). Le backend n'accepte de toute façon que les
  // confirmés.
  const draggable =
    event.status === "CONFIRMED" &&
    !placed.continuesBefore &&
    !placed.continuesAfter;
  const durationMin = Math.round(
    (event.endsAt.getTime() - event.startsAt.getTime()) / 60_000
  );
  const dragging = dnd.draggingId === event.id;

  const dragHandlers = draggable
    ? {
        onPointerDown: (e: ReactPointerEvent) =>
          dnd.onPointerDown(e, {
            id: event.id,
            durationMin,
            dayIndex,
            startMinute: placed.startMinute,
          }),
        onPointerMove: dnd.onPointerMove,
        onPointerUp: dnd.onPointerUp,
      }
    : {};

  /**
   * L'heure n'est répétée que si la place le permet. La position verticale du
   * bloc et la gouttière la donnent déjà ; le nom de l'élève, lui, n'est écrit
   * nulle part ailleurs — dans une colonne partagée, « 18:00 … » tronquait la
   * seule information que la grille ne porte pas.
   *
   * Un bloc qui vient de la veille ne l'affiche jamais : sa minute de départ
   * dans ce jour vaut 0, et « 00:00 » serait faux.
   */
  const showTime = columns === 1 && !placed.continuesBefore;
  const ModeIcon = MODE_ICONS[event.mode];

  // Un bloc peut sortir de la grille par le haut ou le bas quand un cours tombe
  // hors des heures affichées ; on le laisse rogné plutôt que d'agrandir la
  // grille, les bornes ayant déjà été calculées pour l'englober.
  return (
    <button
      type="button"
      onClick={() => onSelect(event.id)}
      {...dragHandlers}
      title={`${event.studentName ?? "Élève"} — ${event.instrumentName} · ${MODE_LABELS[event.mode]}`}
      className={cn(
        "absolute overflow-hidden rounded-sm border py-0.5 pl-2.5 pr-1 text-left text-[11px] leading-tight transition-shadow hover:z-10 hover:shadow-md",
        STATUS_STYLES[event.status],
        placed.continuesBefore && "rounded-t-none border-t-0",
        placed.continuesAfter && "rounded-b-none border-b-0",
        // Déplaçable : curseur de préhension, pas de sélection de texte, et on
        // neutralise le défilement tactile pour que le doigt glisse le bloc.
        draggable && "cursor-grab touch-none select-none",
        dragging && "opacity-40",
        selected && "ring-2 ring-primary ring-offset-1"
      )}
      style={{
        top: `${top}%`,
        height: `${height}%`,
        left: `calc(${(column / columns) * 100}% + 1px)`,
        width: `calc(${100 / columns}% - 2px)`,
      }}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          STATUS_BAR[event.status]
        )}
      />
      <span className="block truncate font-medium">
        {showTime ? `${formatTime(placed.startMinute)} ` : ""}
        {event.studentName ?? "Élève"}
      </span>
      <span className="flex items-center gap-1 opacity-80">
        <ModeIcon className="h-3 w-3 shrink-0" />
        <span className="truncate">{event.instrumentName}</span>
      </span>
    </button>
  );
}

/**
 * Volet d'inspection d'un cours.
 *
 * Il a remplacé une modale, et le changement n'est pas cosmétique : une modale
 * masque la grille, or c'est justement la grille qu'on relit en décidant
 * (« si je confirme ça, que reste-t-il de ma jeudi ? »). Le volet laisse les
 * deux lisibles.
 *
 * Aucune règle de cycle de vie n'est réécrite ici : les boutons proposés sortent
 * de `checkTransition`, la machine à états que le serveur applique — ce volet ne
 * peut donc offrir ni ce que PATCH refuserait, ni cacher ce qu'il accepterait.
 */
function LessonInspector({
  row,
  timezone,
  now,
  busy,
  onAct,
  onClose,
}: {
  row: AgendaRow;
  timezone: string;
  now: Date;
  busy: boolean;
  onAct: (id: string, action: BookingAction) => void;
  onClose: () => void;
}) {
  const startsAt = new Date(row.startsAt);
  const endsAt = new Date(row.endsAt);
  const createdAt = new Date(row.createdAt);

  const allowed = new Set(
    ACTIONS.filter(
      (action) =>
        checkTransition({
          action,
          currentStatus: row.status,
          actor: "teacher",
          startsAt,
          endsAt,
          now,
        }).ok
    )
  );

  // Le compte rendu s'ouvre dès que le cours a commencé (confirmé ou terminé) —
  // même règle que l'atelier et la fiche élève.
  const documentable = canDocument(row.status, startsAt, now);

  const format = (date: Date, options: Intl.DateTimeFormatOptions) =>
    date.toLocaleString("fr-FR", { ...options, timeZone: timezone });
  const time = (date: Date) =>
    format(date, { hour: "2-digit", minute: "2-digit" });

  const waitedDays = Math.floor(
    (now.getTime() - createdAt.getTime()) / 86_400_000
  );
  const name = row.studentName ?? "Élève";
  const studentHref = `/dashboard/prof/eleves/${row.studentId}`;

  // « 17 ans · responsable : Claire Martin » — l'âge et le responsable tiennent
  // sur la même ligne, sous le nom : séparés, le second se lisait comme une
  // alerte alors qu'un mineur dont le responsable est renseigné n'en est pas une.
  const studentSubline = [
    row.studentAge !== null ? `${row.studentAge} ans` : null,
    row.studentAge === null && row.studentIsMinor ? "mineur" : null,
    row.guardianContact ? `responsable : ${row.guardianContact}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const facts: { label: string; value: React.ReactNode }[] = [
    {
      label: "Cours",
      value: (
        <InstrumentChip
          name={row.instrumentName}
          family={row.instrumentFamily}
          detail={row.isTrial ? "essai" : null}
        />
      ),
    },
  ];

  if (row.studentLevel) {
    facts.push({ label: "Niveau", value: LEVEL_LABELS[row.studentLevel] });
  }

  // Le lieu porte son icône, la même que sur les blocs de la grille : c'est le
  // fait qu'on relit en dernier avant de confirmer.
  const LieuIcon = MODE_ICONS[row.mode];
  facts.push({
    label: "Lieu",
    value: (
      <span className="inline-flex items-center gap-1.5">
        <LieuIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
        {MODE_LABELS[row.mode]}
      </span>
    ),
  });

  if (row.priceCents !== null) {
    facts.push({
      label: "Tarif",
      value: (
        <span>
          {formatPrice(row.priceCents)}
          <span className="text-muted">, réglé à vous</span>
        </span>
      ),
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <LessonStatusBadge status={row.status} />
          {row.isTrial ? (
            <Badge variant="secondary">
              <Sparkles className="mr-1 h-3 w-3" />
              Essai
            </Badge>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le détail"
          className="-mr-2 -mt-2 hidden h-9 w-9 items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface hover:text-foreground lg:flex"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div>
        <Eyebrow className="normal-case first-letter:uppercase">
          {format(startsAt, {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </Eyebrow>
        <p className="mt-1 font-display text-[32px] font-semibold leading-none tabular-nums lg:text-[40px]">
          {time(startsAt)}
          <span className="text-subtle"> → </span>
          {time(endsAt)}
        </p>
        {row.status === "PENDING" ? (
          <p className="mt-2 text-sm text-muted">
            Demandé {format(createdAt, { weekday: "long", day: "numeric" })},
            {waitedDays <= 0
              ? " aujourd'hui"
              : waitedDays === 1
                ? " il y a 1 jour"
                : ` il y a ${waitedDays} jours`}
            .
          </p>
        ) : null}
      </div>

      {/* L'élève : qui vient, et de quoi il faut se souvenir avant d'ouvrir la
          porte — l'âge et le responsable d'un mineur en font partie, sur la
          même ligne que l'âge : ce sont deux moitiés d'un même fait. */}
      <div className="flex items-center gap-3 border-y border-border py-3.5">
        <Avatar className="h-11 w-11 shrink-0 border border-border">
          <AvatarImage src={row.studentImage || undefined} alt={name} />
          <AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{name}</p>
          {studentSubline ? (
            <p className="truncate text-xs text-muted" title={studentSubline}>
              {studentSubline}
            </p>
          ) : null}
        </div>
        <Link
          href={studentHref}
          className="shrink-0 text-xs text-primary hover:underline"
        >
          Fiche →
        </Link>
      </div>

      {/* Un mineur sans responsable joignable est le seul cas qui reste une
          alerte : le prof ne peut ni prévenir, ni décaler. */}
      {row.studentIsMinor && !row.guardianContact ? (
        <p className="flex items-start gap-2 rounded-md bg-warning-soft p-2 text-xs text-warning">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Aucun contact de responsable renseigné.
        </p>
      ) : null}

      <dl className="flex flex-col gap-2 text-sm">
        {facts.map((fact) => (
          <div
            key={fact.label}
            className="flex items-baseline justify-between gap-3"
          >
            <dt className="shrink-0 text-muted">{fact.label}</dt>
            <dd className="min-w-0 text-right">{fact.value}</dd>
          </div>
        ))}
      </dl>

      {/* Le message de l'élève, cité tel quel : en italique entre guillemets,
          c'est sa voix et non celle de l'application. */}
      {row.studentMessage ? (
        <blockquote className="rounded-md bg-surface px-3.5 py-3 text-[13px] italic leading-relaxed text-muted">
          «&nbsp;{row.studentMessage}&nbsp;»
        </blockquote>
      ) : null}

      <div className="flex flex-col gap-2">
        {allowed.has("confirm") ? (
          <Button
            variant="success"
            className="w-full"
            disabled={busy}
            onClick={() => onAct(row.id, "confirm")}
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Confirmer le cours
          </Button>
        ) : null}

        <div className="flex gap-2">
          {allowed.has("decline") ? (
            <Button
              variant="outline"
              className="flex-1"
              disabled={busy}
              onClick={() => onAct(row.id, "decline")}
            >
              <X className="mr-2 h-4 w-4" />
              Refuser
            </Button>
          ) : null}
          <Button variant="ghost" className="flex-1" asChild>
            <Link href={`${studentHref}?onglet=messages`}>
              <PenLine className="mr-2 h-4 w-4" />
              Écrire
            </Link>
          </Button>
        </div>

        {allowed.has("complete") || allowed.has("no_show") ? (
          <div className="flex gap-2">
            {allowed.has("complete") ? (
              <Button
                variant="success"
                className="flex-1"
                disabled={busy}
                onClick={() => onAct(row.id, "complete")}
              >
                <Check className="mr-2 h-4 w-4" />
                Terminé
              </Button>
            ) : null}
            {allowed.has("no_show") ? (
              <Button
                variant="outline"
                className="flex-1"
                disabled={busy}
                onClick={() => onAct(row.id, "no_show")}
              >
                <X className="mr-2 h-4 w-4" />
                Absent
              </Button>
            ) : null}
          </div>
        ) : null}

        {allowed.has("cancel") ? (
          <Button
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => onAct(row.id, "cancel")}
          >
            <CalendarX className="mr-2 h-4 w-4" />
            Annuler
          </Button>
        ) : null}

        {documentable ? (
          <Button variant="outline" className="w-full" asChild>
            <Link href={`${studentHref}?onglet=comptes-rendus#cr-${row.id}`}>
              <FileText className="mr-2 h-4 w-4" />
              Compte rendu
            </Link>
          </Button>
        ) : null}

        {allowed.size === 0 && !documentable ? (
          <p className="text-sm text-subtle">
            Ce cours n&apos;attend plus rien de vous ({
              LESSON_STATUS_LABELS[row.status].toLowerCase()
            }).
          </p>
        ) : null}
      </div>

      {/* Le coût d'une demande laissée en attente n'est pas évident : elle a
          l'air inerte, elle immobilise pourtant le créneau pour tout le monde. */}
      {row.status === "PENDING" ? (
        <p className="flex items-start gap-2 text-xs text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          Tant que vous n&apos;avez pas répondu, ce créneau est bloqué pour tous
          les autres élèves.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Légende, en deux familles.
 *
 * Elle ne décrivait que les cours et « Ouvert », en laissant sans nom le gris
 * qui couvre le plus de surface et les hachures. Un lecteur rattache alors ce
 * gris à la seule entrée grise qu'on lui propose — « Passé » — et croit voir
 * des journées écoulées dans des dates à venir. Ce qui occupe l'écran doit être
 * nommé, sinon la légende oriente vers la mauvaise lecture.
 */
function Legend() {
  const lessons = [
    { label: "Confirmé", className: "border-primary/40 bg-primary-soft" },
    {
      label: "En attente",
      className: "border-dashed border-warning/60 bg-warning-soft",
    },
    { label: "Terminé", className: "border-success/40 bg-success-soft" },
    { label: "Absent", className: "border-danger/40 bg-danger-soft" },
  ];

  // Les pastilles reprennent **exactement** les fonds de la grille : une
  // légende qui décale d'une nuance renvoie vers la mauvaise lecture.
  const grid = [
    { label: "Ouvert", className: "border-border-strong bg-elevated" },
    { label: "Fermé", className: "border-border bg-surface-strong" },
    {
      label: "Congé",
      className: "border-border bg-elevated",
      style: { backgroundImage: HATCH },
    },
  ];

  const swatch = (item: {
    label: string;
    className: string;
    style?: React.CSSProperties;
  }) => (
    <span key={item.label} className="flex items-center gap-1.5">
      <span
        className={cn("h-3 w-3 shrink-0 rounded-xs border", item.className)}
        style={item.style}
      />
      {item.label}
    </span>
  );

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
      <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-subtle">Cours</span>
        {lessons.map(swatch)}
      </span>
      <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-subtle">Grille</span>
        {grid.map(swatch)}
      </span>
    </div>
  );
}

/** Heures pleines à graduer, bornes comprises. */
function hourMarks(startMinute: number, endMinute: number): number[] {
  const marks: number[] = [];

  for (let minute = startMinute; minute <= endMinute; minute += 60) {
    marks.push(minute);
  }

  return marks;
}

/**
 * "AAAA-MM-JJ" → Date à minuit UTC, forme sous laquelle Prisma rend une colonne
 * `@db.Date` et sous laquelle le moteur les relit.
 */
function civilDate(key: string | null): Date | null {
  return key ? new Date(`${key}T00:00:00Z`) : null;
}

/**
 * Intitulé de la semaine, à partir des dates civiles.
 *
 * Rendu en UTC, et c'est voulu : une clé AAAA-MM-JJ est déjà exprimée dans le
 * fuseau du prof, la relire dans un fuseau la décalerait une seconde fois.
 */
function weekLabel(days: { date: string }[]): string {
  const first = days[0].date;
  const last = days[days.length - 1].date;

  const render = (key: string, options: Intl.DateTimeFormatOptions) =>
    new Date(`${key}T00:00:00Z`).toLocaleDateString("fr-FR", {
      ...options,
      timeZone: "UTC",
    });

  const sameMonth = first.slice(0, 7) === last.slice(0, 7);

  return `${render(first, sameMonth ? { day: "numeric" } : { day: "numeric", month: "long" })} – ${render(last, { day: "numeric", month: "long", year: "numeric" })}`;
}

/** Titre de la vue jour : « Lundi 27 janvier », première lettre en capitale. */
function dayTitle(dateKey: string): string {
  const label = new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);

  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest}`;
}
