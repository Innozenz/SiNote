"use client";

import { useMemo, useState } from "react";
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

import {
  LEVEL_LABELS,
  StudentProfileBody,
  type Level,
  type StudentProfileView,
} from "@/components/student-profile-detail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  mode: "ONLINE" | "TEACHER_PLACE" | "STUDENT_PLACE";
  isTrial: boolean;
  priceCents: number | null;
  studentMessage: string | null;
  instrumentName: string;
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
type BookingTab = "pending" | "upcoming" | "toReview" | "past";

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

const MODE_LABELS: Record<BookingRow["mode"], string> = {
  ONLINE: "Visio",
  TEACHER_PLACE: "Chez vous",
  STUDENT_PLACE: "Chez l'élève",
};

const STATUS_LABELS: Record<BookingRow["status"], string> = {
  PENDING: "En attente",
  CONFIRMED: "Confirmé",
  CANCELLED: "Annulé",
  COMPLETED: "Terminé",
  NO_SHOW: "Non honoré",
  DECLINED: "Refusé",
};

export function TeacherBookings({
  initial,
  timezone,
}: {
  initial: BookingRow[];
  timezone: string;
}) {
  const [rows, setRows] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Onglet affiché ; « en attente » par défaut, c'est là que se trouve l'action.
  const [tab, setTab] = useState<BookingTab>("pending");
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

  const act = async (id: string, action: Action) => {
    setBusyId(id);

    try {
      const result = await postJson<{ status: BookingRow["status"] }>(
        `/api/bookings/${id}`,
        { method: "PATCH", body: JSON.stringify({ action }) }
      );

      if (!result.ok) {
        notifyFailure(result.failure, { onRetry: () => act(id, action) });
        return;
      }

      setRows((current) =>
        current.map((row) =>
          row.id === id ? { ...row, status: result.data.status } : row
        )
      );
      notifySuccess(ACTION_SUCCESS[action]);
    } finally {
      setBusyId(null);
    }
  };

  // Toujours dans le fuseau du prof : c'est son agenda qu'il consulte, pas
  // celui du navigateur depuis lequel il le consulte.
  const format = (date: Date) =>
    date.toLocaleString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
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
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">
              {row.studentName ?? "Élève"} — {row.instrumentName}
            </p>
            <p className="text-sm text-muted">
              {format(row.startsAt)} · {MODE_LABELS[row.mode]}
              {row.priceCents !== null
                ? ` · ${(row.priceCents / 100).toFixed(2)} €`
                : ""}
            </p>
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
            {row.status !== "PENDING" && row.status !== "CONFIRMED" ? (
              <Badge variant="secondary">{STATUS_LABELS[row.status]}</Badge>
            ) : null}
          </div>
        </div>

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
                onClick={() => act(row.id, action)}
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

  return (
    <div className="flex flex-col gap-6">
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
