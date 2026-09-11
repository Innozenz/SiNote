import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/editorial";
import { ListFilters } from "@/components/list-filters";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ageOn } from "@/lib/user/age";

/**
 * Roster des élèves du prof.
 *
 * La liste se déduit des réservations : est « mon élève » quiconque a déjà
 * réservé avec moi. Chaque ligne résume l'essentiel (instruments, nombre de
 * cours, prochain / dernier), et mène à sa fiche. Recherche par nom et filtre
 * par instrument vivent dans l'URL — la page filtre côté serveur.
 */
export const metadata: Metadata = { title: "Mes élèves" };

export default async function TeacherStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; instrument?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) redirect("/");

  const teacher = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, user: { select: { timezone: true } } },
  });

  if (!teacher) redirect("/dashboard");

  const students = await prisma.studentProfile.findMany({
    where: { bookings: { some: { teacherId: teacher.id } } },
    select: {
      id: true,
      birthDate: true,
      user: { select: { name: true, image: true } },
      bookings: {
        where: { teacherId: teacher.id },
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
    timeZone: teacher.user.timezone,
  });

  const rows = students
    .map((student) => {
      const lessons = student.bookings.filter(
        (b) => b.status === "CONFIRMED" || b.status === "COMPLETED"
      );
      const upcoming = lessons
        .filter((b) => b.startsAt > now)
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
      const lastPast = lessons
        .filter((b) => b.startsAt <= now)
        .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())[0];
      const instruments = [
        ...new Set(student.bookings.map((b) => b.instrument.name)),
      ];
      const lastActivity = student.bookings
        .map((b) => b.startsAt.getTime())
        .reduce((max, t) => Math.max(max, t), 0);

      return {
        id: student.id,
        name: student.user.name ?? "Élève",
        image: student.user.image,
        age: student.birthDate ? ageOn(student.birthDate, now) : null,
        instruments,
        lessonCount: lessons.length,
        next: upcoming ? dateFormat.format(upcoming.startsAt) : null,
        last: lastPast ? dateFormat.format(lastPast.startsAt) : null,
        lastActivity,
      };
    })
    .sort((a, b) => b.lastActivity - a.lastActivity);

  const { q, instrument } = await searchParams;
  const needle = (q ?? "").trim().toLowerCase();
  const instrumentOptions = [
    ...new Set(students.flatMap((s) => s.bookings.map((b) => b.instrument.name))),
  ]
    .sort((a, b) => a.localeCompare(b, "fr"))
    .map((name) => ({ value: name, label: name }));

  const visibleRows = rows.filter(
    (row) =>
      (!needle || row.name.toLowerCase().includes(needle)) &&
      (!instrument || row.instruments.includes(instrument))
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        size="page"
        eyebrow="Espace professeur"
        title="Mes élèves"
        lead={
          rows.length === 0
            ? "Vos élèves apparaîtront ici dès votre premier cours réservé."
            : rows.length === 1
              ? "1 élève a réservé avec vous."
              : `${rows.length} élèves ont réservé avec vous.`
        }
      />

      {rows.length > 0 ? (
        <ListFilters
          searchKey="q"
          searchPlaceholder="Rechercher un élève…"
          chips={
            instrumentOptions.length >= 2
              ? [{ key: "instrument", label: "Instrument", options: instrumentOptions }]
              : undefined
          }
        />
      ) : null}

      {rows.length > 0 && visibleRows.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
          Aucun élève ne correspond à ces filtres.
        </p>
      ) : null}

      {visibleRows.length > 0 ? (
        <ul className="divide-y divide-border border-y border-border">
          {visibleRows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/dashboard/prof/eleves/${row.id}`}
                className="flex items-center gap-4 px-1 py-4 transition-colors hover:bg-surface"
              >
                <Avatar className="h-11 w-11 shrink-0 border border-border">
                  <AvatarImage src={row.image || undefined} alt={row.name} />
                  <AvatarFallback>
                    {row.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {row.name}
                    {row.age !== null ? (
                      <span className="font-normal text-muted"> · {row.age} ans</span>
                    ) : null}
                  </p>
                  <p className="truncate text-sm text-muted">
                    {row.instruments.join(", ") || "—"}
                  </p>
                </div>

                <div className="hidden shrink-0 text-right text-sm text-muted sm:block">
                  <p>
                    {row.lessonCount} cours
                  </p>
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
      ) : null}
    </div>
  );
}
