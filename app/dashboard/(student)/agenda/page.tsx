import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/editorial";
import {
  StudentAgenda,
  type StudentAgendaNav,
  type StudentAgendaRow,
} from "@/components/student-agenda";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { addDays, civilDateKeyInZone } from "@/lib/availability/zone";
import { startOfWeek, weekRange } from "@/lib/teacher/agenda";

/**
 * Agenda hebdomadaire de l'élève.
 *
 * Comme l'agenda prof, la période affichée vit dans l'URL (`?semaine=…` /
 * `?vue=jour&date=…`) : partageable, en favori, retour arrière correct. Rendu à
 * la demande — un cours confirmé à l'instant doit apparaître. L'élève n'a pas de
 * disponibilités : la grille ne montre que ses cours, tous profs confondus.
 */
export default async function StudentAgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ semaine?: string; vue?: string; date?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) redirect("/");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { timezone: true, studentProfile: { select: { id: true } } },
  });

  if (!user.studentProfile) redirect("/dashboard");

  const now = new Date();
  const timezone = user.timezone;
  const params = await searchParams;

  const todayKey = civilDateKeyInZone(now, timezone);
  const currentWeek = startOfWeek(todayKey);
  const view = params.vue === "jour" ? "jour" : "semaine";

  const AGENDA = "/dashboard/agenda";

  let weekStart: string;
  let days: number;
  let nav: StudentAgendaNav;

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
    };
  } else {
    weekStart = isCivilDate(params.semaine)
      ? startOfWeek(params.semaine)
      : currentWeek;
    days = 7;
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
    };
  }

  const range = weekRange(weekStart, timezone, days);

  const bookings = await prisma.booking.findMany({
    // Annulés / refusés exclus : ils ont libéré le créneau, ils ne sont plus au
    // planning. Leur trace reste dans « Mes réservations ».
    where: {
      studentId: user.studentProfile.id,
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
      meetingUrl: true,
      address: true,
      instrument: { select: { name: true } },
      teacher: { select: { slug: true, user: { select: { name: true } } } },
    },
  });

  const rows: StudentAgendaRow[] = bookings.map((booking) => ({
    id: booking.id,
    status: booking.status as StudentAgendaRow["status"],
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    mode: booking.mode,
    isTrial: booking.isTrial,
    priceCents: booking.priceCents,
    meetingUrl: booking.meetingUrl,
    address: booking.address,
    instrumentName: booking.instrument.name,
    teacherName: booking.teacher.user.name,
    teacherSlug: booking.teacher.slug,
  }));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader eyebrow="Espace élève" title="Mon agenda" />
      <StudentAgenda
        rows={rows}
        weekStart={weekStart}
        days={days}
        view={view}
        timezone={timezone}
        nav={nav}
      />
    </div>
  );
}

function isCivilDate(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
