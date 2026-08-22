"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import {
  CalendarX,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Globe,
  Home,
  Info,
  Loader2,
  MapPin,
  MessageSquare,
  Sparkles,
  User,
  X,
} from "lucide-react";

import {
  AgendaViewSwitch,
  type AgendaNav,
} from "@/components/agenda-view-switch";
import {
  StudentProfileBody,
  type StudentProfileView,
} from "@/components/student-profile-detail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { checkTransition, type BookingAction } from "@/lib/bookings/transitions";
import { canDocument } from "@/lib/reports/eligibility";
import { postJson } from "@/lib/http/failure";
import { notifyFailure, notifySuccess } from "@/lib/toast";
import {
  localMinutesInZone,
  MINUTES_PER_DAY,
  wallClockToInstant,
} from "@/lib/availability/zone";
import {
  buildWeekAgenda,
  closedGaps,
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
  mode: "ONLINE" | "TEACHER_PLACE" | "STUDENT_PLACE";
  isTrial: boolean;
  priceCents: number | null;
  studentMessage: string | null;
  instrumentName: string;
  studentId: string;
  studentName: string | null;
  /** Profil complet de l'élève, montré dans la modale « Voir le profil ». */
  studentProfile: StudentProfileView;
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

const WEEKDAY_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const MODE_LABELS: Record<AgendaRow["mode"], string> = {
  ONLINE: "Visio",
  TEACHER_PLACE: "Chez vous",
  STUDENT_PLACE: "Chez l'élève",
};

const STATUS_LABELS: Record<AgendaRow["status"], string> = {
  PENDING: "En attente",
  CONFIRMED: "Confirmé",
  COMPLETED: "Terminé",
  NO_SHOW: "Non honoré",
};

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

const ACTIONS: {
  action: BookingAction;
  label: string;
  icon: typeof Check;
  variant?: "outline";
}[] = [
  { action: "confirm", label: "Confirmer", icon: Check },
  { action: "decline", label: "Refuser", icon: X, variant: "outline" },
  { action: "complete", label: "Cours donné", icon: Check },
  { action: "no_show", label: "Élève absent", icon: X, variant: "outline" },
  { action: "cancel", label: "Annuler", icon: CalendarX, variant: "outline" },
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

export function TeacherAgenda({
  rows: initial,
  rules,
  exceptions,
  weekStart,
  days,
  view,
  timezone,
  granularityMin,
  nav,
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
  /** Cibles de navigation, calculées côté serveur (l'état vit dans l'URL). */
  nav: AgendaNav;
}) {
  const [rows, setRows] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Modale « profil de l'élève », ouverte par-dessus le détail du cours.
  const [showProfile, setShowProfile] = useState(false);
  const [busy, setBusy] = useState(false);

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
    setShowProfile(false);
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
  const lessons = rows.filter(
    (row) => row.status === "PENDING" || row.status === "CONFIRMED"
  );

  // Durée réelle, pas murale : c'est du temps de travail, pas des lignes de
  // grille. Les deux diffèrent les jours de changement d'heure.
  const totalMinutes = lessons.reduce(
    (sum, row) =>
      sum +
      (new Date(row.endsAt).getTime() - new Date(row.startsAt).getTime()) /
        60_000,
    0
  );

  const act = async (id: string, action: BookingAction) => {
    setBusy(true);

    try {
      const result = await postJson<{
        status: AgendaRow["status"] | "CANCELLED" | "DECLINED";
        lateCancellation?: boolean;
      }>(`/api/bookings/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });

      if (!result.ok) {
        notifyFailure(result.failure, { onRetry: () => act(id, action) });
        return;
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
        return;
      }

      setRows((current) =>
        current.map((row) => (row.id === id ? { ...row, status } : row))
      );
      notifySuccess(ACTION_SUCCESS[action]);
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

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>
                {lessons.length === 0
                  ? "Aucun cours prévu."
                  : `${lessons.length} cours · ${formatDuration(totalMinutes)}`}
              </CardDescription>
            </div>

            {/* Vue et navigation vivent dans l'URL (partageable, favori, retour
                arrière). Les cibles sont calculées côté serveur. */}
            <div className="flex flex-wrap items-center gap-2">
              <AgendaViewSwitch view={view} nav={nav} />

              <div className="flex items-center gap-1">
                <Button asChild variant="outline" size="sm">
                  <Link href={nav.previousHref} aria-label="Précédent">
                    <ChevronLeft className="h-4 w-4" />
                  </Link>
                </Button>
                {/* Le raccourci ne s'affiche que lorsqu'il mène ailleurs. */}
                {nav.currentHref ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={nav.currentHref}>{nav.currentLabel}</Link>
                  </Button>
                ) : null}
                <Button asChild variant="outline" size="sm">
                  <Link href={nav.nextHref} aria-label="Suivant">
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
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
                <div className="sticky left-0 z-20 w-12 shrink-0 bg-elevated" />
                {agenda.days.map((day) => (
                  <DayHeader key={day.date} day={day} />
                ))}
              </div>

              <div className="flex" style={{ height }}>
                <div className="sticky left-0 z-20 w-12 shrink-0 bg-elevated">
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

                  {/* Repère « maintenant », posé par-dessus la colonne du jour. */}
                  {showNow ? (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute z-10 h-px bg-accent"
                      style={{
                        top: `${offset(nowMinute)}%`,
                        left: `${(todayIndex / agenda.days.length) * 100}%`,
                        width: `${100 / agenda.days.length}%`,
                      }}
                    >
                      <span className="absolute -left-[3px] -top-[3px] h-[7px] w-[7px] rounded-full bg-accent" />
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

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
            setShowProfile(false);
          }
        }}
      >
        <DialogContent>
          {selected ? (
            <BookingDetail
              row={selected}
              timezone={timezone}
              now={now}
              busy={busy}
              onAct={act}
              onShowProfile={() => setShowProfile(true)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Profil complet de l'élève, par-dessus le détail du cours — même contenu
          que la modale « Voir le profil » des demandes. */}
      <Dialog
        open={showProfile && selected !== null}
        onOpenChange={(open) => {
          if (!open) setShowProfile(false);
        }}
      >
        <DialogContent>
          {selected ? (
            <div className="flex flex-col gap-5">
              <DialogHeader>
                <DialogTitle>{selected.studentName ?? "Élève"}</DialogTitle>
                <DialogDescription>
                  {[
                    selected.studentProfile.age !== null
                      ? `${selected.studentProfile.age} ans`
                      : null,
                    selected.studentProfile.city,
                    selected.instrumentName,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </DialogDescription>
              </DialogHeader>

              <StudentProfileBody profile={selected.studentProfile} />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
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

  // Plages fermées (le gris) à nommer : « Fermé » à même la bande, comme
  // « Congé » sur la hachure. Sur une journée sans aucune ouverture, c'est un
  // seul gros trou → un « Fermé » centré ; sur une journée partielle, un par
  // creux assez haut.
  const gaps = closedGaps(day.open, rangeStart, rangeEnd);

  return (
    // Gris par défaut : hors des plages ouvertes, personne ne peut réserver.
    // C'est le fond qui porte l'information, la couche blanche des ouvertures
    // se posant par-dessus.
    <div className="relative flex-1 border-l border-border bg-surface-strong">
      {/* Ouvertures : le blanc dit « réservable », sans avoir à l'écrire. */}
      {day.open.map((interval) => (
        <div
          key={`open-${interval.start}`}
          className="absolute inset-x-0 bg-background"
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
          className="absolute inset-x-0 flex items-center justify-center overflow-hidden bg-background"
          style={{ ...band(interval.start, interval.end), backgroundImage: HATCH }}
          title="Congé"
        >
          {interval.end - interval.start >= 45 ? (
            <span className="pointer-events-none rounded bg-background/85 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted">
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

      {/* « Fermé » au centre de chaque plage fermée assez haute — au-dessus des
          lignes horaires, sous les cours (un cours posé sur un créneau fermé le
          recouvre). Les creux trop courts restent muets pour ne pas charger. */}
      {gaps.map((gap) =>
        gap.end - gap.start >= 45 ? (
          <span
            key={`closed-label-${gap.start}`}
            className="pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-background/85 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted"
            style={{ top: `${offset((gap.start + gap.end) / 2)}%` }}
          >
            Fermé
          </span>
        ) : null
      )}

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

function BookingDetail({
  row,
  timezone,
  now,
  busy,
  onAct,
  onShowProfile,
}: {
  row: AgendaRow;
  timezone: string;
  now: Date;
  busy: boolean;
  onAct: (id: string, action: BookingAction) => void;
  /** Ouvre la modale du profil complet de l'élève. */
  onShowProfile: () => void;
}) {
  const startsAt = new Date(row.startsAt);
  const endsAt = new Date(row.endsAt);

  // Les actions proposées sortent de la machine à états, pas d'une liste
  // recopiée : cette modale ne peut donc pas offrir ce que le serveur
  // refuserait.
  const allowed = ACTIONS.filter(
    (entry) =>
      checkTransition({
        action: entry.action,
        currentStatus: row.status,
        actor: "teacher",
        startsAt,
        endsAt,
        now,
      }).ok
  );

  // Le compte rendu s'ouvre dès que le cours a commencé (confirmé ou terminé) —
  // même règle que l'atelier et la fiche élève. Le lien pointe sur l'ancre du
  // bon compte rendu dans la fiche élève, comme le fait l'historique.
  const documentable = canDocument(row.status, startsAt, now);

  const format = (date: Date, options: Intl.DateTimeFormatOptions) =>
    date.toLocaleString("fr-FR", { ...options, timeZone: timezone });

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>
          {row.studentName ?? "Élève"}
          <span className="text-muted"> — {row.instrumentName}</span>
        </DialogTitle>
        <DialogDescription>
          <span className="first-letter:uppercase">
            {format(startsAt, {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
          {" · "}
          {format(startsAt, { hour: "2-digit", minute: "2-digit" })}
          {" – "}
          {format(endsAt, { hour: "2-digit", minute: "2-digit" })}
        </DialogDescription>
      </DialogHeader>

      {/* Détails en lignes : mode, tarif, statut, essai. */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{STATUS_LABELS[row.status]}</Badge>
        <Badge variant="secondary">{MODE_LABELS[row.mode]}</Badge>
        {row.priceCents !== null ? (
          <Badge variant="secondary">
            {`${(row.priceCents / 100).toFixed(2)} €`}
          </Badge>
        ) : null}
        {row.isTrial ? (
          <Badge variant="secondary">
            <Sparkles className="mr-1 h-3 w-3" />
            Essai
          </Badge>
        ) : null}
      </div>

      {row.studentMessage ? (
        <p className="flex gap-2 rounded-md bg-surface p-3 text-sm text-muted">
          <MessageSquare className="mt-0.5 h-4 w-4 shrink-0" />
          {row.studentMessage}
        </p>
      ) : null}

      {allowed.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {allowed.map(({ action, label, icon: Icon, variant }) => (
            <Button
              key={action}
              size="sm"
              variant={variant}
              disabled={busy}
              onClick={() => onAct(row.id, action)}
            >
              {busy ? (
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              ) : (
                <Icon className="mr-2 h-3 w-3" />
              )}
              {label}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-subtle">
          Ce cours n&apos;attend plus rien de vous.
        </p>
      )}

      {/* Profil en modale (aperçu rapide) et accès à la fiche complète de
          l'élève (historique, note privée, comptes rendus). */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onShowProfile}>
          <User className="mr-2 h-3 w-3" />
          Voir le profil
        </Button>

        <Button asChild variant="outline" size="sm">
          <Link href={`/dashboard/prof/eleves/${row.studentId}`}>
            <User className="mr-2 h-3 w-3" />
            Fiche complète
          </Link>
        </Button>

        {documentable ? (
          <Button asChild variant="outline" size="sm">
            <Link
              href={`/dashboard/prof/eleves/${row.studentId}?onglet=comptes-rendus#cr-${row.id}`}
            >
              <FileText className="mr-2 h-3 w-3" />
              Compte rendu
            </Link>
          </Button>
        ) : null}
      </div>
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
    { label: "Non honoré", className: "border-danger/40 bg-danger-soft" },
  ];

  const grid = [
    { label: "Ouvert", className: "border-border bg-background" },
    { label: "Fermé", className: "border-border bg-surface-strong" },
    {
      label: "Congé",
      className: "border-border bg-background",
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
