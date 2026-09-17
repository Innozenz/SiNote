import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Search } from "lucide-react";

import { PageHeader } from "@/components/editorial";
import { InstrumentChip } from "@/components/instrument-chip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * « Mes profs » — un dossier par prof.
 *
 * Chaque dossier centralise la relation : cours, comptes rendus et échanges.
 * C'est le pendant du roster « Mes élèves » côté prof. La liste elle-même ne
 * porte que ce qui aide à choisir lequel ouvrir — depuis quand, combien de
 * cours, et surtout ce qui attend d'être lu.
 */
export const metadata: Metadata = { title: "Mes profs" };

export default async function StudentDossiersPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) redirect("/");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      timezone: true,
      studentProfile: { select: { id: true, reportsSeenAt: true } },
    },
  });

  if (!user?.studentProfile) redirect("/dashboard");

  const student = user.studentProfile;

  const [teachers, unreadComments] = await Promise.all([
    prisma.teacherProfile.findMany({
      where: { bookings: { some: { studentId: student.id } } },
      select: {
        id: true,
        user: { select: { name: true, image: true } },
        bookings: {
          where: { studentId: student.id },
          select: {
            startsAt: true,
            status: true,
            instrument: { select: { name: true, family: true } },
          },
        },
      },
    }),
    // Ce que le prof a écrit sous un compte rendu depuis la dernière visite :
    // la même règle que la pastille de la barre latérale (`reportsSeenAt`),
    // ventilée par prof pour dire *lequel* a du neuf.
    prisma.message.groupBy({
      by: ["teacherId"],
      where: {
        studentId: student.id,
        reportId: { not: null },
        sender: "TEACHER",
        createdAt: { gt: student.reportsSeenAt },
      },
      _count: { _all: true },
    }),
  ]);

  const unreadByTeacher = new Map(
    unreadComments.map((row) => [row.teacherId, row._count._all])
  );

  const now = new Date();
  const dayFormat = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    timeZone: user.timezone,
  });
  const nextFormat = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: user.timezone,
  });

  const rows = teachers
    .map((teacher) => {
      const lessons = teacher.bookings.filter(
        (b) => b.status === "CONFIRMED" || b.status === "COMPLETED"
      );
      const upcoming = lessons
        .filter((b) => b.startsAt > now)
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
      const lastPast = lessons
        .filter((b) => b.startsAt <= now)
        .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())[0];

      // Une pastille par instrument réellement travaillé avec ce prof, dans la
      // teinte de sa famille : c'est ce qui distingue deux profs d'un coup d'œil.
      const instruments = [
        ...new Map(
          teacher.bookings.map((b) => [b.instrument.name, b.instrument.family])
        ),
      ].map(([name, family]) => ({ name, family }));

      return {
        id: teacher.id,
        name: teacher.user.name ?? "Professeur",
        image: teacher.user.image,
        instruments,
        lessonCount: lessons.length,
        next: upcoming ? nextFormat.format(upcoming.startsAt) : null,
        last: lastPast ? dayFormat.format(lastPast.startsAt) : null,
        unread: unreadByTeacher.get(teacher.id) ?? 0,
        lastActivity: teacher.bookings
          .map((b) => b.startsAt.getTime())
          .reduce((max, t) => Math.max(max, t), 0),
      };
    })
    .sort((a, b) => b.lastActivity - a.lastActivity);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        size="page"
        eyebrow="Espace élève"
        title="Mes profs"
        lead="Un dossier par prof : comptes rendus, historique, messages et votre avis."
      />

      {rows.length === 0 ? (
        <div className="flex flex-col items-start gap-4">
          <p className="text-muted">
            Vos profs apparaîtront ici dès votre première réservation, avec tout
            ce que vous aurez échangé.
          </p>
          <Button asChild>
            <Link href="/profs">
              <Search className="h-4 w-4" />
              Trouver un prof
            </Link>
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/dashboard/dossiers/${row.id}`}
                className="-mx-3 flex items-center gap-4 rounded-[var(--radius-sm)] px-3 py-5 transition-colors hover:bg-surface"
              >
                <Avatar className="h-14 w-14 shrink-0 border border-border">
                  <AvatarImage src={row.image || undefined} alt={row.name} />
                  <AvatarFallback>
                    {row.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-xl font-medium text-foreground">
                      {row.name}
                    </span>
                    {row.unread > 0 ? (
                      <span className="rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                        {row.unread}
                      </span>
                    ) : null}
                  </p>

                  {row.instruments.length > 0 ? (
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      {row.instruments.map((instrument) => (
                        <InstrumentChip
                          key={instrument.name}
                          name={instrument.name}
                          family={instrument.family}
                        />
                      ))}
                    </span>
                  ) : null}

                  <p className="mt-1.5 text-sm text-muted">
                    {[
                      `${row.lessonCount} ${row.lessonCount === 1 ? "cours" : "cours"}`,
                      row.last ? `dernier le ${row.last}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>

                  {row.next ? (
                    <p className="mt-0.5 text-sm font-medium text-primary first-letter:uppercase">
                      {`Prochain cours : ${row.next}`}
                    </p>
                  ) : null}
                </div>

                <ChevronRight className="h-4 w-4 shrink-0 text-subtle" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
