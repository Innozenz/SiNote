import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { ActivityControls } from "@/components/activity-controls";
import { ActivityPaidToggle } from "@/components/activity-paid-toggle";
import { PageTitle, SectionTitle } from "@/components/editorial";
import { Badge } from "@/components/ui/badge";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  computeActivity,
  formatEuros,
  formatHours,
  JOURNAL_STATUS_LABELS,
  openMinutesInPeriod,
  PERIOD_LABELS,
  resolvePeriod,
  type Breakdown,
} from "@/lib/teacher/activity";

/**
 * Pilotage d'activité du prof : revenus, encaissement, remplissage, absences,
 * élèves, et journal sur une période, avec filtres. Server Component — le prof
 * arrive sur ses chiffres, sans état de chargement. La logique (bornes de
 * période dans son fuseau, agrégats, heures ouvertes) vit dans
 * `lib/teacher/activity.ts`, pure et testée.
 */
export default async function ActivitePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      timezone: true,
      teacherProfile: {
        select: {
          id: true,
          instruments: {
            select: { instrument: { select: { slug: true, name: true } } },
            orderBy: { instrument: { name: "asc" } },
          },
        },
      },
    },
  });

  if (!user.teacherProfile) redirect("/dashboard");

  const teacherId = user.teacherProfile.id;
  const timezone = user.timezone;
  const params = await searchParams;
  const first = (key: string) =>
    typeof params[key] === "string" ? (params[key] as string) : null;

  const now = new Date();
  const period = resolvePeriod(
    { periode: first("periode"), debut: first("debut"), fin: first("fin") },
    now,
    timezone
  );
  const instrumentSlug = first("instrument");
  const instrumentWhere = instrumentSlug
    ? { instrument: { slug: instrumentSlug } }
    : {};

  // Période précédente de même durée, immédiatement antérieure — sert aux
  // deltas (« +12 % vs période précédente »). Vaut pour tous les présets, y
  // compris personnalisé.
  const periodLength = period.end.getTime() - period.start.getTime();
  const prevStart = new Date(period.start.getTime() - periodLength);

  const [bookings, rules, exceptions, firstLessons, prevCompleted] =
    await Promise.all([
      // Statuts élargis : le journal ne retient que donnés/à venir/absents,
      // mais les annulations et les cours en attente nourrissent le taux
      // d'absence et le remplissage.
      prisma.booking.findMany({
        where: {
          teacherId,
          startsAt: { gte: period.start, lt: period.end },
          status: {
            in: [
              "COMPLETED",
              "CONFIRMED",
              "NO_SHOW",
              "PENDING",
              "CANCELLED",
              "DECLINED",
            ],
          },
          ...instrumentWhere,
        },
        select: {
          id: true,
          status: true,
          startsAt: true,
          endsAt: true,
          priceCents: true,
          isTrial: true,
          paidAt: true,
          instrument: { select: { name: true } },
          student: { select: { id: true, user: { select: { name: true } } } },
        },
      }),
      prisma.availabilityRule.findMany({
        where: { teacherId },
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
          teacherId,
          date: { gte: civilDate(period.startKey), lte: civilDate(period.endKey) },
        },
        select: { date: true, type: true, startMinute: true, endMinute: true },
      }),
      // Premier cours (réel : à venir, donné ou manqué) de chaque élève, tous
      // temps confondus : un élève est « nouveau » si ce premier cours tombe
      // dans la période.
      prisma.booking.groupBy({
        by: ["studentId"],
        where: {
          teacherId,
          status: { in: ["CONFIRMED", "COMPLETED", "NO_SHOW"] },
          ...instrumentWhere,
        },
        _min: { startsAt: true },
      }),
      prisma.booking.findMany({
        where: {
          teacherId,
          status: "COMPLETED",
          startsAt: { gte: prevStart, lt: period.start },
          ...instrumentWhere,
        },
        select: { priceCents: true },
      }),
    ]);

  const report = computeActivity(
    bookings.map((b) => ({
      id: b.id,
      status: b.status,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      priceCents: b.priceCents,
      isTrial: b.isTrial,
      paidAt: b.paidAt,
      instrumentName: b.instrument.name,
      studentId: b.student.id,
      studentName: b.student.user.name,
    })),
    period,
    now,
    timezone
  );

  const openMinutes = openMinutesInPeriod(rules, exceptions, period, now, timezone);
  const fillRate =
    openMinutes > 0 ? report.bookedMinutes / openMinutes : null;

  const newStudentCount = firstLessons.filter(
    (row) =>
      row._min.startsAt != null &&
      row._min.startsAt >= period.start &&
      row._min.startsAt < period.end
  ).length;

  const prevRealizedCents = prevCompleted.reduce(
    (acc, b) => acc + (b.priceCents ?? 0),
    0
  );
  const prevRealizedCount = prevCompleted.length;

  const instruments = user.teacherProfile.instruments.map((i) => i.instrument);

  const maxMonth = Math.max(1, ...report.byMonth.map((m) => m.cents));
  const isEmpty = report.journal.length === 0;
  const JOURNAL_CAP = 60;

  const dateTime = (instant: Date) =>
    instant.toLocaleString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    });

  const percent = (value: number | null) =>
    value == null ? "—" : `${Math.round(value * 100)} %`;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
      <header className="flex flex-col gap-5 border-b border-border pb-8">
        <div className="flex flex-col gap-2">
          <PageTitle size="page">Activité</PageTitle>
          <p className="text-sm text-muted">
            Vos revenus sur une période — réglés directement par vos élèves, hors
            plateforme.
          </p>
        </div>
        <ActivityControls instruments={instruments} />
      </header>

      {/* Chiffres clés de la période. */}
      <section className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
          <StatCell
            label="Revenus réalisés"
            value={formatEuros(report.realizedCents)}
            trend={
              <Trend current={report.realizedCents} previous={prevRealizedCents} />
            }
          />
          <StatCell
            label="Reste à encaisser"
            value={formatEuros(report.unpaidCents)}
            accent={report.unpaidCents > 0}
            hint={
              report.unpaidCount > 0
                ? `${report.unpaidCount} cours à régler`
                : "Tout est encaissé"
            }
          />
          <StatCell
            label="Prévu (à venir)"
            value={formatEuros(report.projectedCents)}
            hint={
              report.projectedCount > 0
                ? `${report.projectedCount} cours confirmés`
                : undefined
            }
          />
          <StatCell
            label="Cours donnés"
            value={String(report.realizedCount)}
            trend={
              <Trend current={report.realizedCount} previous={prevRealizedCount} />
            }
          />
        </div>

        {/* Indicateurs secondaires. */}
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
          <MiniStat label="Panier moyen" value={formatEuros(report.avgCents)} />
          <MiniStat
            label="Taux de remplissage"
            value={percent(fillRate)}
            hint={
              openMinutes > 0
                ? `${formatHours(report.bookedMinutes)} sur ${formatHours(openMinutes)} ouvertes`
                : "Aucune ouverture passée"
            }
          />
          <MiniStat
            label="Taux d'absence"
            value={percent(report.absenceRate)}
            hint={
              report.noShowCount + report.cancelledCount > 0
                ? `${report.noShowCount} absence(s) · ${report.cancelledCount} annulation(s)`
                : "Aucune"
            }
          />
          <MiniStat
            label="Élèves"
            value={String(report.studentCount)}
            hint={
              newStudentCount > 0
                ? `dont ${newStudentCount} nouveau${newStudentCount > 1 ? "x" : ""}`
                : "aucun nouveau"
            }
          />
        </div>

        <p className="text-xs text-subtle">
          {`${PERIOD_LABELS[period.preset]} · ${formatHours(report.taughtMinutes)} enseignées. Le réalisé ne compte que les cours clôturés ; l'encaissement se marque au journal.`}
        </p>
      </section>

      {isEmpty ? (
        <p className="border-t border-border pt-10 text-muted">
          Aucun cours sur cette période. Changez de période ou de filtre
          ci-dessus.
        </p>
      ) : (
        <>
          {report.byMonth.length >= 2 ? (
            <section className="flex flex-col gap-5">
              <SectionTitle>Évolution</SectionTitle>
              <div className="flex h-44 items-end gap-2">
                {report.byMonth.map((month) => (
                  <div
                    key={month.key}
                    className="flex flex-1 flex-col items-center gap-2"
                    title={`${month.label} — ${formatEuros(month.cents)} (${month.count} cours)`}
                  >
                    <div className="flex w-full flex-1 items-end">
                      <div
                        className="w-full rounded-t bg-primary"
                        style={{
                          height: `${(month.cents / maxMonth) * 100}%`,
                          minHeight: month.cents > 0 ? "3px" : "0",
                        }}
                      />
                    </div>
                    <span className="text-xs text-subtle">{month.label}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <div className="grid gap-10 sm:grid-cols-2">
            <BreakdownList
              title="Par instrument"
              rows={report.byInstrument}
              empty="Aucun cours clôturé."
            />
            <BreakdownList
              title="Par élève"
              rows={report.byStudent}
              empty="Aucun cours clôturé."
            />
          </div>

          <section className="flex flex-col gap-4">
            <SectionTitle>Journal des cours</SectionTitle>
            <ul className="divide-y divide-border border-y border-border">
              {report.journal.slice(0, JOURNAL_CAP).map((row) => (
                <li
                  key={row.id}
                  className="flex items-start justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {row.studentName}
                      <span className="text-muted"> · {row.instrumentName}</span>
                      {row.isTrial ? (
                        <span className="text-subtle"> · essai</span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-sm text-muted">
                      <span className="first-letter:uppercase">
                        {dateTime(row.startsAt)}
                      </span>
                      {` · ${row.durationMin} min`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <p className="font-medium">{formatEuros(row.cents)}</p>
                    {/* Un cours donné se règle ici même ; les autres n'affichent
                        que leur état (pas d'encaissement à suivre). */}
                    {row.counted ? (
                      <ActivityPaidToggle bookingId={row.id} paid={row.paid} />
                    ) : (
                      <Badge
                        variant={row.status === "NO_SHOW" ? "warning" : "secondary"}
                      >
                        {JOURNAL_STATUS_LABELS[row.status] ?? row.status}
                      </Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {report.journal.length > JOURNAL_CAP ? (
              <p className="text-sm text-subtle">
                {`${report.journal.length - JOURNAL_CAP} cours de plus — utilisez l'export CSV pour le détail complet.`}
              </p>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}

/** Clé civile → Date à minuit UTC, la forme d'une colonne `@db.Date`. */
function civilDate(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

/** Cellule de chiffre clé. `accent` la met en avant quand elle appelle une action. */
function StatCell({
  label,
  value,
  hint,
  trend,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  trend?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="bg-background p-5">
      <p
        className={`font-display text-3xl font-semibold leading-none ${accent ? "text-accent" : "text-foreground"}`}
      >
        {value}
      </p>
      <p className="mt-2 text-sm text-muted">{label}</p>
      {trend ?? (hint ? <p className="mt-1 text-xs text-subtle">{hint}</p> : null)}
    </div>
  );
}

/** Indicateur secondaire, plus discret que les chiffres clés. */
function MiniStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-background p-4">
      <p className="text-xs uppercase tracking-wide text-subtle">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}

/**
 * Variation par rapport à la période précédente. Une hausse est verte pour un
 * revenu comme pour un nombre de cours. Pas de repère quand la période
 * précédente était vide : « +∞ % » n'apprend rien.
 */
function Trend({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) {
    return current > 0 ? (
      <p className="mt-1 text-xs text-success">Nouveau sur la période</p>
    ) : null;
  }

  const delta = (current - previous) / previous;
  if (Math.round(delta * 100) === 0) {
    return <p className="mt-1 text-xs text-subtle">Stable vs période précédente</p>;
  }

  const up = delta > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;

  return (
    <p
      className={`mt-1 flex items-center gap-0.5 text-xs ${up ? "text-success" : "text-danger"}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {`${up ? "+" : ""}${Math.round(delta * 100)} % vs période précédente`}
    </p>
  );
}

/** Répartition avec une barre proportionnelle par ligne. */
function BreakdownList({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: Breakdown[];
  empty: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.cents));

  return (
    <section className="flex flex-col gap-4">
      <SectionTitle>{title}</SectionTitle>
      {rows.length === 0 ? (
        <p className="text-sm text-subtle">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.label} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium">{row.label}</span>
                <span className="shrink-0 text-muted">
                  {`${row.count} cours · `}
                  <span className="font-medium text-foreground">
                    {formatEuros(row.cents)}
                  </span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-strong">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(row.cents / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
