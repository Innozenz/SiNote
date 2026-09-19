import { Quote } from "lucide-react";

import { SectionTitle } from "@/components/editorial";
import { Separator } from "@/components/ui/separator";
import { Stars } from "@/components/ui/stars";
import type { PublicReview } from "@/lib/reviews/queries";
import { distribution, formatAverage } from "@/lib/reviews/summary";

/**
 * Avis publiés d'un prof, sur sa fiche publique.
 *
 * Server Component : les avis sont du contenu, ils doivent être dans le HTML.
 * Les charger côté client les rendrait invisibles aux moteurs et priverait la
 * fiche de son principal argument de conversion.
 *
 * L'histogramme n'apparaît qu'au-delà de quelques avis : sur trois notes il
 * n'apprend rien et occupe la place que le texte mérite.
 */
export function TeacherReviews({
  reviews,
  average,
  count,
  counts,
  timezone,
}: {
  reviews: PublicReview[];
  average: number | null;
  count: number;
  counts: { rating: number; count: number }[];
  timezone: string;
}) {
  if (count === 0 || average === null) {
    return (
      <section className="flex flex-col gap-4">
        <SectionTitle
          trailing={
            <span className="text-sm text-muted">
              Écrits par des élèves ayant suivi un cours
            </span>
          }
        >
          Avis
        </SectionTitle>
        <div className="flex items-center gap-5 py-1.5">
          <span
            aria-hidden
            className="font-display text-[3.5rem] font-semibold leading-none text-foreground"
          >
            —
          </span>
          <p className="max-w-md text-sm leading-relaxed text-muted">
            Ce prof n&apos;a pas encore reçu d&apos;avis. Le premier s&apos;écrira
            après un cours clôturé, et sera signé du prénom de l&apos;élève.
          </p>
        </div>
      </section>
    );
  }

  const rows = distribution(counts);

  return (
    <section className="flex flex-col gap-4">
      <SectionTitle
        trailing={<span className="text-sm text-subtle">{count}</span>}
      >
        Avis
      </SectionTitle>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="flex items-center gap-3">
          <span className="text-4xl font-semibold">
            {formatAverage(average)}
          </span>
          <div className="flex flex-col gap-1">
            <Stars value={average} size="md" />
            <span className="text-sm text-muted">
              {`${count} avis vérifié${count > 1 ? "s" : ""}`}
            </span>
          </div>
        </div>

        {count >= 5 ? (
          <ul className="flex min-w-56 flex-1 flex-col gap-1">
            {rows.map((row) => (
              <li key={row.rating} className="flex items-center gap-2 text-xs">
                <span className="w-3 text-subtle">{row.rating}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-strong">
                  <span
                    className="block h-full rounded-full bg-warning"
                    style={{ width: `${row.share}%` }}
                  />
                </span>
                <span className="w-6 text-right text-subtle">{row.count}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <Separator />

      <ul className="flex flex-col gap-5">
        {reviews.map((review) => (
          <li key={review.id} className="flex flex-col gap-3">
            <Stars value={review.rating} />

            {review.comment ? (
              <p className="whitespace-pre-line text-muted">{review.comment}</p>
            ) : null}

            {/* Droit de réponse : la contrepartie d'une publication immédiate
                et sans possibilité pour le prof de modifier l'avis. */}
            {review.teacherReply ? (
              <div className="ml-4 flex gap-2 border-l-2 border-border pl-3">
                <Quote className="mt-1 h-3 w-3 shrink-0 text-subtle" />
                <div>
                  <p className="text-sm font-medium">Réponse du prof</p>
                  <p className="whitespace-pre-line text-sm text-muted">
                    {review.teacherReply}
                  </p>
                </div>
              </div>
            ) : null}

            {/* Signature : le prénom de l'élève, à la plume — l'avis est déjà
                « signé du prénom », on lui donne sa main. L'instrument et le mois
                restent en clair : c'est ce qui rend l'avis vérifiable, une
                signature seule ne l'est pas. */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
              <span className="font-signature text-3xl leading-tight text-foreground">
                {review.studentName ?? "Élève"}
              </span>
              <span className="text-sm text-subtle">
                {`${review.instrumentName} · ${review.lessonAt.toLocaleDateString(
                  "fr-FR",
                  { month: "long", year: "numeric", timeZone: timezone }
                )}`}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
