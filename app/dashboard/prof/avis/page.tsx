import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/editorial";
import {
  TeacherReviewReplies,
  type TeacherReviewRow,
} from "@/components/teacher-review-replies";
import { Stars } from "@/components/ui/stars";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getRatingCounts } from "@/lib/reviews/queries";
import { formatAverage, summarizeFromCounts } from "@/lib/reviews/summary";
import { givenName } from "@/lib/user/name";

/**
 * Avis reçus par le prof.
 *
 * Server Component, comme le reste de l'espace prof, et lit « mes » avis via
 * le profil de la session : aucun identifiant de prof n'est accepté en
 * paramètre, donc aucune fiche d'autrui n'est atteignable par erreur.
 */
export const metadata: Metadata = { title: "Avis reçus" };

export default async function TeacherReviewsPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) redirect("/");

  const teacher = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, user: { select: { timezone: true } } },
  });

  if (!teacher) redirect("/dashboard");

  const [reviews, counts] = await Promise.all([
    prisma.review.findMany({
      where: { teacherId: teacher.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        rating: true,
        comment: true,
        teacherRepl: true,
        publishedAt: true,
        createdAt: true,
        booking: {
          select: { startsAt: true, instrument: { select: { name: true } } },
        },
        student: {
          select: { user: { select: { name: true, firstName: true } } },
        },
        report: { select: { resolvedAt: true } },
      },
    }),
    getRatingCounts(teacher.id),
  ]);

  const summary = summarizeFromCounts(counts);

  const rows: TeacherReviewRow[] = reviews.map((review) => ({
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    reply: review.teacherRepl,
    // Prénom seul, comme sur la fiche publique : le prof ne voit pas plus que
    // ce que voient ses futurs élèves.
    studentName: givenName(review.student.user),
    instrumentName: review.booking.instrument.name,
    lessonAt: review.booking.startsAt.toISOString(),
    publishedAt: (review.publishedAt ?? review.createdAt).toISOString(),
    // Le prof voit que son signalement a été traité, sans savoir dans quel
    // sens : l'avis toujours en ligne le lui dit déjà, et le motif de la
    // décision appartient à la modération.
    report: review.report
      ? { resolved: review.report.resolvedAt !== null }
      : null,
    // Un avis masqué par la modération n'est plus visible des élèves ; le lui
    // cacher lui ferait croire qu'il est toujours en ligne.
    hidden: review.publishedAt === null,
  }));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        size="page"
        eyebrow="Espace professeur"
        title="Avis"
        lead="Écrits par des élèves ayant suivi un cours que vous avez clôturé. Vous pouvez y répondre publiquement."
        meta={
          summary.average !== null ? (
            <div className="flex items-center gap-3 sm:justify-end">
              <span className="font-display text-3xl font-semibold">
                {formatAverage(summary.average)}
              </span>
              <div className="flex flex-col">
                <Stars value={summary.average} />
                <span className="text-xs text-subtle">
                  {`${summary.count} avis`}
                </span>
              </div>
            </div>
          ) : null
        }
      />

      <TeacherReviewReplies initial={rows} timezone={teacher.user.timezone} />
    </div>
  );
}
