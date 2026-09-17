import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import type { InstrumentFamily } from "@prisma/client";

import { PageHeader } from "@/components/editorial";
import { InstrumentChip } from "@/components/instrument-chip";
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
    select: {
      id: true,
      reportsSeenAt: true,
      user: { select: { timezone: true } },
    },
  });

  if (!teacher) redirect("/dashboard");

  const [students, unreadByStudent] = await Promise.all([
    prisma.studentProfile.findMany({
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
            instrument: { select: { name: true, family: true } },
          },
        },
      },
    }),
    // Commentaires de compte rendu écrits par l'élève depuis ma dernière
    // consultation : la même règle que la pastille de la barre latérale,
    // ventilée par élève pour dire **qui** attend.
    prisma.message.groupBy({
      by: ["studentId"],
      where: {
        teacherId: teacher.id,
        reportId: { not: null },
        sender: "STUDENT",
        createdAt: { gt: teacher.reportsSeenAt },
      },
      _count: { _all: true },
    }),
  ]);

  const unread = new Map(
    unreadByStudent.map((row) => [row.studentId, row._count._all])
  );

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
        ...new Map(
          student.bookings.map((b) => [b.instrument.name, b.instrument.family])
        ),
      ].map(([name, family]) => ({ name, family }));
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
        unread: unread.get(student.id) ?? 0,
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
      (!instrument ||
        row.instruments.some((entry) => entry.name === instrument))
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
        meta={
          // Les comptes rendus ont quitté le menu pour vivre dans le dossier de
          // chaque élève ; l'atelier chronologique, lui, reste utile pour écrire
          // à la chaîne. C'est ici sa porte d'entrée.
          <Link
            href="/dashboard/prof/comptes-rendus"
            className="text-sm text-primary hover:underline"
          >
            Tous les comptes rendus →
          </Link>
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
                  {/* La teinte de la famille remplace une énumération en texte :
                      « piano, chant » se distingue d'un coup d'œil de « piano,
                      guitare » sans qu'on ait à lire les mots. */}
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {row.instruments.map((entry) => (
                      <InstrumentChip
                        key={entry.name}
                        name={entry.name}
                        family={entry.family as InstrumentFamily}
                        size="xs"
                      />
                    ))}
                  </div>
                  <p className="mt-1 truncate text-xs text-subtle sm:hidden">
                    {row.lessonCount} cours
                    {row.last ? ` · dernier le ${row.last}` : ""}
                  </p>
                </div>

                {row.unread > 0 ? (
                  <span
                    className="shrink-0 rounded-full bg-primary px-1.5 text-xs font-semibold leading-5 text-primary-foreground"
                    title="Commentaires de compte rendu non lus"
                  >
                    {row.unread}
                  </span>
                ) : null}

                <div className="hidden shrink-0 text-right text-sm text-muted sm:block">
                  <p>{row.lessonCount} cours</p>
                  <p className="text-xs text-subtle">
                    {row.next
                      ? `Prochain : ${row.next}`
                      : row.last
                        ? `Dernier le ${row.last}`
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
