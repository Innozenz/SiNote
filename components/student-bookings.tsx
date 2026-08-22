"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarX,
  Loader2,
  MapPin,
  Search,
  Sparkles,
  Star,
  Video,
} from "lucide-react";

import { SectionTitle } from "@/components/editorial";
import { ReviewForm } from "@/components/review-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Stars } from "@/components/ui/stars";
import { ReportViewer, type ReportView } from "@/components/report-view";
import { postJson } from "@/lib/http/failure";
import { groupBookings } from "@/lib/bookings/grouping";
import { checkReviewable } from "@/lib/reviews/eligibility";
import { notifyFailure, notifySuccess } from "@/lib/toast";

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
  teacherName: string | null;
  teacherSlug: string;
  /** Avis déjà déposé sur ce cours, s'il y en a un. */
  review: {
    rating: number;
    comment: string | null;
    /** Faux si la modération l'a retiré : l'élève doit le savoir. */
    published: boolean;
  } | null;
  /** Compte rendu rédigé par le prof, s'il existe. */
  report: ReportView | null;
};

type Enriched = Omit<StudentBookingRow, "startsAt" | "endsAt"> & {
  startsAt: Date;
  endsAt: Date;
};

const MODE_LABELS: Record<StudentBookingRow["mode"], string> = {
  ONLINE: "Visio",
  TEACHER_PLACE: "Chez le prof",
  STUDENT_PLACE: "Chez vous",
};

const STATUS_LABELS: Record<StudentBookingRow["status"], string> = {
  PENDING: "En attente",
  CONFIRMED: "Confirmé",
  CANCELLED: "Annulé",
  COMPLETED: "Terminé",
  NO_SHOW: "Non honoré",
  DECLINED: "Refusé",
};

export function StudentBookings({
  initial,
  timezone,
}: {
  initial: StudentBookingRow[];
  timezone: string;
}) {
  const [rows, setRows] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Cours dont le formulaire d'avis est ouvert. */
  const [reviewing, setReviewing] = useState<string | null>(null);

  // Figé au montage : sans ça, un cours changerait de section pendant que
  // l'élève est sur la page.
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

  /**
   * Cours en attente d'avis, remontés dans leur propre section.
   *
   * Ils vivent sinon dans l'historique, tronqué à vingt lignes : la
   * sollicitation la plus utile — juste après un cours qui s'est bien passé —
   * y serait invisible. Même règle que côté serveur, via `checkReviewable`.
   */
  const awaitingReview = useMemo(
    () =>
      groups.past.filter(
        (row) =>
          checkReviewable(
            {
              status: row.status,
              endsAt: row.endsAt,
              // L'appartenance est déjà acquise : ces cours sont ceux de
              // l'élève connecté. On neutralise ce volet de la règle.
              studentId: "self",
              hasReview: row.review !== null,
            },
            "self",
            now
          ).ok
      ),
    [groups.past, now]
  );

  const cancel = async (id: string) => {
    setBusyId(id);

    try {
      const result = await postJson<{
        status: StudentBookingRow["status"];
        lateCancellation?: boolean;
      }>(`/api/bookings/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "cancel" }),
      });

      if (!result.ok) {
        notifyFailure(result.failure, { onRetry: () => cancel(id) });
        return;
      }

      setRows((current) =>
        current.map((row) =>
          row.id === id ? { ...row, status: result.data.status } : row
        )
      );

      // Le serveur signale une annulation tardive : le prof avait fixé un
      // préavis. Rien n'est facturé, mais l'élève doit le savoir — d'où la
      // précision en description du toast.
      if (result.data.lateCancellation) {
        notifySuccess(
          "Cours annulé.",
          "C'était dans le délai de préavis du prof — pensez à le prévenir directement."
        );
      } else {
        notifySuccess("Cours annulé.");
      }
    } finally {
      setBusyId(null);
    }
  };

  // L'élève n'a qu'une seule action, et seulement tant que le cours n'a pas eu
  // lieu : confirmer, refuser et clôturer appartiennent au prof.
  const canCancel = (row: Enriched) =>
    (row.status === "PENDING" || row.status === "CONFIRMED") &&
    row.endsAt.getTime() > now.getTime();

  const format = (date: Date) =>
    date.toLocaleString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    });

  const renderCard = (row: Enriched) => (
    <div
      key={row.id}
      className="flex flex-col gap-3 rounded-lg border border-border p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            <Link
              href={`/profs/${row.teacherSlug}`}
              className="hover:underline"
            >
              {row.teacherName ?? "Prof"}
            </Link>
            {" — "}
            {row.instrumentName}
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
          <Badge
            variant={row.status === "CONFIRMED" ? "success" : "secondary"}
          >
            {STATUS_LABELS[row.status]}
          </Badge>
        </div>
      </div>

      {/* Le lien de visio n'apparaît qu'une fois le cours confirmé et posé
          par le prof. */}
      {row.status === "CONFIRMED" && row.meetingUrl ? (
        <a
          href={row.meetingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-fit items-center gap-1 text-sm text-primary hover:underline"
        >
          <Video className="h-3 w-3" />
          Rejoindre le cours
        </a>
      ) : null}

      {row.status === "CONFIRMED" && row.address ? (
        <p className="flex items-center gap-1 text-sm text-muted">
          <MapPin className="h-3 w-3" />
          {row.address}
        </p>
      ) : null}

      {row.cancellationReason ? (
        <p className="rounded-md bg-surface p-3 text-sm text-muted">
          Motif : {row.cancellationReason}
        </p>
      ) : null}

      {/* L'avis déjà déposé reste visible : sans lui, l'élève ne saurait plus
          ce qu'il a écrit, et le bouton « donner mon avis » aurait disparu
          sans explication. */}
      {row.review ? (
        <div className="rounded-md bg-surface p-3">
          <div className="flex items-center gap-2">
            <Stars value={row.review.rating} />
            <span className="text-sm text-muted">Votre avis</span>
          </div>
          {row.review.comment ? (
            <p className="mt-1 text-sm text-muted">{row.review.comment}</p>
          ) : null}

          {/* Sans cette mention, l'élève croirait son avis en ligne alors
              qu'il a été retiré. */}
          {!row.review.published ? (
            <p className="mt-2 text-sm text-warning">
              Cet avis a été retiré par la modération : il n&apos;apparaît pas
              sur la fiche du prof.
            </p>
          ) : null}
        </div>
      ) : null}

      {row.report &&
      (row.report.content ||
        row.report.attachments.length > 0 ||
        row.report.comments.length > 0) ? (
        <div className="rounded-md bg-surface p-3">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-subtle">
            Compte rendu
          </p>
          {row.report.title ? (
            <p className="mb-2 font-medium">{row.report.title}</p>
          ) : null}
          <ReportViewer bookingId={row.id} report={row.report} me="STUDENT" />
        </div>
      ) : null}

      {canCancel(row) ? (
        <div>
          <Button
            variant="outline"
            size="sm"
            disabled={busyId === row.id}
            onClick={() => cancel(row.id)}
          >
            {busyId === row.id ? (
              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
            ) : (
              <CalendarX className="mr-2 h-3 w-3" />
            )}
            Annuler
          </Button>
        </div>
      ) : null}
    </div>
  );

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 border-t border-border pt-12">
        <p className="text-muted">
          Vous n&apos;avez encore réservé aucun cours.
        </p>
        <Button asChild>
          <Link href="/profs">
            <Search className="mr-2 h-4 w-4" />
            Trouver un prof
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.pending.length > 0 ? (
        <section className="flex flex-col gap-4">
          <div>
            <SectionTitle>En attente de confirmation</SectionTitle>
            <p className="mt-2 text-sm text-muted">
              Le prof doit accepter ces demandes. Vous serez fixé dès sa
              réponse.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {groups.pending.map(renderCard)}
          </div>
        </section>
      ) : null}

      {awaitingReview.length > 0 ? (
        <section className="flex flex-col gap-4">
          <div>
            <SectionTitle>Donnez votre avis</SectionTitle>
            <p className="mt-2 text-sm text-muted">
              Votre retour aide les prochains élèves à choisir. Il apparaîtra
              sur la fiche du prof avec votre prénom.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {awaitingReview.map((row) => (
              <div
                key={row.id}
                className="flex flex-col gap-3 rounded-lg border border-border p-4"
              >
                <div>
                  <p className="font-medium">
                    <Link
                      href={`/profs/${row.teacherSlug}`}
                      className="hover:underline"
                    >
                      {row.teacherName ?? "Prof"}
                    </Link>
                    {" — "}
                    {row.instrumentName}
                  </p>
                  <p className="text-sm text-muted">{format(row.startsAt)}</p>
                </div>

                {reviewing === row.id ? (
                  <ReviewForm
                    bookingId={row.id}
                    onDone={(review) => {
                      setRows((current) =>
                        current.map((item) =>
                          item.id === row.id
                            ? // Un avis vient d'être déposé : il naît publié.
                              { ...item, review: { ...review, published: true } }
                            : item
                        )
                      );
                      setReviewing(null);
                      notifySuccess("Merci, votre avis est publié.");
                    }}
                  />
                ) : (
                  <div>
                    <Button size="sm" onClick={() => setReviewing(row.id)}>
                      <Star className="mr-2 h-3 w-3" />
                      Donner mon avis
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        <SectionTitle>Cours à venir</SectionTitle>
        <div className="flex flex-col gap-3">
          {groups.upcoming.length === 0 ? (
            <p className="text-sm text-subtle">Aucun cours confirmé à venir.</p>
          ) : (
            groups.upcoming.map(renderCard)
          )}
        </div>
      </section>

      {groups.toReview.length > 0 ? (
        <section className="flex flex-col gap-4">
          <div>
            <SectionTitle>Cours passés</SectionTitle>
            <p className="mt-2 text-sm text-muted">
              En attente de clôture par le prof.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {groups.toReview.map(renderCard)}
          </div>
        </section>
      ) : null}

      {groups.past.length > 0 ? (
        <section className="flex flex-col gap-4">
          <SectionTitle>Historique</SectionTitle>
          <div className="flex flex-col gap-3">
            {groups.past.slice(0, 20).map(renderCard)}
          </div>
        </section>
      ) : null}
    </div>
  );
}
