import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/editorial";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * Dossiers de l'élève — un par prof.
 *
 * Chaque dossier centralise la relation avec un prof : cours, comptes rendus et
 * échanges. C'est le pendant du roster « Mes élèves » côté prof.
 */
export default async function StudentDossiersPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) redirect("/");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { timezone: true, studentProfile: { select: { id: true } } },
  });

  if (!user?.studentProfile) redirect("/dashboard");

  const studentId = user.studentProfile.id;

  const teachers = await prisma.teacherProfile.findMany({
    where: { bookings: { some: { studentId } } },
    select: {
      id: true,
      user: { select: { name: true, image: true } },
      bookings: {
        where: { studentId },
        select: {
          startsAt: true,
          status: true,
          instrument: { select: { name: true } },
        },
      },
    },
  });

  const now = new Date();
  const dateFormat = new Intl.DateTimeFormat("fr-FR", {
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
      const instruments = [
        ...new Set(teacher.bookings.map((b) => b.instrument.name)),
      ];
      const lastActivity = teacher.bookings
        .map((b) => b.startsAt.getTime())
        .reduce((max, t) => Math.max(max, t), 0);

      return {
        id: teacher.id,
        name: teacher.user.name ?? "Professeur",
        image: teacher.user.image,
        instruments,
        lessonCount: lessons.length,
        next: upcoming ? dateFormat.format(upcoming.startsAt) : null,
        last: lastPast ? dateFormat.format(lastPast.startsAt) : null,
        lastActivity,
      };
    })
    .sort((a, b) => b.lastActivity - a.lastActivity);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Espace élève" title="Mes cours" />

      {rows.length === 0 ? (
        <p className="mt-10 text-muted">
          Vos cours apparaîtront ici, regroupés par prof, dès votre première
          réservation.
        </p>
      ) : (
        <ul className="mt-10 divide-y divide-border border-y border-border">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/dashboard/dossiers/${row.id}`}
                className="flex items-center gap-4 px-1 py-4 transition-colors hover:bg-surface"
              >
                <Avatar className="h-11 w-11 shrink-0 border border-border">
                  <AvatarImage src={row.image || undefined} alt={row.name} />
                  <AvatarFallback>
                    {row.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{row.name}</p>
                  <p className="truncate text-sm text-muted">
                    {row.instruments.join(", ") || "—"}
                  </p>
                </div>

                <div className="hidden shrink-0 text-right text-sm text-muted sm:block">
                  <p>{row.lessonCount} cours</p>
                  <p className="text-xs text-subtle">
                    {row.next
                      ? `Prochain : ${row.next}`
                      : row.last
                        ? `Dernier : ${row.last}`
                        : "—"}
                  </p>
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
