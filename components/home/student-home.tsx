import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";

import { MarkCoursSeen } from "@/components/mark-cours-seen";
import { PageHeader, SectionTitle } from "@/components/editorial";
import { StudentLessons, type StudentBookingRow } from "@/components/student-bookings";
import { LEVEL_LABELS } from "@/components/student-profile-detail";
import { StudentMonth } from "@/components/student-month";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import prisma from "@/lib/prisma";
import { canReviewTeacher } from "@/lib/reviews/eligibility";
import { composeStudentLead } from "@/lib/student/home-lead";
import {
  buildStudentMonth,
  currentMonthKey,
  isMonthKey,
  shiftMonth,
} from "@/lib/student/month";
import { checkStudentProfile, isMinor } from "@/lib/student/profile";
import { medianResponseHours } from "@/lib/student/response-time";
import { monthRange } from "@/lib/teacher/agenda";
import { cn } from "@/lib/utils";

/**
 * Accueil de l'élève — « Mes cours ».
 *
 * Server Component rendu par /dashboard pour un compte élève. C'est désormais
 * *la* page de l'élève : réservations, agenda et dossiers disaient trois fois
 * la même chose, et l'agenda hebdomadaire — celui du prof, conçu pour trente
 * cours par semaine — était vide vingt-huit jours sur trente.
 *
 * Deux colonnes : à gauche ce sur quoi on agit (le prochain cours, ceux qui
 * viennent, ceux qui sont passés), à droite ce qui situe (le mois, les profs,
 * l'état du profil). Le mois vit dans l'URL (`?mois=AAAA-MM`), pas dans un état
 * React — même raison que l'agenda du prof et les filtres de recherche.
 *
 * Statuts qui immobilisent un créneau et statuts clos sont les seuls dessinés
 * au calendrier : un cours annulé a rendu son créneau, il n'occupe plus le
 * mois. Même règle que l'agenda du prof.
 */
export type StudentHomeProps = {
  userId: string;
  firstName: string | null;
  timezone: string;
  /** Mois affiché au calendrier, « AAAA-MM » ; le mois courant par défaut. */
  month?: string;
};

/** Statuts portés au mini-mois. */
const CALENDAR_STATUSES = ["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW"] as const;

export async function StudentHome({
  userId,
  firstName,
  timezone,
  month: requestedMonth,
}: StudentHomeProps) {
  const now = new Date();

  const student = await prisma.studentProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      city: true,
      birthDate: true,
      guardianName: true,
      guardianEmail: true,
      guardianPhone: true,
      goals: true,
      instruments: {
        select: {
          level: true,
          instrument: { select: { name: true, slug: true } },
        },
      },
    },
  });

  // Le layout garantit déjà le rôle ; sans profil, l'onboarding n'est pas fini.
  if (!student) return null;

  // Un élève a peu de cours : on les charge une fois et on classe en mémoire,
  // plutôt que de multiplier les requêtes par section.
  const bookings = await prisma.booking.findMany({
    where: { studentId: student.id },
    orderBy: { startsAt: "desc" },
    take: 200,
    select: {
      id: true,
      status: true,
      startsAt: true,
      endsAt: true,
      mode: true,
      isTrial: true,
      priceCents: true,
      meetingUrl: true,
      address: true,
      cancellationReason: true,
      instrument: { select: { name: true, family: true } },
      teacherId: true,
      teacher: {
        select: {
          slug: true,
          user: { select: { name: true, image: true, timezone: true } },
        },
      },
      report: {
        select: {
          content: true,
          _count: { select: { attachments: true, comments: true } },
        },
      },
    },
  });

  const teacherIds = [...new Set(bookings.map((b) => b.teacherId))];

  // Le mois demandé peut couvrir des cours hors des 200 derniers : il a sa
  // propre requête, bornée à la grille affichée.
  const month = isMonthKey(requestedMonth)
    ? requestedMonth
    : currentMonthKey(now, timezone);
  const range = monthRange(month, timezone);

  const [monthLessons, reviewedTeachers, responseSamples, reportCounts] =
    await Promise.all([
      prisma.booking.findMany({
        where: {
          studentId: student.id,
          status: { in: [...CALENDAR_STATUSES] },
          startsAt: { gte: range.from, lt: range.to },
        },
        select: { startsAt: true, endsAt: true, status: true },
      }),
      // Profs déjà notés : l'avis est global au prof, un seul par couple.
      prisma.review.findMany({
        where: { studentId: student.id },
        select: { teacherId: true },
      }),
      // Réponses passées des profs concernés, pour dire — ou taire — leur
      // délai habituel. Bornées : on décrit une habitude, pas une histoire.
      teacherIds.length > 0
        ? prisma.booking.findMany({
            where: { teacherId: { in: teacherIds }, confirmedAt: { not: null } },
            orderBy: { createdAt: "desc" },
            take: 200,
            select: { teacherId: true, createdAt: true, confirmedAt: true },
          })
        : Promise.resolve([]),
      // Comptes rendus **réellement écrits**, par prof : un compte rendu ouvert
      // et vide est « en cours d'écriture », le compter serait mentir.
      teacherIds.length > 0
        ? prisma.lessonReport.findMany({
            where: {
              booking: { studentId: student.id },
              OR: [
                { content: { not: null } },
                { attachments: { some: {} } },
                { comments: { some: {} } },
              ],
            },
            select: { booking: { select: { teacherId: true } } },
          })
        : Promise.resolve([]),
    ]);

  /* ------------------------------------------------------------------ Cours */

  const rows: StudentBookingRow[] = bookings.map((booking) => {
    const report = booking.report;
    const attachmentCount = report?._count.attachments ?? 0;

    return {
      id: booking.id,
      status: booking.status,
      startsAt: booking.startsAt.toISOString(),
      endsAt: booking.endsAt.toISOString(),
      mode: booking.mode,
      isTrial: booking.isTrial,
      priceCents: booking.priceCents,
      meetingUrl: booking.meetingUrl,
      address: booking.address,
      cancellationReason: booking.cancellationReason,
      instrumentName: booking.instrument.name,
      instrumentFamily: booking.instrument.family,
      teacherName: booking.teacher.user.name,
      teacherSlug: booking.teacher.slug,
      teacherId: booking.teacherId,
      teacherImage: booking.teacher.user.image,
      teacherTimezone: booking.teacher.user.timezone,
      report: report
        ? {
            documented: Boolean(
              report.content?.trim() ||
                attachmentCount > 0 ||
                report._count.comments > 0
            ),
            attachmentCount,
          }
        : null,
    };
  });

  const nextLesson = bookings
    .filter((b) => b.status === "CONFIRMED" && b.endsAt > now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];

  const pendingCount = bookings.filter(
    (b) => b.status === "PENDING" && b.endsAt > now
  ).length;

  // Un prof est « notable » dès qu'un cours avec lui est terminé et qu'aucun
  // avis n'existe encore. `canReviewTeacher` est la règle, ici comme à la route.
  const completedTeacherIds = new Set(
    bookings.filter((b) => b.status === "COMPLETED").map((b) => b.teacherId)
  );
  const reviewedTeacherIds = new Set(reviewedTeachers.map((r) => r.teacherId));
  const reviewableTeacherIds = teacherIds.filter(
    (id) =>
      canReviewTeacher(completedTeacherIds.has(id)).ok &&
      !reviewedTeacherIds.has(id)
  );

  const samplesByTeacher = new Map<
    string,
    { createdAt: Date; confirmedAt: Date | null }[]
  >();
  for (const sample of responseSamples) {
    const list = samplesByTeacher.get(sample.teacherId) ?? [];
    list.push({ createdAt: sample.createdAt, confirmedAt: sample.confirmedAt });
    samplesByTeacher.set(sample.teacherId, list);
  }
  const responseHours = Object.fromEntries(
    teacherIds.map((id) => [
      id,
      medianResponseHours(samplesByTeacher.get(id) ?? []),
    ])
  );

  /* ------------------------------------------------------------- Mini-mois */

  const studentMonth = buildStudentMonth({
    timezone,
    month,
    now,
    lessons: monthLessons.map((lesson) => ({
      startsAt: lesson.startsAt,
      endsAt: lesson.endsAt,
      status: lesson.status as (typeof CALENDAR_STATUSES)[number],
    })),
  });

  /* ------------------------------------------------------------- Mes profs */

  const reportsByTeacher = new Map<string, number>();
  for (const report of reportCounts) {
    const id = report.booking.teacherId;
    reportsByTeacher.set(id, (reportsByTeacher.get(id) ?? 0) + 1);
  }

  const teachers = teacherIds
    .map((id) => {
      const theirs = bookings.filter((b) => b.teacherId === id);
      const lessons = theirs.filter(
        (b) => b.status === "CONFIRMED" || b.status === "COMPLETED"
      );

      return {
        id,
        name: theirs[0].teacher.user.name ?? "Professeur",
        image: theirs[0].teacher.user.image,
        instruments: [...new Set(theirs.map((b) => b.instrument.name))],
        lessonCount: lessons.length,
        reportCount: reportsByTeacher.get(id) ?? 0,
        lastActivity: Math.max(...theirs.map((b) => b.startsAt.getTime())),
      };
    })
    .sort((a, b) => b.lastActivity - a.lastActivity);

  /* ---------------------------------------------------------- Mon profil */

  const issues = checkStudentProfile(student, now);
  const minor = isMinor(student.birthDate, now);

  const instrumentsOk =
    student.instruments.length > 0 &&
    student.instruments.every((entry) => entry.level !== null);

  // Nommer ce qui est rempli plutôt que le déclarer rempli : « Guitare
  // électrique · intermédiaire » se relit, « Instruments renseignés » demande
  // d'aller vérifier. Le premier instrument suffit à reconnaître son profil.
  const firstFilled = student.instruments.find((entry) => entry.level !== null);

  const checks = [
    {
      label:
        student.instruments.length === 0
          ? "Aucun instrument renseigné"
          : instrumentsOk && firstFilled
            ? [
                firstFilled.instrument.name,
                LEVEL_LABELS[firstFilled.level!].toLowerCase(),
              ].join(" · ") +
              (student.instruments.length > 1
                ? ` (+${student.instruments.length - 1})`
                : "")
            : "Niveau à choisir",
      ok: instrumentsOk,
      href: "/dashboard/cours/profil",
    },
    {
      label: student.goals?.trim() ? "Objectifs renseignés" : "Objectifs à écrire",
      ok: Boolean(student.goals?.trim()),
      href: "/dashboard/cours/profil",
    },
    ...(minor
      ? [
          {
            label:
              issues.length === 0
                ? "Responsable légal joignable"
                : "Responsable légal manquant",
            ok: issues.length === 0,
            href: "/dashboard/cours/profil",
          },
        ]
      : []),
  ];

  /* ------------------------------------------------------------------ Rendu */

  const todayLabel = now.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: timezone,
  });

  // Un seul prof : le bouton mène directement chez lui plutôt qu'à la
  // recherche, qui lui ferait retrouver quelqu'un qu'il connaît déjà.
  const soleTeacher = teachers.length === 1 ? teachers[0] : null;
  const soleTeacherSlug = soleTeacher
    ? bookings.find((b) => b.teacherId === soleTeacher.id)!.teacher.slug
    : null;

  // Le lien « Trouver un prof de … » n'est composé que de ce que l'élève a
  // réellement écrit : pas d'instrument ou pas de ville, pas de lien.
  const firstInstrument = student.instruments[0]?.instrument ?? null;
  const findMoreHref =
    firstInstrument && student.city?.trim()
      ? `/profs?instrument=${encodeURIComponent(firstInstrument.slug)}&ville=${encodeURIComponent(student.city.trim())}`
      : null;

  const monthBase = "/dashboard?mois=";

  return (
    <div className="flex flex-col gap-10">
      {/* Marque « Mes cours » comme vu : la pastille de la barre latérale
          tombe une fois la page réellement ouverte. */}
      <MarkCoursSeen />

      <PageHeader
        size="page"
        eyebrow={<span className="first-letter:uppercase">{todayLabel}</span>}
        title={firstName ? `Bonjour ${firstName}` : "Bonjour"}
        lead={composeStudentLead({
          nextStartsAt: nextLesson?.startsAt ?? null,
          pendingCount,
          now,
          timezone,
        })}
        meta={
          <Button asChild>
            {soleTeacher && soleTeacherSlug ? (
              <Link href={`/profs/${soleTeacherSlug}`}>
                {`Réserver avec ${soleTeacher.name}`}
              </Link>
            ) : (
              <Link href="/profs">
                <Search className="h-4 w-4" />
                Réserver un cours
              </Link>
            )}
          </Button>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-14">
        <StudentLessons
          initial={rows}
          reviewableTeacherIds={reviewableTeacherIds}
          responseHours={responseHours}
        />

        <aside className="flex flex-col gap-8">
          <StudentMonth
            month={studentMonth}
            previousHref={`${monthBase}${shiftMonth(month, -1)}`}
            nextHref={`${monthBase}${shiftMonth(month, 1)}`}
          />

          {teachers.length > 0 ? (
            <section className="flex flex-col gap-3.5">
              <SectionTitle>Mes profs</SectionTitle>
              <ul className="flex flex-col">
                {teachers.map((teacher) => (
                  <li key={teacher.id}>
                    <Link
                      href={`/dashboard/dossiers/${teacher.id}`}
                      className="-mx-2 flex items-center gap-3 rounded-[var(--radius-sm)] px-2 py-2.5 transition-colors hover:bg-surface"
                    >
                      <Avatar className="h-10 w-10 shrink-0 border border-border">
                        <AvatarImage
                          src={teacher.image || undefined}
                          alt={teacher.name}
                        />
                        <AvatarFallback>
                          {teacher.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {teacher.name}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {[
                            teacher.instruments.join(", "),
                            `${teacher.lessonCount} ${teacher.lessonCount === 1 ? "cours" : "cours"}`,
                            teacher.reportCount > 0
                              ? `${teacher.reportCount} ${teacher.reportCount === 1 ? "compte rendu" : "comptes rendus"}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-subtle" />
                    </Link>
                  </li>
                ))}
              </ul>

              {findMoreHref && firstInstrument ? (
                <Link
                  href={findMoreHref}
                  className="flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  <Search className="h-3.5 w-3.5" />
                  {`Trouver un prof de ${firstInstrument.name.toLowerCase()} à ${student.city}`}
                </Link>
              ) : null}
            </section>
          ) : null}

          <section className="flex flex-col gap-3.5">
            <SectionTitle>Mon profil</SectionTitle>
            {/* Pastilles pleines plutôt qu'icônes : trois lignes qui se lisent
                d'un coup d'œil, vert pour ce qui est fait, ambre pour ce qui
                bloque — et le seul lien de la colonne est posé à droite, là où
                on va le chercher. */}
            <ul className="flex flex-col gap-2.5 text-sm">
              {checks.map((check) => (
                <li key={check.label} className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      check.ok ? "bg-success" : "bg-warning"
                    )}
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1",
                      check.ok ? "text-muted" : "text-foreground"
                    )}
                  >
                    {check.label}
                  </span>
                  {check.ok ? null : (
                    <Link
                      href={check.href}
                      className="shrink-0 whitespace-nowrap text-[0.8125rem] font-medium text-primary hover:underline"
                    >
                      Ajouter
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
