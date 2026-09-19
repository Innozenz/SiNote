import Link from "next/link";
import type {
  BookingStatus,
  InstrumentFamily,
  SkillLevel,
} from "@prisma/client";
import {
  ArrowRight,
  CalendarOff,
  CalendarPlus,
  ChevronRight,
  Home,
  MapPin,
  Video,
} from "lucide-react";

import { InstrumentChip } from "@/components/instrument-chip";
import {
  LESSON_MODE_LABELS,
  LessonStatusBadge,
} from "@/components/lesson-status";
import { PageHeader, SectionTitle } from "@/components/editorial";
import {
  TeacherVisibilityNotice,
  visibilityBlocker,
} from "@/components/teacher-visibility-notice";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LEVEL_LABELS } from "@/components/student-profile-detail";
import {
  addDays,
  civilDateKeyInZone,
  wallClockToInstant,
} from "@/lib/availability/zone";
import { formatPrice } from "@/lib/format/price";
import { buildInbox, type InboxMessage } from "@/lib/messages/inbox";
import prisma from "@/lib/prisma";
import { checkPublishable } from "@/lib/teacher/publishable";
import {
  formatHours,
  openMinutesInPeriod,
  resolvePeriod,
} from "@/lib/teacher/activity";
import { isSubscriptionActive } from "@/lib/teacher/visibility";
import { cn } from "@/lib/utils";

/**
 * Accueil du prof — « Aujourd'hui ».
 *
 * Ce n'est pas un tableau de bord : c'est **sa journée**, et ce qui l'empêche de
 * la vivre tranquille. La colonne de gauche raconte le temps (les cours d'aujourd'hui
 * puis, en retrait, ceux de demain, refermés par les faits du mois) ; celle de
 * droite ne porte que des dettes — ce qui attend une réponse, ce qui manque à la
 * fiche, qui a écrit. Une ligne qui ne compte rien n'est pas rendue : un écran
 * couvert de zéros ne dit pas « rien à faire », il dit « lis tout pour le
 * découvrir ».
 *
 * Server Component rendu par /dashboard pour un compte prof ; l'accueil de
 * l'élève a son propre fichier, les deux n'ont rien en commun.
 */
export type TeacherHomeProps = {
  userId: string;
  firstName: string | null;
  timezone: string;
};

const AGENDA = "/dashboard/prof/agenda";
const HOURS = "/dashboard/prof/disponibilites";

/** Statuts qui occupent encore le créneau ou l'ont occupé : ce qu'on dessine. */
const DAY_STATUSES = ["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW"] as const;

const WEEKDAY_NAMES = [
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
  "dimanche",
];

/** Où se donne le cours : la même icône que dans l'agenda et le volet. */
const MODE_ICONS: Record<LessonLine["mode"], typeof Video> = {
  ONLINE: Video,
  TEACHER_PLACE: Home,
  STUDENT_PLACE: MapPin,
};

export async function TeacherHome({
  userId,
  firstName,
  timezone,
}: TeacherHomeProps) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      image: true,
      teacherProfile: {
        select: {
          id: true,
          slug: true,
          status: true,
          headline: true,
          bio: true,
          hourlyRateCents: true,
          teachesOnline: true,
          teachesInPerson: true,
          teachesAtHome: true,
          city: true,
          stripeCurrentPeriodEnd: true,
          _count: { select: { instruments: true, rules: true } },
        },
      },
    },
  });

  if (!user.teacherProfile) return null;

  const teacher = user.teacherProfile;
  const now = new Date();

  // Tout se borne dans le fuseau du prof : « aujourd'hui » est sa journée à
  // lui, pas celle du serveur ni celle du navigateur d'où il regarde.
  const todayKey = civilDateKeyInZone(now, timezone);
  const tomorrowKey = addDays(todayKey, 1);
  const dayStart = new Date(wallClockToInstant(todayKey, 0, timezone));
  const tomorrowStart = new Date(wallClockToInstant(tomorrowKey, 0, timezone));
  const afterTomorrow = new Date(
    wallClockToInstant(addDays(todayKey, 2), 0, timezone)
  );

  const period = resolvePeriod({ periode: "mois" }, now, timezone);

  const [
    dayRows,
    pendingCount,
    oldestPending,
    toCloseCount,
    lastToClose,
    reportsToWrite,
    monthCompleted,
    monthStudentIds,
    rules,
    exceptions,
  ] = await Promise.all([
    // Aujourd'hui **et** demain en une requête : deux listes, une lecture.
    prisma.booking.findMany({
      where: {
        teacherId: teacher.id,
        status: { in: [...DAY_STATUSES] },
        startsAt: { gte: dayStart, lt: afterTomorrow },
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        status: true,
        startsAt: true,
        endsAt: true,
        mode: true,
        meetingUrl: true,
        instrument: { select: { id: true, name: true, family: true } },
        student: {
          select: {
            id: true,
            user: { select: { name: true, image: true } },
            instruments: { select: { instrumentId: true, level: true } },
          },
        },
      },
    }),
    prisma.booking.count({
      where: { teacherId: teacher.id, status: "PENDING", endsAt: { gt: now } },
    }),
    // « La plus ancienne » se compte depuis sa **réception**, pas depuis la date
    // du cours : c'est le temps d'attente de l'élève qui fait la dette.
    prisma.booking.findFirst({
      where: { teacherId: teacher.id, status: "PENDING", endsAt: { gt: now } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, startsAt: true },
    }),
    prisma.booking.count({
      where: { teacherId: teacher.id, status: "CONFIRMED", endsAt: { lte: now } },
    }),
    prisma.booking.findFirst({
      where: { teacherId: teacher.id, status: "CONFIRMED", endsAt: { lte: now } },
      orderBy: { startsAt: "desc" },
      select: { startsAt: true, student: { select: { user: { select: { name: true } } } } },
    }),
    // Documentable au sens de `canDocument` — confirmé ou terminé et commencé —
    // mais sans compte rendu ouvert.
    prisma.booking.count({
      where: {
        teacherId: teacher.id,
        status: { in: ["CONFIRMED", "COMPLETED"] },
        startsAt: { lte: now },
        report: { is: null },
      },
    }),
    prisma.booking.findMany({
      where: {
        teacherId: teacher.id,
        status: "COMPLETED",
        startsAt: { gte: period.start, lt: period.end },
      },
      select: { startsAt: true, endsAt: true, priceCents: true, studentId: true },
    }),
    prisma.booking.findMany({
      where: {
        teacherId: teacher.id,
        status: { in: ["COMPLETED", "CONFIRMED", "NO_SHOW"] },
        startsAt: { gte: period.start, lt: period.end },
      },
      distinct: ["studentId"],
      select: { studentId: true },
    }),
    prisma.availabilityRule.findMany({
      where: { teacherId: teacher.id },
      select: {
        weekday: true,
        startMinute: true,
        endMinute: true,
        validFrom: true,
        validUntil: true,
      },
    }),
    prisma.availabilityException.findMany({
      where: {
        teacherId: teacher.id,
        date: {
          gte: new Date(`${period.startKey}T00:00:00Z`),
          lte: new Date(`${period.endKey}T00:00:00Z`),
        },
      },
      select: { date: true, type: true, startMinute: true, endMinute: true },
    }),
  ]);

  // Élèves déjà vus **avant** ce mois : la différence donne les nouveaux.
  const seenBefore = monthStudentIds.length
    ? await prisma.booking.findMany({
        where: {
          teacherId: teacher.id,
          studentId: { in: monthStudentIds.map((row) => row.studentId) },
          startsAt: { lt: period.start },
        },
        distinct: ["studentId"],
        select: { studentId: true },
      })
    : [];

  // Ce qui empêche la fiche d'être trouvée passe avant tout le reste : tant
  // qu'elle est invisible, rien d'autre sur cette page ne peut arriver.
  const publishable = checkPublishable({
    headline: teacher.headline,
    bio: teacher.bio,
    hourlyRateCents: teacher.hourlyRateCents,
    teachesOnline: teacher.teachesOnline,
    teachesInPerson: teacher.teachesInPerson,
    teachesAtHome: teacher.teachesAtHome,
    city: teacher.city,
    instrumentCount: teacher._count.instruments,
    availabilityRuleCount: teacher._count.rules,
  }).ok;
  const subscribed = isSubscriptionActive(teacher.stripeCurrentPeriodEnd, now);
  const blocker = visibilityBlocker({
    publishable,
    published: teacher.status === "PUBLISHED",
    subscribed,
  });

  const today = dayRows.filter((row) => row.startsAt < tomorrowStart);
  const tomorrow = dayRows.filter((row) => row.startsAt >= tomorrowStart);

  const messages = await recentThreads(teacher.id);

  // --- Mise en forme, toujours dans le fuseau du prof ---

  const timeOf = (date: Date) =>
    date.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    });
  const dayOf = (date: Date) =>
    date.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: timezone,
    });
  const shortDayOf = (date: Date) =>
    date.toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: timezone,
    });
  /** « 22 août » : la date d'un message, sans l'heure ni l'année. */
  const dayMonthOf = (date: Date) =>
    date.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      timeZone: timezone,
    });
  // « Demain, samedi 12 » : le jour nommé, pas seulement « Demain ». Une clé
  // civile est déjà exprimée dans le fuseau du prof — la relire dans un fuseau
  // la décalerait d'un jour, d'où le rendu en UTC.
  const tomorrowLabel = new Date(`${tomorrowKey}T00:00:00Z`).toLocaleDateString(
    "fr-FR",
    { weekday: "long", day: "numeric", timeZone: "UTC" }
  );
  const monthLabel = new Date(`${period.startKey}T00:00:00Z`).toLocaleDateString(
    "fr-FR",
    { month: "long", timeZone: "UTC" }
  );

  const lessons: LessonLine[] = dayRows.map((row) => {
    const practice = row.student.instruments.find(
      (entry) => entry.instrumentId === row.instrument.id
    );

    return {
      id: row.id,
      status: row.status,
      start: timeOf(row.startsAt),
      end: timeOf(row.endsAt),
      dateKey: civilDateKeyInZone(row.startsAt, timezone),
      mode: row.mode,
      meetingUrl: row.meetingUrl,
      instrumentName: row.instrument.name,
      family: row.instrument.family,
      level: practice?.level ?? null,
      studentId: row.student.id,
      studentName: row.student.user.name ?? "Élève",
      studentImage: row.student.user.image,
    };
  });
  const byId = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const todayLines = today.flatMap((row) => byId.get(row.id) ?? []);
  const tomorrowLines = tomorrow.flatMap((row) => byId.get(row.id) ?? []);

  // Accroche : deux faits, jamais un compteur nu. L'accord se fait sur chacun,
  // et le silence a droit à sa propre phrase plutôt qu'à « 0 cours, 0 demande ».
  const lead =
    todayLines.length === 0 && pendingCount === 0
      ? "Rien à traiter aujourd'hui."
      : [
          todayLines.length === 0
            ? "Aucun cours aujourd'hui."
            : todayLines.length === 1
              ? "1 cours aujourd'hui."
              : `${todayLines.length} cours aujourd'hui.`,
          pendingCount === 1
            ? "1 demande attend votre réponse et bloque un créneau."
            : pendingCount > 1
              ? `${pendingCount} demandes attendent votre réponse et bloquent chacune un créneau.`
              : null,
        ]
          .filter(Boolean)
          .join(" ");

  return (
    <div className="flex flex-col gap-10">
      {/* La date du jour tient lieu d'œil-de-bœuf. En capitales espacées elle se
          lirait comme une étiquette de rubrique, d'où `normal-case` et la seule
          initiale en majuscule — le français garde le mois en minuscule, ce que
          `capitalize` casserait. */}
      <PageHeader
        size="page"
        eyebrow={
          <span className="inline-block normal-case first-letter:uppercase">
            {dayOf(now)}
          </span>
        }
        title={firstName ? `Bonjour ${firstName}` : "Bonjour"}
        lead={lead}
        meta={
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Button variant="outline" size="sm" asChild>
              <Link href={`${AGENDA}?vue=jour&date=${todayKey}`}>
                <CalendarPlus className="mr-2 h-4 w-4" />
                Poser un cours
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={HOURS}>
                <CalendarOff className="mr-2 h-4 w-4" />
                Fermer une journée
              </Link>
            </Button>
          </div>
        }
      />

      {blocker ? <TeacherVisibilityNotice blocker={blocker} /> : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14">
        <div className="flex min-w-0 flex-col gap-10">
          <section className="flex flex-col gap-4">
            <SectionTitle
              trailing={
                <Link
                  href={AGENDA}
                  className="whitespace-nowrap text-xs text-muted hover:text-foreground hover:underline"
                >
                  Ouvrir l&apos;agenda →
                </Link>
              }
            >
              Aujourd&apos;hui
            </SectionTitle>

            {todayLines.length === 0 ? (
              <p className="text-sm text-muted">
                Aucun cours aujourd&apos;hui.
              </p>
            ) : (
              <ul className="divide-y divide-border border-y border-border">
                {todayLines.map((lesson) => (
                  <LessonRow key={lesson.id} lesson={lesson} />
                ))}
              </ul>
            )}
          </section>

          {tomorrowLines.length > 0 ? (
            <section className="flex flex-col gap-3">
              {/* Demain se lit en retrait : c'est un aperçu, pas une consigne.
                  Le jour est nommé — « Demain » seul oblige à compter. */}
              <SectionTitle className="opacity-70">
                <span className="normal-case tracking-normal first-letter:uppercase">
                  Demain, {tomorrowLabel}
                </span>
              </SectionTitle>
              <ul className="divide-y divide-border border-y border-border opacity-75">
                {tomorrowLines.map((lesson) => (
                  <LessonRow key={lesson.id} lesson={lesson} compact />
                ))}
              </ul>
            </section>
          ) : null}

          <MonthFacts
            completed={monthCompleted}
            monthLabel={monthLabel}
            studentCount={monthStudentIds.length}
            newStudents={monthStudentIds.length - seenBefore.length}
            openMinutes={openMinutesInPeriod(
              rules,
              exceptions,
              period,
              now,
              timezone
            )}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-8">
          <Todo
            pending={{
              count: pendingCount,
              detail: oldestPending
                ? `La plus ancienne date de ${shortDayOf(oldestPending.createdAt)} et bloque le ${shortDayOf(oldestPending.startsAt)}.`
                : null,
            }}
            toClose={{
              count: toCloseCount,
              detail: lastToClose
                ? `${shortDayOf(lastToClose.startsAt)} · ${lastToClose.student.user.name ?? "Élève"} — a-t-il eu lieu ?`
                : null,
            }}
            reports={reportsToWrite}
          />

          <FicheStatus
            blocker={blocker}
            slug={teacher.slug}
            subscribed={subscribed}
            periodEnd={teacher.stripeCurrentPeriodEnd}
            hasPhoto={user.image !== null}
            closedWeekdays={closedWeekdays(rules)}
            timezone={timezone}
          />

          {messages.length > 0 ? (
            <section className="flex flex-col gap-3">
              <SectionTitle>Messages</SectionTitle>
              <ul className="flex flex-col gap-3">
                {messages.map((thread) => (
                  <li key={thread.studentId}>
                    <Link
                      href={`/dashboard/prof/eleves/${thread.studentId}?onglet=messages`}
                      className="-mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-surface"
                    >
                      <Avatar className="h-9 w-9 shrink-0 border border-border">
                        <AvatarImage
                          src={thread.image || undefined}
                          alt={thread.name}
                        />
                        <AvatarFallback>
                          {thread.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {thread.name}
                        </p>
                        {/* « Vous : … » quand c'est le prof qui a écrit en
                            dernier : sans ce préfixe, sa propre phrase se lit
                            comme un message reçu. */}
                        <p className="truncate text-xs text-muted">
                          {thread.fromMe ? "Vous : " : ""}
                          {thread.preview}
                        </p>
                      </div>
                      {thread.unread > 0 ? (
                        <span className="shrink-0 rounded-full bg-primary px-1.5 text-xs font-semibold leading-5 text-primary-foreground">
                          {thread.unread}
                        </span>
                      ) : null}
                      <span className="shrink-0 text-xs text-subtle">
                        {dayMonthOf(thread.at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Une ligne de la frise : ce qu'il faut savoir d'un cours sans l'ouvrir. */
type LessonLine = {
  id: string;
  status: BookingStatus;
  start: string;
  end: string;
  dateKey: string;
  mode: "ONLINE" | "TEACHER_PLACE" | "STUDENT_PLACE";
  meetingUrl: string | null;
  instrumentName: string;
  family: InstrumentFamily;
  level: SkillLevel | null;
  studentId: string;
  studentName: string;
  studentImage: string | null;
};

/**
 * L'heure porte la ligne, en Cormorant : c'est la seule donnée qu'on cherche
 * quand on ouvre cet écran à 13h55. L'heure de fin la suit en petit — utile,
 * mais jamais ce qu'on lit en premier.
 */
function LessonRow({
  lesson,
  compact = false,
}: {
  lesson: LessonLine;
  compact?: boolean;
}) {
  const online = lesson.mode === "ONLINE";
  const ModeIcon = MODE_ICONS[lesson.mode];

  return (
    // Trois colonnes : l'heure, l'élève, l'action. Sous `sm` l'action passe à la
    // ligne plutôt que de comprimer le nom, qui est la seule donnée que la
    // colonne des heures ne porte pas.
    <li
      className={cn(
        "grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3 sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:gap-x-5",
        compact ? "py-4" : "py-5"
      )}
    >
      <div>
        <p
          className={cn(
            "font-display font-semibold leading-none tabular-nums",
            compact ? "text-2xl" : "text-2xl sm:text-[30px]"
          )}
        >
          {lesson.start}
        </p>
        {/* L'heure de fin ne vaut pas d'être répétée sur l'aperçu de demain :
            on y lit à quelle heure ça commence, pas la durée. */}
        {compact ? null : (
          <p className="mt-1 text-xs tabular-nums text-subtle">
            → {lesson.end}
          </p>
        )}
      </div>

      <div className="flex min-w-0 items-center gap-3.5">
        <Avatar
          className={cn(
            "shrink-0 border border-border",
            compact ? "h-9 w-9" : "h-11 w-11"
          )}
        >
          <AvatarImage
            src={lesson.studentImage || undefined}
            alt={lesson.studentName}
          />
          <AvatarFallback>
            {lesson.studentName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate text-[15px] font-medium">
            <Link
              href={`/dashboard/prof/eleves/${lesson.studentId}`}
              className="hover:underline"
            >
              {lesson.studentName}
            </Link>
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <InstrumentChip
              name={lesson.instrumentName}
              family={lesson.family}
              detail={
                lesson.level ? LEVEL_LABELS[lesson.level].toLowerCase() : null
              }
              size="xs"
            />
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <ModeIcon className="h-3 w-3 shrink-0" />
              {LESSON_MODE_LABELS[lesson.mode]}
            </span>
          </div>
        </div>
      </div>

      {/* L'état, puis l'unique action du moment : rejoindre si c'est en visio et
          que l'adresse existe, sinon ouvrir la journée à l'agenda. */}
      <div className="col-span-2 flex items-center justify-end gap-2 sm:col-span-1">
        <LessonStatusBadge status={lesson.status} />
        {compact ? null : online && lesson.meetingUrl ? (
          <Button size="sm" asChild>
            <a
              href={lesson.meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Video className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Rejoindre la visio</span>
            </a>
          </Button>
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link href={`${AGENDA}?vue=jour&date=${lesson.dateKey}`}>
              <span className="hidden sm:inline">Voir</span>
              <ArrowRight className="h-4 w-4 sm:ml-2" />
            </Link>
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * Les faits du mois, en quatre cellules séparées par un filet — pas quatre
 * cartes. Ce sont des repères, pas un pilotage : « Activité » existe pour ça, et
 * la dernière cellule y renvoie.
 */
function MonthFacts({
  completed,
  monthLabel,
  studentCount,
  newStudents,
  openMinutes,
}: {
  completed: { startsAt: Date; endsAt: Date; priceCents: number | null }[];
  /** « septembre » : le mois est nommé, pas sous-entendu par « ce mois ». */
  monthLabel: string;
  studentCount: number;
  newStudents: number;
  openMinutes: number;
}) {
  const cents = completed.reduce((sum, row) => sum + (row.priceCents ?? 0), 0);
  const taughtMinutes = completed.reduce(
    (sum, row) =>
      sum + (row.endsAt.getTime() - row.startsAt.getTime()) / 60_000,
    0
  );

  // L'unité appartient au chiffre (« 6 cours », « 3 élèves ») et la légende dit
  // de quoi il s'agit : un « 6 » nu au-dessus de « cours donnés » se lit deux
  // fois, une fois pour le nombre et une fois pour savoir ce qu'il compte.
  const cells = [
    {
      value: `${completed.length} cours`,
      label: `${completed.length === 1 ? "donné" : "donnés"} en ${monthLabel}`,
    },
    { value: formatPrice(cents), label: "réglés par vos élèves" },
    {
      value: `${studentCount} élève${studentCount > 1 ? "s" : ""}`,
      label:
        newStudents > 0
          ? `dont ${newStudents} nouveau${newStudents > 1 ? "x" : ""}`
          : `suivi${studentCount > 1 ? "s" : ""} en ${monthLabel}`,
    },
    {
      value: formatHours(Math.round(taughtMinutes)),
      label: `sur ${formatHours(openMinutes)} ouvertes`,
    },
  ];

  return (
    <section className="flex flex-col gap-4">
      <SectionTitle
        trailing={
          <Link
            href="/dashboard/prof/activite"
            className="text-xs text-muted hover:text-foreground hover:underline"
          >
            Activité →
          </Link>
        }
      >
        Ce mois-ci
      </SectionTitle>

      {/* Quatre cellules séparées par un filet, fermées en haut et en bas : une
          ligne de faits, pas quatre cartes. La règle de la page — des filets,
          jamais des boîtes — vaut ici comme ailleurs. */}
      {/* Quatre cellules séparées par un filet, fermées en haut et en bas : une
          ligne de faits, pas quatre cartes. La règle de la page — des filets,
          jamais des boîtes — vaut ici comme ailleurs. Les séparateurs sont un
          fond `bg-border` vu au travers d'une gouttière d'un pixel : `divide-x`
          se trompe de bord dès que la grille passe à deux rangées. */}
      <div className="grid grid-cols-2 gap-px border-y border-border bg-border sm:grid-cols-4">
        {cells.map((cell) => (
          <div key={cell.label} className="bg-background px-5 py-4">
            <p className="font-display text-[28px] font-semibold leading-none">
              {cell.value}
            </p>
            <p className="mt-1.5 text-xs text-muted">{cell.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * « À traiter » : les seules dettes de la journée, chacune avec son échéance
 * écrite. Un compteur seul (« 3 demandes ») ne dit pas si c'est urgent ; « la
 * plus ancienne date de mardi » le dit.
 */
function Todo({
  pending,
  toClose,
  reports,
}: {
  pending: { count: number; detail: string | null };
  toClose: { count: number; detail: string | null };
  reports: number;
}) {
  const rows = [
    pending.count > 0
      ? {
          key: "pending",
          href: "/dashboard/prof/demandes",
          label: "Demandes de cours",
          detail: pending.detail,
          count: pending.count,
          tone: "warning" as const,
        }
      : null,
    toClose.count > 0
      ? {
          key: "close",
          href: "/dashboard/prof/demandes?onglet=a-cloturer",
          label: "Cours à clôturer",
          detail: toClose.detail,
          count: toClose.count,
          tone: "primary" as const,
        }
      : null,
    reports > 0
      ? {
          key: "reports",
          href: "/dashboard/prof/comptes-rendus",
          label: "Comptes rendus à écrire",
          detail: "Vos élèves les lisent après chaque cours.",
          count: reports,
          tone: "neutral" as const,
        }
      : null,
  ].flatMap((row) => (row ? [row] : []));

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>À traiter</SectionTitle>

      {rows.length === 0 ? (
        <p className="text-sm text-muted">Rien à traiter.</p>
      ) : (
        // La seule carte de la page, et elle l'est pour une raison : ces lignes
        // portent chacune une action, là où le reste de la colonne ne fait que
        // constater.
        <div className="divide-y divide-border rounded-[var(--radius)] border border-border bg-elevated">
          {rows.map((row) => (
            <Link
              key={row.key}
              href={row.href}
              className="flex items-center gap-3.5 px-[18px] py-4 transition-colors first:rounded-t-[var(--radius)] last:rounded-b-[var(--radius)] hover:bg-surface"
            >
              <span
                className={cn(
                  "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  row.tone === "warning" && "bg-warning text-white",
                  row.tone === "primary" &&
                    "bg-primary text-primary-foreground",
                  row.tone === "neutral" && "bg-surface-strong text-muted"
                )}
              >
                {row.count}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{row.label}</span>
                {row.detail ? (
                  <span className="mt-0.5 block text-xs text-muted first-letter:uppercase">
                    {row.detail}
                  </span>
                ) : null}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-subtle" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * L'état de la fiche, en points. Vert = fait, ambre = à faire. Chaque point
 * amène là où on le corrige : un diagnostic sans porte de sortie renvoie le
 * prof chercher dans le menu ce que l'écran vient de lui dire.
 */
function FicheStatus({
  blocker,
  slug,
  subscribed,
  periodEnd,
  hasPhoto,
  closedWeekdays,
  timezone,
}: {
  blocker: "draft" | "incomplete" | "subscription" | null;
  slug: string;
  subscribed: boolean;
  periodEnd: Date | null;
  hasPhoto: boolean;
  closedWeekdays: number[];
  timezone: string;
}) {
  const date = (value: Date) =>
    value.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: timezone,
    });

  /**
   * Un point = un constat, et le geste qui le corrige posé à droite. Ce n'est
   * pas la ligne entière qui est cliquable : un constat vert n'a rien à ouvrir,
   * et « l'adresse publique » n'a de sens que lorsqu'elle mène quelque part —
   * proposer « voir ma fiche » sur une fiche invisible mène à un 404, qui se
   * lirait comme une panne.
   */
  const points: {
    key: string;
    ok: boolean;
    text: string;
    action?: { label: string; href: string; external?: boolean; muted?: boolean };
  }[] = [
    {
      key: "visible",
      ok: blocker === null,
      text:
        blocker === null
          ? "Votre fiche est visible des élèves."
          : blocker === "incomplete"
            ? "Fiche incomplète : elle n'apparaît pas dans la recherche."
            : blocker === "draft"
              ? "Fiche en brouillon : publiez-la pour être trouvé."
              : "Fiche publiée, mais sans abonnement actif elle reste invisible.",
      action:
        blocker === null
          ? { label: `/profs/${slug}`, href: `/profs/${slug}`, external: true, muted: true }
          : blocker === "subscription"
            ? { label: "S'abonner", href: "/dashboard/prof/abonnement" }
            : { label: "Compléter", href: "/dashboard/prof" },
    },
    {
      key: "abonnement",
      ok: subscribed,
      text: subscribed
        ? periodEnd
          ? `Abonnement actif jusqu'au ${date(periodEnd)}.`
          : "Abonnement actif."
        : periodEnd
          ? `Abonnement expiré le ${date(periodEnd)}.`
          : "Aucun abonnement.",
      action: subscribed
        ? undefined
        : { label: "Activer", href: "/dashboard/prof/abonnement" },
    },
  ];

  if (!hasPhoto) {
    points.push({
      key: "photo",
      ok: false,
      text: "Pas encore de photo — les fiches avec photo sont plus consultées.",
      action: { label: "Ajouter", href: "/dashboard/prof" },
    });
  }

  if (closedWeekdays.length > 0) {
    points.push({
      key: "fermes",
      ok: false,
      text: `${listInProse(
        closedWeekdays.map((weekday) => WEEKDAY_NAMES[weekday - 1])
      )} ${closedWeekdays.length > 1 ? "sont fermés" : "est fermé"}.`,
      action: { label: "Ouvrir des horaires", href: HOURS },
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>Ma fiche</SectionTitle>

      <ul className="flex flex-col gap-3 text-sm">
        {points.map((point) => (
          <li key={point.key} className="flex items-center gap-2.5">
            <span
              aria-hidden
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                point.ok ? "bg-success" : "bg-warning"
              )}
            />
            <span
              className={cn(
                "min-w-0 flex-1 first-letter:uppercase",
                point.ok ? "text-foreground" : "text-muted"
              )}
            >
              {point.text}
            </span>
            {point.action ? (
              <Link
                href={point.action.href}
                {...(point.action.external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className={cn(
                  "ml-auto shrink-0 whitespace-nowrap text-xs hover:underline",
                  point.action.muted ? "text-subtle" : "text-primary"
                )}
              >
                {point.action.label}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** « mardi, mercredi et jeudi » — la dernière conjonction en toutes lettres. */
function listInProse(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

/** Jours de la semaine type sans la moindre ouverture, dans l'ordre ISO. */
function closedWeekdays(rules: { weekday: number }[]): number[] {
  if (rules.length === 0) return [];

  const open = new Set(rules.map((rule) => rule.weekday));

  return [1, 2, 3, 4, 5, 6, 7].filter((weekday) => !open.has(weekday));
}

/**
 * Les trois derniers fils, du plus récent au plus ancien — et non les seuls
 * non-lus : « qui m'a écrit » reste une question même quand tout est lu, et un
 * bloc qui disparaît dès qu'on a répondu se lit comme une panne. Le compte de
 * non-lus, lui, vient de `buildInbox` : seule règle de « non lu », ici comme
 * dans /dashboard/messages et dans la pastille de la barre latérale.
 */
async function recentThreads(teacherId: string) {
  const [raw, reads] = await Promise.all([
    prisma.message.findMany({
      where: { teacherId, reportId: null },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        teacherId: true,
        studentId: true,
        sender: true,
        content: true,
        createdAt: true,
        attachments: { select: { id: true }, take: 1 },
        student: { select: { user: { select: { name: true, image: true } } } },
      },
    }),
    prisma.messageThreadState.findMany({
      where: { teacherId },
      select: {
        teacherId: true,
        studentId: true,
        teacherReadAt: true,
        studentReadAt: true,
      },
    }),
  ]);

  const party = new Map<string, { name: string | null; image: string | null }>();
  for (const message of raw) {
    if (!party.has(message.studentId)) {
      party.set(message.studentId, message.student.user);
    }
  }

  const messages: InboxMessage[] = raw.map((message) => ({
    teacherId: message.teacherId,
    studentId: message.studentId,
    sender: message.sender,
    content: message.content,
    hasAttachment: message.attachments.length > 0,
    createdAt: message.createdAt,
  }));

  return buildInbox(messages, reads, "TEACHER")
    .slice(0, 3)
    .map((conversation) => {
      const other = party.get(conversation.studentId);
      return {
        studentId: conversation.studentId,
        name: other?.name ?? "Élève",
        image: other?.image ?? null,
        unread: conversation.unread,
        fromMe: conversation.last.sender === "TEACHER",
        at: conversation.last.createdAt,
        preview:
          conversation.last.hasAttachment && !conversation.last.content.trim()
            ? "Pièce jointe"
            : conversation.last.content,
      };
    });
}
