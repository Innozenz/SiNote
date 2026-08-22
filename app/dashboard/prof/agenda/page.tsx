import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { type AgendaNav } from "@/components/agenda-view-switch";
import {
  TeacherAgenda,
  type AgendaRow,
} from "@/components/teacher-agenda";
import { TeacherMonth, type MonthLesson } from "@/components/teacher-month";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isMinor } from "@/lib/student/profile";
import { ageOn } from "@/lib/user/age";
import { addDays, civilDateKeyInZone } from "@/lib/availability/zone";
import {
  buildMonthAgenda,
  monthRange,
  startOfWeek,
  weekRange,
} from "@/lib/teacher/agenda";

/**
 * Agenda hebdomadaire du prof.
 *
 * La semaine affichée vit dans l'URL (`?semaine=AAAA-MM-JJ`), pas dans un état
 * React : une semaine se partage, se met en favori, et le bouton retour ramène
 * à la précédente. Même raisonnement que les filtres de /profs.
 *
 * Rendu à la demande et non mis en cache : un cours confirmé il y a dix
 * secondes doit apparaître.
 */
export default async function TeacherAgendaPage({
  searchParams,
}: {
  searchParams: Promise<{
    semaine?: string;
    vue?: string;
    date?: string;
    mois?: string;
  }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) redirect("/");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      timezone: true,
      teacherProfile: { select: { id: true, slotGranularityMin: true } },
    },
  });

  if (!user.teacherProfile) redirect("/dashboard");

  const now = new Date();
  const timezone = user.timezone;
  const params = await searchParams;

  // Tout se lit dans le fuseau du prof : un prof à Tokyo un lundi matin ne doit
  // pas atterrir sur la semaine passée du serveur.
  const todayKey = civilDateKeyInZone(now, timezone);
  const currentWeek = startOfWeek(todayKey);
  const view =
    params.vue === "jour"
      ? "jour"
      : params.vue === "mois"
        ? "mois"
        : "semaine";

  const AGENDA = "/dashboard/prof/agenda";
  const currentMonth = todayKey.slice(0, 7);

  // Vue mois : aperçu en lecture seule, avec sa propre requête et son propre
  // rendu — le mois ne dessine pas le fond de disponibilité, donc ni règles ni
  // exceptions à charger.
  if (view === "mois") {
    const month = isMonth(params.mois) ? params.mois : currentMonth;
    const range = monthRange(month, timezone);

    const bookings = await prisma.booking.findMany({
      where: {
        teacherId: user.teacherProfile.id,
        status: { in: ["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW"] },
        startsAt: { gte: range.from, lt: range.to },
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        status: true,
        startsAt: true,
        endsAt: true,
        instrument: { select: { name: true } },
        student: { select: { user: { select: { name: true } } } },
      },
    });

    const monthAgenda = buildMonthAgenda<MonthLesson>({
      timezone,
      month,
      now,
      events: bookings.map((booking) => ({
        id: booking.id,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        status: booking.status as MonthLesson["status"],
        studentName: booking.student.user.name,
        instrumentName: booking.instrument.name,
      })),
    });

    // Depuis le mois, « Jour »/« Semaine » ouvrent aujourd'hui si le mois est en
    // cours, sinon le 1er du mois affiché.
    const dayAnchor = month === currentMonth ? todayKey : `${month}-01`;
    const monthNav: AgendaNav = {
      previousHref: `${AGENDA}?vue=mois&mois=${shiftMonthKey(month, -1)}`,
      nextHref: `${AGENDA}?vue=mois&mois=${shiftMonthKey(month, 1)}`,
      currentHref: month !== currentMonth ? `${AGENDA}?vue=mois` : null,
      currentLabel: "Ce mois",
      dayHref: `${AGENDA}?vue=jour&date=${dayAnchor}`,
      weekHref: `${AGENDA}?semaine=${startOfWeek(dayAnchor)}`,
      monthHref: `${AGENDA}?vue=mois&mois=${month}`,
    };

    return <TeacherMonth agenda={monthAgenda} nav={monthNav} />;
  }

  // `weekStart` désigne le premier jour affiché : le lundi en vue semaine, le
  // jour choisi en vue jour. Une valeur fantaisiste ramène à aujourd'hui/la
  // semaine courante plutôt qu'à une erreur — une URL tronquée reste utilisable.
  let weekStart: string;
  let days: number;
  let nav: AgendaNav;

  if (view === "jour") {
    weekStart = isCivilDate(params.date) ? params.date : todayKey;
    days = 1;
    nav = {
      previousHref: `${AGENDA}?vue=jour&date=${addDays(weekStart, -1)}`,
      nextHref: `${AGENDA}?vue=jour&date=${addDays(weekStart, 1)}`,
      currentHref: weekStart !== todayKey ? `${AGENDA}?vue=jour` : null,
      currentLabel: "Aujourd'hui",
      dayHref: `${AGENDA}?vue=jour&date=${weekStart}`,
      weekHref: `${AGENDA}?semaine=${startOfWeek(weekStart)}`,
      monthHref: `${AGENDA}?vue=mois&mois=${weekStart.slice(0, 7)}`,
    };
  } else {
    weekStart = isCivilDate(params.semaine)
      ? startOfWeek(params.semaine)
      : currentWeek;
    days = 7;
    // Depuis la semaine, « Jour » ouvre aujourd'hui si la semaine le contient,
    // sinon son lundi.
    const dayTarget =
      todayKey >= weekStart && todayKey <= addDays(weekStart, 6)
        ? todayKey
        : weekStart;
    nav = {
      previousHref: `${AGENDA}?semaine=${addDays(weekStart, -7)}`,
      nextHref: `${AGENDA}?semaine=${addDays(weekStart, 7)}`,
      currentHref: weekStart !== currentWeek ? AGENDA : null,
      currentLabel: "Cette semaine",
      dayHref: `${AGENDA}?vue=jour&date=${dayTarget}`,
      weekHref: `${AGENDA}?semaine=${weekStart}`,
      monthHref: `${AGENDA}?vue=mois&mois=${weekStart.slice(0, 7)}`,
    };
  }

  const range = weekRange(weekStart, timezone, days);

  const [rules, exceptions, bookings] = await Promise.all([
    prisma.availabilityRule.findMany({
      where: { teacherId: user.teacherProfile.id },
      select: {
        weekday: true,
        startMinute: true,
        endMinute: true,
        validFrom: true,
        validUntil: true,
      },
    }),
    // Les exceptions sont bornées à la semaine affichée ; le moteur ne retient
    // de toute façon que celles dont la date tombe dans le jour calculé.
    prisma.availabilityException.findMany({
      where: {
        teacherId: user.teacherProfile.id,
        date: {
          gte: civilDate(weekStart),
          lte: civilDate(addDays(weekStart, days - 1)),
        },
      },
      select: {
        date: true,
        type: true,
        startMinute: true,
        endMinute: true,
        reason: true,
      },
    }),
    prisma.booking.findMany({
      // Annulés et refusés sont exclus : ils ont libéré leur créneau, ils
      // n'occupent plus l'agenda. Leur trace reste dans les demandes.
      where: {
        teacherId: user.teacherProfile.id,
        status: { in: ["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW"] },
        startsAt: { lt: range.to },
        endsAt: { gt: range.from },
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        status: true,
        startsAt: true,
        endsAt: true,
        mode: true,
        isTrial: true,
        priceCents: true,
        studentMessage: true,
        instrument: { select: { name: true } },
        student: {
          select: {
            id: true,
            // Profil complet : le prof peut le consulter en modale depuis un
            // cours de l'agenda, comme sur une demande.
            birthDate: true,
            city: true,
            goals: true,
            musicalBackground: true,
            readsSheetMusic: true,
            voiceType: true,
            prefersOnline: true,
            preferredGenres: true,
            guardianName: true,
            guardianEmail: true,
            guardianPhone: true,
            user: { select: { name: true } },
            instruments: {
              select: {
                level: true,
                yearsPracticed: true,
                ownsInstrument: true,
                instrument: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  const rows: AgendaRow[] = bookings.map((booking) => {
    const student = booking.student;
    return {
      id: booking.id,
      status: booking.status as AgendaRow["status"],
      startsAt: booking.startsAt.toISOString(),
      endsAt: booking.endsAt.toISOString(),
      mode: booking.mode,
      isTrial: booking.isTrial,
      priceCents: booking.priceCents,
      studentMessage: booking.studentMessage,
      instrumentName: booking.instrument.name,
      studentId: student.id,
      studentName: student.user.name,
      studentProfile: {
        age: student.birthDate ? ageOn(student.birthDate, now) : null,
        isMinor: isMinor(student.birthDate, now),
        city: student.city,
        goals: student.goals,
        background: student.musicalBackground,
        readsSheetMusic: student.readsSheetMusic,
        voiceType: student.voiceType,
        prefersOnline: student.prefersOnline,
        genres: student.preferredGenres,
        instruments: student.instruments.map((entry) => ({
          name: entry.instrument.name,
          level: entry.level,
          yearsPracticed: entry.yearsPracticed,
          ownsInstrument: entry.ownsInstrument,
        })),
        guardian: {
          name: student.guardianName,
          email: student.guardianEmail,
          phone: student.guardianPhone,
        },
      },
    };
  });

  return (
    <TeacherAgenda
      rows={rows}
      rules={rules.map((rule) => ({
        ...rule,
        // Colonnes `@db.Date` : relues en UTC, sans quoi elles décaleraient
        // d'un jour pour tout fuseau derrière UTC.
        validFrom: toCivilKey(rule.validFrom),
        validUntil: toCivilKey(rule.validUntil),
      }))}
      exceptions={exceptions.map((exception) => ({
        ...exception,
        date: toCivilKey(exception.date)!,
      }))}
      weekStart={weekStart}
      days={days}
      view={view}
      timezone={timezone}
      granularityMin={user.teacherProfile.slotGranularityMin}
      nav={nav}
    />
  );
}

function isCivilDate(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isMonth(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value);
}

/** Décale une clé de mois « AAAA-MM » d'un nombre de mois. */
function shiftMonthKey(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const index = year * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Clé civile → Date à minuit UTC, la forme d'une colonne `@db.Date`. */
function civilDate(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

function toCivilKey(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}
