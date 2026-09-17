"use client";

import { useMemo, useState } from "react";
import type { InstrumentFamily } from "@prisma/client";
import {
  AlertTriangle,
  CalendarX,
  Check,
  GraduationCap,
  Loader2,
  MessageSquare,
  ShieldAlert,
  Sparkles,
  User,
  X,
} from "lucide-react";

import { InstrumentChip } from "@/components/instrument-chip";
import {
  LESSON_MODE_LABELS,
  LessonStatusBadge,
} from "@/components/lesson-status";
import {
  LEVEL_LABELS,
  StudentProfileBody,
  type Level,
  type StudentProfileView,
} from "@/components/student-profile-detail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatPrice } from "@/lib/format/price";
import { postJson } from "@/lib/http/failure";
import { groupBookings, isUrgent } from "@/lib/bookings/grouping";
import { notifyFailure, notifySuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";

export type BookingRow = {
  id: string;
  status:
    | "PENDING"
    | "CONFIRMED"
    | "CANCELLED"
    | "COMPLETED"
    | "NO_SHOW"
    | "DECLINED";
  startsAt: string;
  endsAt: string;
  /** Réception de la demande : ce qui date l'attente de l'élève. */
  createdAt: string;
  mode: "ONLINE" | "TEACHER_PLACE" | "STUDENT_PLACE";
  isTrial: boolean;
  priceCents: number | null;
  studentMessage: string | null;
  instrumentName: string;
  instrumentFamily: InstrumentFamily;
  studentName: string | null;

  // Résumé de carte : niveau sur l'instrument demandé uniquement.
  studentLevel: Level | null;
  studentYears: number | null;
  studentOwnsInstrument: boolean | null;
  studentReadsSheetMusic: boolean;
  studentGoals: string | null;
  studentAge: number | null;
  guardianContact: string | null;
  studentIsMinor: boolean;

  // Profil complet, montré dans la modale « Voir le profil ».
  studentProfile: StudentProfileView;
};

type Action = "confirm" | "decline" | "cancel" | "complete" | "no_show";

/** Onglet actif de la boîte de réception. */
export type BookingTab = "pending" | "upcoming" | "toReview" | "past";

// Confirmation affichée en toast selon l'action réussie.
const ACTION_SUCCESS: Record<Action, string> = {
  confirm: "Cours confirmé.",
  decline: "Demande refusée.",
  cancel: "Cours annulé.",
  complete: "Cours marqué comme donné.",
  no_show: "Élève marqué absent.",
};

/** Même ligne, dates converties : le regroupement raisonne sur des instants. */
type Enriched = Omit<BookingRow, "startsAt" | "endsAt"> & {
  startsAt: Date;
  endsAt: Date;
};

/**
 * Actions irréversibles, confirmées avant d'être envoyées. Le motif de refus
 * ou d'annulation est transmis à l'élève (`cancellationReason`) ; l'absence
 * n'en a pas.
 */
const DESTRUCTIVE: Partial<
  Record<
    Action,
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

// Libellés et teintes viennent de `components/lesson-status` : l'agenda, cette
// boîte et la fiche élève doivent nommer un état du même mot, sans quoi on croit
// en voir deux.
const MODE_LABELS = LESSON_MODE_LABELS;

export function TeacherBookings({
  initial,
  timezone,
  initialTab = "pending",
}: {
  initial: BookingRow[];
  timezone: string;
  /** Onglet d'arrivée, porté par `?onglet=` — l'accueil y renvoie directement. */
  initialTab?: BookingTab;
}) {
  const [rows, setRows] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Action irréversible en attente de confirmation.
  const [pending, setPending] = useState<{ id: string; action: Action } | null>(
    null
  );
  // Onglet affiché ; « en attente » par défaut, c'est là que se trouve
  // l'action, mais un lien peut en désigner un autre (« Cours à clôturer »
  // depuis l'accueil).
  const [tab, setTab] = useState<BookingTab>(initialTab);
  // Demande dont la modale « profil de l'élève » est ouverte.
  const [profileRow, setProfileRow] = useState<Enriched | null>(null);

  // `now` est figé au montage : recalculer à chaque rendu ferait sauter des
  // cours d'un groupe à l'autre pendant que le prof clique.
  const [now] = useState(() => new Date());

  const groups = useMemo(
    () =>
      groupBookings(
        rows.map((row) => ({
          ...row,
          startsAt: new Date(row.startsAt),
          endsAt: new Date(row.endsAt),
        })),
        now
      ),
    [rows, now]
  );

  const act = async (
    id: string,
    action: Action,
    reason?: string
  ): Promise<boolean> => {
    setBusyId(id);

    try {
      const result = await postJson<{ status: BookingRow["status"] }>(
        `/api/bookings/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify(reason ? { action, reason } : { action }),
        }
      );

      if (!result.ok) {
        notifyFailure(result.failure, { onRetry: () => act(id, action, reason) });
        return false;
      }

      setRows((current) =>
        current.map((row) =>
          row.id === id ? { ...row, status: result.data.status } : row
        )
      );
      notifySuccess(ACTION_SUCCESS[action]);
      return true;
    } finally {
      setBusyId(null);
    }
  };

  // Refuser, annuler et marquer absent passent par une confirmation ; le reste
  // part directement.
  const request = (id: string, action: Action) => {
    if (DESTRUCTIVE[action]) setPending({ id, action });
    else void act(id, action);
  };

  // Toujours dans le fuseau du prof : c'est son agenda qu'il consulte, pas
  // celui du navigateur depuis lequel il le consulte.
  const time = (date: Date) =>
    date.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    });
  const longDay = (date: Date) =>
    date.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: timezone,
    });
  const shortDay = (date: Date) =>
    date.toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: timezone,
    });

  const renderCard = (
    row: Enriched,
    actions: { action: Action; label: string; variant?: string; icon: typeof Check }[]
  ) => {
    const urgent = isUrgent(row, now);

    return (
      <div
        key={row.id}
        className={cn(
 "flex flex-col gap-3 rounded-lg border p-4",
          urgent
            ? "border-warning/40 bg-warning-soft"
            : "border-border"
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          {/* L'heure porte la carte, en Cormorant, comme partout ailleurs dans
              l'espace prof : c'est ce qu'on cherche en premier sur une demande,
              avant même de savoir qui l'envoie. */}
          <div className="flex min-w-0 items-start gap-3">
            <div className="shrink-0">
              <p className="font-display text-2xl font-semibold leading-none tabular-nums">
                {time(row.startsAt)}
              </p>
              <p className="mt-1 text-xs text-subtle first-letter:uppercase">
                {shortDay(row.startsAt)}
              </p>
            </div>

            <div className="min-w-0">
              <p className="truncate font-medium">
                {row.studentName ?? "Élève"}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted">
                <InstrumentChip
                  name={row.instrumentName}
                  family={row.instrumentFamily}
                  detail={row.studentLevel ? LEVEL_LABELS[row.studentLevel].toLowerCase() : null}
                  size="xs"
                />
                <span className="text-xs">{MODE_LABELS[row.mode]}</span>
                {row.priceCents !== null ? (
                  <span className="text-xs">{formatPrice(row.priceCents)}</span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {row.isTrial ? (
              <Badge variant="secondary">
                <Sparkles className="mr-1 h-3 w-3" />
                Essai
              </Badge>
            ) : null}
            {urgent ? (
              <Badge variant="secondary">
                <AlertTriangle className="mr-1 h-3 w-3 text-warning" />
                Bientôt
              </Badge>
            ) : null}
            <LessonStatusBadge status={row.status} />
          </div>
        </div>

        {/* Ce que coûte une demande laissée en attente : elle a l'air inerte,
            elle immobilise pourtant le créneau. Écrit sur la carte, pas
            seulement en tête d'onglet. */}
        {row.status === "PENDING" ? (
          <p className="text-xs text-muted">
            <span className="first-letter:uppercase">
              Demandé {shortDay(new Date(row.createdAt))}
            </span>
            {" · bloque ce créneau"}
          </p>
        ) : (
          <p className="text-xs text-subtle first-letter:uppercase">
            {longDay(row.startsAt)}
          </p>
        )}

        {/* Résumé ciblé + accès au profil complet en modale. Sans ce résumé,
            une demande arrive nue et le prof accepte à l'aveugle. */}
        <StudentSummary row={row} />

        <button
          type="button"
          onClick={() => setProfileRow(row)}
          className="flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <User className="h-3.5 w-3.5" />
          Voir le profil de l&apos;élève
        </button>

        {row.studentMessage ? (
          <p className="flex gap-2 rounded-md bg-surface p-3 text-sm text-muted">
            <MessageSquare className="mt-0.5 h-4 w-4 shrink-0" />
            {row.studentMessage}
          </p>
        ) : null}

        {actions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {actions.map(({ action, label, variant, icon: Icon }) => (
              <Button
                key={action}
                size="sm"
                variant={variant as "default"}
                disabled={busyId === row.id}
                onClick={() => request(row.id, action)}
              >
                {busyId === row.id ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : (
                  <Icon className="mr-2 h-3 w-3" />
                )}
                {label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  const tabs: { key: BookingTab; label: string; badge?: number }[] = [
    { key: "pending", label: "En attente", badge: groups.pending.length },
    { key: "upcoming", label: "À venir" },
    { key: "toReview", label: "À clôturer", badge: groups.toReview.length },
    { key: "past", label: "Historique" },
  ];

  const pendingSpec = pending ? DESTRUCTIVE[pending.action] : undefined;

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
          busy={busyId === pending.id}
          reason={
            pendingSpec.reason ? { label: pendingSpec.reason } : undefined
          }
          onConfirm={async (reason) => {
            const ok = await act(pending.id, pending.action, reason || undefined);
            if (ok) setPending(null);
          }}
        />
      ) : null}

      {/* Onglets : chaque section (en attente, à venir, à clôturer, historique)
          sur son propre onglet plutôt qu'empilées. État client local — la boîte
          garde ses mises à jour optimistes, inutile de passer par l'URL. */}
      <div className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1">
        {tabs.map((t) => {
          const isActive = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted hover:text-foreground"
              )}
            >
              {t.label}
              {t.badge ? (
                <span className="rounded-full bg-surface-strong px-1.5 text-xs font-semibold text-muted">
                  {t.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {tab === "pending" ? (
        <section className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Chaque demande bloque son créneau tant que vous n&apos;avez pas
            répondu : personne d&apos;autre ne peut le réserver.
          </p>
          <div className="flex flex-col gap-3">
            {groups.pending.length === 0 ? (
              <p className="text-sm text-subtle">Aucune demande en attente.</p>
            ) : (
              groups.pending.map((booking) =>
                renderCard(booking, [
                  { action: "confirm", label: "Confirmer", icon: Check },
                  {
                    action: "decline",
                    label: "Refuser",
                    variant: "outline",
                    icon: X,
                  },
                ])
              )
            )}
          </div>
        </section>
      ) : null}

      {tab === "upcoming" ? (
        <section className="flex flex-col gap-3">
          {groups.upcoming.length === 0 ? (
            <p className="text-sm text-subtle">Aucun cours confirmé à venir.</p>
          ) : (
            groups.upcoming.map((booking) =>
              renderCard(booking, [
                {
                  action: "cancel",
                  label: "Annuler",
                  variant: "outline",
                  icon: CalendarX,
                },
              ])
            )
          )}
        </section>
      ) : null}

      {tab === "toReview" ? (
        <section className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Ces cours sont passés. Les marquer comme terminés permettra à
            l&apos;élève de vous laisser un avis.
          </p>
          <div className="flex flex-col gap-3">
            {groups.toReview.length === 0 ? (
              <p className="text-sm text-subtle">Aucun cours à clôturer.</p>
            ) : (
              groups.toReview.map((booking) =>
                renderCard(booking, [
                  { action: "complete", label: "Cours donné", icon: Check },
                  {
                    action: "no_show",
                    label: "Élève absent",
                    variant: "outline",
                    icon: X,
                  },
                ])
              )
            )}
          </div>
        </section>
      ) : null}

      {tab === "past" ? (
        <section className="flex flex-col gap-3">
          {groups.past.length === 0 ? (
            <p className="text-sm text-subtle">Aucun cours passé.</p>
          ) : (
            groups.past.slice(0, 20).map((booking) => renderCard(booking, []))
          )}
        </section>
      ) : null}

      <Dialog
        open={profileRow !== null}
        onOpenChange={(open) => {
          if (!open) setProfileRow(null);
        }}
      >
        <DialogContent>
          {profileRow ? (
            <StudentProfileDetail
              name={profileRow.studentName}
              instrumentName={profileRow.instrumentName}
              profile={profileRow.studentProfile}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Profil complet de l'élève, en modale, ouvert depuis une demande. On y montre
 * tout ce que l'élève a renseigné ; on n'affiche que les champs remplis, pour
 * ne pas parsemer la fiche de « non renseigné ».
 */
function StudentProfileDetail({
  name,
  instrumentName,
  profile,
}: {
  name: string | null;
  instrumentName: string;
  profile: StudentProfileView;
}) {
  return (
    <div className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>{name ?? "Élève"}</DialogTitle>
        <DialogDescription>
          {[
            profile.age !== null ? `${profile.age} ans` : null,
            profile.city,
            `Demande : ${instrumentName}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </DialogDescription>
      </DialogHeader>

      <StudentProfileBody profile={profile} />
    </div>
  );
}

/**
 * Résumé de l'élève sur la carte : ce qui aide à décider d'un coup d'œil —
 * niveau sur l'instrument demandé, projet, et contact du responsable si mineur.
 * Le profil **complet** est à un clic, dans la modale « Voir le profil ».
 */
function StudentSummary({ row }: { row: Enriched }) {
  const facts = [
    row.studentLevel ? LEVEL_LABELS[row.studentLevel] : null,
    row.studentYears !== null
      ? `${row.studentYears} an${row.studentYears > 1 ? "s" : ""} de pratique`
      : null,
    row.studentReadsSheetMusic ? "lit le solfège" : null,
    row.studentOwnsInstrument === false ? "n'a pas l'instrument" : null,
    row.studentAge !== null ? `${row.studentAge} ans` : null,
  ].filter(Boolean) as string[];

  if (facts.length === 0 && !row.studentGoals && !row.studentIsMinor) {
    return (
      <p className="text-sm text-subtle">
        Cet élève n&apos;a pas renseigné son profil.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      {facts.length > 0 ? (
        <p className="flex flex-wrap items-center gap-2 text-muted">
          <GraduationCap className="h-4 w-4 shrink-0 text-subtle" />
          {facts.join(" · ")}
        </p>
      ) : null}

      {row.studentGoals ? (
        <p className="text-muted">
          <span className="text-subtle">Objectif : </span>
          {row.studentGoals}
        </p>
      ) : null}

      {row.studentIsMinor ? (
        <p className="flex items-start gap-2 rounded-md bg-primary-soft p-2 text-primary">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {row.guardianContact
            ? `Élève mineur — responsable : ${row.guardianContact}`
            : "Élève mineur — aucun contact de responsable renseigné."}
        </p>
      ) : null}
    </div>
  );
}
