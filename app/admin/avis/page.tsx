import type { Metadata } from "next";

import { PageHeader } from "@/components/editorial";
import {
  ReviewModeration,
  type ModerationRow,
} from "@/components/review-moderation";
import prisma from "@/lib/prisma";
import { hasOpenReport, sortForModeration } from "@/lib/reviews/report";
import { givenName } from "@/lib/user/name";

/**
 * Modération des avis.
 *
 * Les avis sont **publiés dès leur dépôt**, et cet écran sert à en retirer un,
 * pas à les autoriser. C'est un choix : une file d'attente sur une plateforme
 * tenue par une personne signifierait qu'aucun avis n'apparaît pendant qu'elle
 * dort, et un élève qui écrit dans le vide n'écrit pas deux fois.
 *
 * Basculer vers une modération a priori tient en une ligne — le `publishedAt`
 * posé à la création dans `/api/reviews` — mais suppose de tenir la file, sans
 * quoi la fonctionnalité meurt en silence.
 *
 * L'ordre vit dans `lib/reviews/report.ts` et y est testé : signalements
 * ouverts d'abord (seul rang qui attend une décision), puis les avis masqués
 * (décisions à pouvoir relire), puis le reste. Il ne se fait pas en SQL parce
 * qu'il dépend d'un rang calculé, pas d'une colonne — et la file est bornée à
 * 200 lignes, donc trier en mémoire ne coûte rien.
 */
export const metadata: Metadata = { title: "Modération des avis" };

export default async function AdminReviewsPage() {
  const reviews = await prisma.review.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      rating: true,
      comment: true,
      teacherRepl: true,
      publishedAt: true,
      createdAt: true,
      booking: { select: { instrument: { select: { name: true } } } },
      student: {
        select: { user: { select: { name: true, firstName: true } } },
      },
      teacher: {
        select: { slug: true, user: { select: { name: true } } },
      },
      report: {
        select: {
          reason: true,
          detail: true,
          resolvedAt: true,
          createdAt: true,
        },
      },
    },
  });

  const rows: ModerationRow[] = reviews.map((review) => ({
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    reply: review.teacherRepl,
    published: review.publishedAt !== null,
    createdAt: review.createdAt.toISOString(),
    // Prénom seul, comme partout ailleurs : modérer ne demande pas d'en savoir
    // plus que ce que voient les élèves.
    studentName: givenName(review.student.user),
    teacherName: review.teacher.user.name,
    teacherSlug: review.teacher.slug,
    instrumentName: review.booking.instrument.name,
    report: review.report
      ? {
          reason: review.report.reason,
          detail: review.report.detail,
          createdAt: review.report.createdAt.toISOString(),
          resolvedAt: review.report.resolvedAt?.toISOString() ?? null,
        }
      : null,
  }));

  const ordered = sortForModeration(rows);
  const reported = ordered.filter(hasOpenReport).length;
  const hidden = ordered.filter((row) => !row.published).length;

  // Le signalement passe devant : c'est le seul des deux qui attend une
  // décision. Le nombre d'avis masqués n'est qu'un état.
  const summary =
    reported > 0
      ? `${reported} signalement${reported > 1 ? "s" : ""} en attente.`
      : "Aucun signalement en attente.";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        size="page"
        eyebrow="Administration"
        title="Avis"
        lead={`Les avis sont publiés dès leur dépôt. ${summary} ${
          hidden > 0
            ? `${hidden} avis actuellement masqué${hidden > 1 ? "s" : ""}.`
            : "Aucun avis masqué."
        }`}
      />

      <ReviewModeration initial={ordered} />
    </div>
  );
}
