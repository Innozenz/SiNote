"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { InstrumentFamily } from "@prisma/client";
import {
  CalendarX,
  FileText,
  Loader2,
  MapPin,
  Search,
  Sparkles,
  Star,
  Video,
} from "lucide-react";

import { InstrumentChip } from "@/components/instrument-chip";
import {
  LESSON_STATUS_LABELS,
  LESSON_STATUS_VARIANTS,
} from "@/components/lesson-status";
import { ReviewForm } from "@/components/review-form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { groupBookings } from "@/lib/bookings/grouping";
import { checkTransition } from "@/lib/bookings/transitions";
import { formatPrice } from "@/lib/format/price";
import { postJson } from "@/lib/http/failure";
import { notifyFailure, notifySuccess } from "@/lib/toast";

/**
 * Les cours de l'élève : le prochain, ceux qui viennent, ceux qui sont passés.
 *
 * Un seul composant client pour toute la colonne de gauche de « Mes cours »,
 * parce qu'une seule action y vit — annuler — et qu'elle doit pouvoir retirer
 * un cours de la carte *et* de la liste dans le même rendu. Les quatre onglets
 * d'avant (« En attente », « À venir », « En attente de clôture »,
 * « Historique ») demandaient à l'élève de deviner sous lequel se trouvait son
 * cours de jeudi ; il y a désormais une page, dans l'ordre du temps.
 *
 * Aucune règle de cycle de vie n'est réécrite ici : `groupBookings` classe,
 * `checkTransition` dit ce qui est offert, et `PATCH /api/bookings/[id]`
 * tranche. L'écran ne propose jamais ce que le serveur refuserait.
 */

export type StudentBookingRow = {
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
  meetingUrl: string | null;
  address: string | null;
  cancellationReason: string | null;
  instrumentName: string;
  instrumentFamily: InstrumentFamily;
  teacherName: string | null;
  teacherSlug: string;
  teacherId: string;
  teacherImage: string | null;
  /**
   * Fuseau du prof. Le cours a lieu à une heure et une seule : c'est celle-ci
   * que les deux parties lisent, ici comme dans les e-mails. Afficher à
   * chacun une heure différente est ce qui fait manquer les cours.
   */
  teacherTimezone: string;
  /** État du compte rendu ; `null` quand le prof n'en a pas ouvert. */
  report: { documented: boolean; attachmentCount: number } | null;
};

type Enriched = Omit<StudentBookingRow, "startsAt" | "endsAt"> & {
  startsAt: Date;
  endsAt: Date;
};

/**
 * Le lieu du cours est la seule chose qui ne peut **pas** être partagée avec le
 * prof : `LESSON_MODE_LABELS` dit « chez vous » pour le domicile du prof, ce
 * qui, lu par l'élève, désigne l'inverse exact. Deux tables, parce que le mot
 * juste dépend de qui lit.
 */
const MODE_LABELS: Record<StudentBookingRow["mode"], string> = {
  ONLINE: "en visio",
  TEACHER_PLACE: "chez le prof",
  STUDENT_PLACE: "chez vous",
};

/**
 * Les mêmes six mots que le prof — un état affiché sous deux noms se lit comme
 * deux états —, à **une** divergence près et elle est explicite : côté prof,
 * « En attente » signifie « à traiter » ; côté élève, l'attente est celle de la
 * réponse d'un autre, et le dire lève la question « en attente de quoi ? ».
 */
const STATUS_LABELS: Record<StudentBookingRow["status"], string> = {
  ...LESSON_STATUS_LABELS,
  PENDING: "En attente de sa réponse",
};

/** Au-delà, l'historique se lit dans le dossier du prof. */
const PAST_SHOWN = 10;

export function StudentLessons({
  initial,
  reviewableTeacherIds,
  responseHours = {},
}: {
  initial: StudentBookingRow[];
  /**
   * Profs dont un cours terminé autorise un avis et qui n'en ont pas encore
   * reçu de cet élève. Calculé côté serveur par `canReviewTeacher` — la même
   * règle que la route.
   */
  reviewableTeacherIds: string[];
  /** Délai de réponse habituel du prof, en heures, quand il est déductible. */
  responseHours?: Record<string, number | null>;
}) {
  const [rows, setRows] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingCancel, setPendingCancel] = useState<Enriched | null>(null);
  // Prof dont l'avis est en cours de rédaction, dans une fenêtre modale : le
  // formulaire existant, atteint depuis le cours qui y donne droit.
  const [reviewing, setReviewing] = useState<Enriched | null>(null);
  const [reviewed, setReviewed] = useState<string[]>([]);

  // Figé au montage : sans ça un cours changerait de section pendant la
  // lecture, sous les yeux de l'élève.
  const [now] = useState(() => new Date());

  const groups = useMemo(
    () =>
      groupBookings<Enriched>(
        rows.map((row) => ({
          ...row,
          startsAt: new Date(row.startsAt),
          endsAt: new Date(row.endsAt),
        })),
        now
      ),
    [rows, now]
  );

  // Le prochain cours confirmé porte la carte ; les autres font la liste.
  const next = groups.upcoming[0] ?? null;
  const upcoming = [...groups.pending, ...groups.upcoming.slice(1)].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime()
  );
  // « Passé » du point de vue de l'élève : le cours a eu lieu, que le prof
  // l'ait clôturé ou non. `toReview` est son attente à lui, pas la sienne.
  const past = [...groups.toReview, ...groups.past]
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
    .slice(0, PAST_SHOWN);

  const hasMorePast = groups.toReview.length + groups.past.length > past.length;

  const cancel = async (id: string, reason?: string): Promise<boolean> => {
    setBusyId(id);

    try {
      const result = await postJson<{
        status: StudentBookingRow["status"];
        lateCancellation?: boolean;
      }>(`/api/bookings/${id}`, {
        method: "PATCH",
        body: JSON.stringify(
          reason ? { action: "cancel", reason } : { action: "cancel" }
        ),
      });

      if (!result.ok) {
        notifyFailure(result.failure, { onRetry: () => cancel(id, reason) });
        return false;
      }

      setRows((current) =>
        current.map((row) =>
          row.id === id ? { ...row, status: result.data.status } : row
        )
      );

      // Annulation dans le préavis du prof : rien n'est facturé — il n'y a
      // pas de paiement en ligne — mais l'élève doit le savoir.
      if (result.data.lateCancellation) {
        notifySuccess(
          "Cours annulé.",
          "C'était dans le délai de préavis du prof — pensez à le prévenir directement."
        );
      } else {
        notifySuccess("Cours annulé.");
      }

      return true;
    } finally {
      setBusyId(null);
    }
  };

  /**
   * L'élève n'a qu'une action, et la machine à états la décide. La restriction
   * supplémentaire — avant la fin du cours — est une retenue d'écran, pas une
   * règle : annuler un cours déjà passé n'annule rien, il a eu lieu.
   */
  const canCancel = (row: Enriched) =>
    row.endsAt.getTime() > now.getTime() &&
    checkTransition({
      action: "cancel",
      currentStatus: row.status,
      actor: "student",
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      now,
    }).ok;

  const canReview = (row: Enriched) =>
    row.status === "COMPLETED" &&
    reviewableTeacherIds.includes(row.teacherId) &&
    !reviewed.includes(row.teacherId);

  return (
    <div className="flex min-w-0 flex-col gap-10">
      {pendingCancel ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setPendingCancel(null);
          }}
          title="Annuler ce cours ?"
          description={`${dayAndTime(pendingCancel, now)} avec ${pendingCancel.teacherName ?? "votre prof"}. Le créneau est libéré et le prof est prévenu. Si le cours est proche, prévenez-le aussi directement.`}
          confirmLabel="Annuler le cours"
          destructive
          busy={busyId === pendingCancel.id}
          reason={{
            label: "Un mot pour le prof (facultatif)",
            placeholder: "Empêchement, maladie, changement d'horaire…",
          }}
          onConfirm={async (reason) => {
            const ok = await cancel(pendingCancel.id, reason || undefined);
            if (ok) setPendingCancel(null);
          }}
        />
      ) : null}

      {reviewing ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setReviewing(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {`Votre avis sur ${reviewing.teacherName ?? "votre prof"}`}
              </DialogTitle>
            </DialogHeader>
            <ReviewForm
              teacherId={reviewing.teacherId}
              onDone={() => {
                // L'avis est global au prof : dès qu'il existe, plus aucun de
                // ses cours ne propose d'en écrire un second.
                setReviewed((current) => [...current, reviewing.teacherId]);
                setReviewing(null);
                notifySuccess("Avis publié.", "Merci — il aide les prochains élèves.");
              }}
              onCancel={() => setReviewing(null)}
            />
          </DialogContent>
        </Dialog>
      ) : null}

      {/* ------------------------------------------------------- Prochain cours */}
      {next ? (
        <NextLessonCard
          lesson={next}
          now={now}
          busy={busyId === next.id}
          onCancel={() => setPendingCancel(next)}
        />
      ) : (
        <div className="flex flex-col items-start gap-4 rounded-[var(--radius)] bg-surface px-5 py-6 sm:px-6">
          <div>
            <p className="font-display text-xl font-medium text-foreground">
              {groups.pending.length > 0
                ? "Le prof doit encore répondre"
                : "Aucun cours prévu"}
            </p>
            <p className="mt-1 text-sm text-muted">
              {groups.pending.length > 0
                ? "Votre demande tient le créneau : il n'est proposé à personne d'autre tant qu'il n'a pas tranché."
                : "Trouvez un prof et réservez un premier créneau — vous ne payez rien en ligne."}
            </p>
          </div>
          <Button asChild>
            <Link href="/profs">
              <Search className="h-4 w-4" />
              Trouver un prof
            </Link>
          </Button>
        </div>
      )}

      {/* --------------------------------------------------------------- À venir */}
      {upcoming.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionLabel>À venir</SectionLabel>
          <ul className="divide-y divide-border border-y border-border">
            {upcoming.map((row) => (
              <LessonRow
                key={row.id}
                row={row}
                now={now}
                busy={busyId === row.id}
                onCancel={canCancel(row) ? () => setPendingCancel(row) : undefined}
                onReview={undefined}
              />
            ))}
          </ul>

          {groups.pending.length > 0 ? (
            <p className="text-sm text-muted">{waitingHint(groups.pending, responseHours)}</p>
          ) : null}
        </section>
      ) : null}

      {/* ---------------------------------------------------------- Cours passés */}
      {past.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionLabel>Cours passés</SectionLabel>
          <ul className="divide-y divide-border border-y border-border">
            {past.map((row) => (
              <LessonRow
                key={row.id}
                row={row}
                now={now}
                busy={busyId === row.id}
                onCancel={canCancel(row) ? () => setPendingCancel(row) : undefined}
                onReview={canReview(row) ? () => setReviewing(row) : undefined}
              />
            ))}
          </ul>

          {hasMorePast ? (
            <Link
              href="/dashboard/dossiers"
              className="w-fit text-sm font-medium text-primary hover:underline"
            >
              Tout l&apos;historique, prof par prof →
            </Link>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-foreground">
      {children}
    </h2>
  );
}

/**
 * La seule carte de la page, et elle mérite son ombre : c'est la réponse à la
 * question qu'on vient poser — *c'est quand, et comment j'y vais ?*
 */
function NextLessonCard({
  lesson,
  now,
  busy,
  onCancel,
}: {
  lesson: Enriched;
  now: Date;
  busy: boolean;
  onCancel: () => void;
}) {
  const zone = lesson.teacherTimezone;
  const name = lesson.teacherName ?? "Votre prof";

  const details = [
    `jusqu'à ${lesson.endsAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: zone })}`,
    MODE_LABELS[lesson.mode],
    lesson.priceCents !== null
      ? `${formatPrice(lesson.priceCents)}, à régler à ${name}`
      : null,
  ].filter(Boolean);

  return (
    <article className="flex flex-col gap-5 rounded-[var(--radius)] border border-border bg-elevated p-5 shadow-lg sm:p-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">
          Prochain cours
        </p>
        <p
          className="mt-2 font-display font-semibold leading-tight text-foreground first-letter:uppercase"
          style={{ fontSize: "clamp(1.75rem, 6vw, 2.5rem)" }}
        >
          {dayAndTime(lesson, now)}
        </p>
        <p className="mt-1 text-sm text-muted">{details.join(" · ")}</p>
      </div>

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <Avatar className="h-11 w-11 shrink-0 border border-border">
          <AvatarImage src={lesson.teacherImage || undefined} alt={name} />
          <AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <Link
            href={`/dashboard/dossiers/${lesson.teacherId}`}
            className="font-medium hover:underline"
          >
            {name}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <InstrumentChip
              name={lesson.instrumentName}
              family={lesson.instrumentFamily}
            />
            {lesson.isTrial ? (
              <Badge variant="secondary">
                <Sparkles className="h-3 w-3" />
                Essai
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      {lesson.address ? (
        <p className="flex items-start gap-2 text-sm text-muted">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
          {lesson.address}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {lesson.meetingUrl ? (
          <Button asChild>
            <a
              href={lesson.meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Video className="h-4 w-4" />
              Rejoindre la visio
            </a>
          </Button>
        ) : null}

        <Button
          variant="ghost"
          size="sm"
          className="h-11 text-subtle hover:text-danger"
          disabled={busy}
          onClick={onCancel}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CalendarX className="h-3.5 w-3.5" />
          )}
          Annuler ce cours
        </Button>
      </div>
    </article>
  );
}

/** Une ligne de cours : la date à gauche, le prof au centre, l'état à droite. */
function LessonRow({
  row,
  now,
  busy,
  onCancel,
  onReview,
}: {
  row: Enriched;
  now: Date;
  busy: boolean;
  onCancel?: () => void;
  onReview?: () => void;
}) {
  const zone = row.teacherTimezone;
  const name = row.teacherName ?? "Prof";
  const isOver = row.endsAt.getTime() <= now.getTime();

  const hour = (date: Date) =>
    date.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: zone,
    });

  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:gap-4">
      {/* Bloc date : largeur fixe dès que la place le permet, pour que les
          lignes s'alignent et se lisent en colonne. */}
      <div className="shrink-0 sm:w-28">
        <p className="text-sm font-medium text-foreground first-letter:uppercase">
          {row.startsAt.toLocaleDateString("fr-FR", {
            weekday: "short",
            day: "numeric",
            month: "short",
            timeZone: zone,
          })}
        </p>
        <p className="text-sm tabular-nums text-muted">
          {`${hour(row.startsAt)} → ${hour(row.endsAt)}`}
        </p>
      </div>

      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Avatar className="h-9 w-9 shrink-0 border border-border">
          <AvatarImage src={row.teacherImage || undefined} alt={name} />
          <AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">
            <Link
              href={`/dashboard/dossiers/${row.teacherId}`}
              className="font-medium hover:underline"
            >
              {name}
            </Link>
            <span className="text-muted">{` · ${row.instrumentName}`}</span>
          </p>

          <ReportOrMode row={row} isOver={isOver} />

          {row.cancellationReason ? (
            <p className="mt-1 text-sm text-subtle">
              {`Motif : ${row.cancellationReason}`}
            </p>
          ) : null}

          {onCancel || onReview ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {onReview ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11"
                  onClick={onReview}
                >
                  <Star className="h-3.5 w-3.5 fill-accent text-accent" />
                  Donner un avis
                </Button>
              ) : null}
              {onCancel ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-11 text-subtle hover:text-danger"
                  disabled={busy}
                  onClick={onCancel}
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CalendarX className="h-3.5 w-3.5" />
                  )}
                  Annuler
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:justify-end">
        {row.isTrial ? (
          <Badge variant="secondary">
            <Sparkles className="h-3 w-3" />
            Essai
          </Badge>
        ) : null}
        <Badge variant={LESSON_STATUS_VARIANTS[row.status]}>
          {STATUS_LABELS[row.status]}
        </Badge>
      </div>
    </li>
  );
}

/**
 * Sous-ligne d'une ligne de cours : ce qui est utile *avant* le cours (où, à
 * quel prix), ce qui l'est après (le compte rendu, ou son absence). Un cours
 * passé dont le prof a ouvert un compte rendu vide n'est pas muet : « en cours
 * d'écriture » vaut mieux que rien, qui se lit « il a oublié ».
 */
function ReportOrMode({ row, isOver }: { row: Enriched; isOver: boolean }) {
  if (isOver && row.report) {
    if (!row.report.documented) {
      return (
        <p className="mt-0.5 text-sm text-subtle">
          Compte rendu en cours d&apos;écriture
        </p>
      );
    }

    const count = row.report.attachmentCount;

    return (
      <Link
        href={`/dashboard/dossiers/${row.teacherId}?onglet=comptes-rendus#cr-${row.id}`}
        className="mt-0.5 flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <FileText className="h-3.5 w-3.5" />
        Lire le compte rendu
        {count > 0
          ? ` · ${count} ${count === 1 ? "pièce jointe" : "pièces jointes"}`
          : null}
      </Link>
    );
  }

  const parts = [
    MODE_LABELS[row.mode],
    row.priceCents !== null ? formatPrice(row.priceCents) : null,
  ].filter(Boolean);

  return <p className="mt-0.5 text-sm text-muted first-letter:uppercase">{parts.join(" · ")}</p>;
}

/* -------------------------------------------------------------------------- */

/** « Aujourd'hui · 10:00 », « Demain · 09:00 », « Vendredi 18 · 09:00 ». */
function dayAndTime(lesson: Enriched, now: Date): string {
  const zone = lesson.teacherTimezone;
  const hour = lesson.startsAt.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zone,
  });

  // Comparaison de dates civiles lues à l'horloge dans le fuseau du prof :
  // soustraire des millisecondes se tromperait les jours de changement d'heure.
  const key = (date: Date) =>
    date.toLocaleDateString("en-CA", { timeZone: zone });

  const todayKey = key(now);
  const lessonKey = key(lesson.startsAt);

  if (lessonKey === todayKey) return `Aujourd'hui · ${hour}`;

  const tomorrow = new Date(now.getTime() + 86_400_000);
  if (lessonKey === key(tomorrow)) return `Demain · ${hour}`;

  const day = lesson.startsAt.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    timeZone: zone,
  });

  return `${day} · ${hour}`;
}

/**
 * Ce qu'on dit à qui attend.
 *
 * Le délai habituel n'est annoncé que s'il a été mesuré sur les réponses
 * passées du prof ; inventer « sous 24 h » pour rassurer serait une promesse
 * que personne n'a faite. Ce qui est vrai dans tous les cas, en revanche, et
 * qui est la vraie question : le créneau ne file pas à quelqu'un d'autre.
 */
function waitingHint(
  pending: Enriched[],
  responseHours: Record<string, number | null>
): string {
  const held = "Le créneau vous est réservé en attendant.";

  if (pending.length !== 1) {
    return "Les créneaux demandés vous sont réservés en attendant leur réponse.";
  }

  const row = pending[0];
  const hours = responseHours[row.teacherId] ?? null;

  if (hours === null) {
    return "Le créneau vous est réservé en attendant sa réponse.";
  }

  const delay = hours < 24 ? `${hours} h` : `${Math.round(hours / 24)} j`;

  return `${row.teacherName ?? "Votre prof"} répond en général sous ${delay}. ${held}`;
}
