"use client";

import { useState } from "react";
import Link from "next/link";
import type { BookingStatus, InstrumentFamily } from "@prisma/client";
import { CalendarX, Check, FileText, Loader2, Video, X } from "lucide-react";

import { InstrumentChip } from "@/components/instrument-chip";
import {
  LESSON_MODE_LABELS,
  LessonStatusBadge,
} from "@/components/lesson-status";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { checkTransition, type BookingAction } from "@/lib/bookings/transitions";
import { postJson } from "@/lib/http/failure";
import { canDocument } from "@/lib/reports/eligibility";
import { notifyFailure, notifySuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * Le fil des cours d'un élève, vu par son prof.
 *
 * C'est l'onglet « Cours » du dossier : chaque ligne dit quand, quoi, où, et
 * **où en est son compte rendu** — la seule chose que ni l'agenda ni la boîte de
 * réception ne montrent. Un cours passé sans compte rendu n'a l'air de rien
 * nulle part ailleurs ; ici il le dit.
 *
 * Aucune règle de cycle de vie n'est réécrite : les boutons sortent de
 * `checkTransition`, l'état du compte rendu de `canDocument`.
 */
export type StudentLessonRow = {
  id: string;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
  mode: "ONLINE" | "TEACHER_PLACE" | "STUDENT_PLACE";
  isTrial: boolean;
  /** Adresse de visio, quand le prof l'a renseignée. */
  meetingUrl: string | null;
  /** Ce que l'élève a écrit en réservant — sa demande, dans ses mots. */
  studentMessage: string | null;
  instrumentName: string;
  instrumentFamily: InstrumentFamily;
  /** Compte rendu déjà ouvert : nombre de pièces jointes, et lu ou non. */
  report: { attachments: number; seen: boolean } | null;
};

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

const ACTION_SUCCESS: Record<BookingAction, string> = {
  confirm: "Cours confirmé.",
  decline: "Demande refusée.",
  cancel: "Cours annulé.",
  complete: "Cours marqué comme donné.",
  no_show: "Élève marqué absent.",
};

const ACTIONS: {
  action: BookingAction;
  label: string;
  icon: typeof Check;
  variant?: "outline" | "success";
}[] = [
  { action: "confirm", label: "Confirmer", icon: Check, variant: "success" },
  { action: "decline", label: "Refuser", icon: X, variant: "outline" },
  { action: "complete", label: "Terminé", icon: Check, variant: "success" },
  { action: "no_show", label: "Absent", icon: X, variant: "outline" },
  { action: "cancel", label: "Annuler", icon: CalendarX, variant: "outline" },
];

export function TeacherStudentLessons({
  initial,
  timezone,
  basePath,
}: {
  initial: StudentLessonRow[];
  timezone: string;
  /** Racine du dossier, pour l'ancre du compte rendu. */
  basePath: string;
}) {
  const [rows, setRows] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    id: string;
    action: BookingAction;
  } | null>(null);

  // Figé au montage : recalculer à chaque rendu ferait apparaître et
  // disparaître des boutons pendant que le prof clique.
  const [now] = useState(() => new Date());

  const act = async (
    id: string,
    action: BookingAction,
    reason?: string
  ): Promise<boolean> => {
    setBusyId(id);

    try {
      const result = await postJson<{ status: BookingStatus }>(
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

  const day = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: timezone,
    });
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    });

  const spec = pending ? DESTRUCTIVE[pending.action] : undefined;
  // Calculé une fois sur le `now` figé, pas à chaque ligne : deux appels à
  // `new Date()` dans un rendu peuvent tomber de part et d'autre de minuit.
  const todayLabel = day(now.toISOString());

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
        Aucun cours avec cet élève pour l&apos;instant.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {pending && spec ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setPending(null);
          }}
          title={spec.title}
          description={spec.description}
          confirmLabel={spec.confirm}
          destructive
          busy={busyId === pending.id}
          reason={spec.reason ? { label: spec.reason } : undefined}
          onConfirm={async (reason) => {
            const ok = await act(pending.id, pending.action, reason || undefined);
            if (ok) setPending(null);
          }}
        />
      ) : null}

      <ul className="divide-y divide-border border-y border-border">
        {rows.map((row) => {
          const startsAt = new Date(row.startsAt);
          const endsAt = new Date(row.endsAt);
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
          const documentable = canDocument(row.status, startsAt, now);

          const written = row.report !== null;
          // « aujourd'hui » se lit plus vite qu'une date qu'il faut rapprocher
          // de celle du jour, et c'est la seule que l'on cherche vraiment.
          const isToday = day(row.startsAt) === todayLabel;
          const joinable =
            row.status === "CONFIRMED" &&
            row.mode === "ONLINE" &&
            row.meetingUrl !== null &&
            endsAt > now;

          return (
            // Trois colonnes : quand, quoi, où ça en est. La date mène la ligne
            // — c'est un fil chronologique, pas un agenda : l'heure seule ne
            // situe rien dans une liste qui descend sur trois mois.
            <li
              key={row.id}
              className="grid gap-x-5 gap-y-3 py-[18px] sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <p className="font-medium first-letter:uppercase">
                  {day(row.startsAt)}
                </p>
                <p className="text-sm tabular-nums text-muted">
                  {time(row.startsAt)} → {time(row.endsAt)}
                  {isToday ? " · aujourd'hui" : ""}
                </p>
              </div>

              <div className="flex min-w-0 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <InstrumentChip
                    name={row.instrumentName}
                    family={row.instrumentFamily}
                    detail={row.isTrial ? "essai" : null}
                  />
                  <span className="text-sm text-muted">
                    {LESSON_MODE_LABELS[row.mode]}
                  </span>
                </span>

                {row.studentMessage ? (
                  <span className="line-clamp-2 text-sm italic text-muted">
                    «&nbsp;{row.studentMessage}&nbsp;»
                  </span>
                ) : null}

                {/* L'état du compte rendu, en clair sous le cours : à écrire (le
                    prof le doit encore) ou envoyé, avec ce qu'il contient et
                    s'il a été lu. C'est la seule chose que ni l'agenda ni la
                    boîte de réception ne montrent. */}
                {documentable ? (
                  <Link
                    href={`${basePath}?onglet=comptes-rendus#cr-${row.id}`}
                    className={cn(
                      "flex w-fit items-center gap-1.5 text-sm hover:underline",
                      written ? "text-success" : "text-warning"
                    )}
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    {written && row.report
                      ? [
                          "Compte rendu envoyé",
                          row.report.attachments > 0
                            ? `${row.report.attachments} pièce${row.report.attachments > 1 ? "s" : ""} jointe${row.report.attachments > 1 ? "s" : ""}`
                            : null,
                          row.report.seen ? "lu" : "non lu",
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : "Compte rendu à écrire"}
                  </Link>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <LessonStatusBadge status={row.status} />

                {joinable && row.meetingUrl ? (
                  <Button size="sm" asChild>
                    <a
                      href={row.meetingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Video className="mr-2 h-3 w-3" />
                      Rejoindre
                    </a>
                  </Button>
                ) : null}

                {allowed.map(({ action, label, icon: Icon, variant }) => (
                  <Button
                    key={action}
                    size="sm"
                    variant={variant}
                    disabled={busyId === row.id}
                    onClick={() =>
                      DESTRUCTIVE[action]
                        ? setPending({ id: row.id, action })
                        : void act(row.id, action)
                    }
                  >
                    {busyId === row.id ? (
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    ) : (
                      <Icon className="mr-2 h-3 w-3" />
                    )}
                    {label}
                  </Button>
                ))}

                {written ? (
                  <Button size="sm" variant="ghost" asChild>
                    <Link
                      href={`${basePath}?onglet=comptes-rendus#cr-${row.id}`}
                    >
                      Relire
                    </Link>
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
