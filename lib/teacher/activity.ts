import { dayOpenings, type ExceptionInput, type RuleInput } from "@/lib/availability";
import {
  addDays,
  civilDateKeyInZone,
  formatKey,
  localMinutesInZone,
  MINUTES_PER_DAY,
  wallClockToInstant,
} from "@/lib/availability/zone";

/**
 * Pilotage d'activité du prof : période, agrégats, journal, CSV.
 *
 * Module **pur** (aucun Prisma, ne lit jamais l'horloge — `now` est passé) : le
 * calcul des bornes de période est sensible au fuseau, et cette propriété est
 * ce qui le rend testable au changement d'heure. On charge les réservations
 * dans l'appelant, puis on les agrège ici.
 *
 * Le « revenu » est ce que le prof encaisse **hors plateforme** : SiNote
 * n'encaisse rien. Le réalisé ne compte que les cours clôturés (COMPLETED) ;
 * le prévisionnel, les cours confirmés encore à venir.
 */

export const PERIOD_PRESETS = [
  "30j",
  "mois",
  "mois-dernier",
  "annee",
  "perso",
] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  "30j": "30 derniers jours",
  mois: "Ce mois-ci",
  "mois-dernier": "Mois dernier",
  annee: "Cette année",
  perso: "Personnalisé",
};

export type PeriodParams = {
  periode?: string | null;
  debut?: string | null;
  fin?: string | null;
};

export type Period = {
  preset: PeriodPreset;
  /** Instant inclusif du début. */
  start: Date;
  /** Instant exclusif de fin. */
  end: Date;
  /** Date civile du premier jour inclus (AAAA-MM-JJ). */
  startKey: string;
  /** Date civile du dernier jour inclus (AAAA-MM-JJ). */
  endKey: string;
};

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function isPreset(value: string | null | undefined): value is PeriodPreset {
  return value != null && (PERIOD_PRESETS as readonly string[]).includes(value);
}

/** Premier jour du mois d'une clé civile. */
function monthStart(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return formatKey(year, month, 1);
}

/** Décale d'un nombre de mois le premier jour du mois d'une clé. */
function shiftMonth(monthStartKey: string, delta: number): string {
  const [year, month] = monthStartKey.split("-").map(Number);
  const index = year * 12 + (month - 1) + delta;
  return formatKey(Math.floor(index / 12), (index % 12) + 1, 1);
}

function yearStart(key: string): string {
  const [year] = key.split("-").map(Number);
  return formatKey(year, 1, 1);
}

/**
 * Résout la période demandée en un intervalle d'instants `[start, end)`, calculé
 * dans le fuseau du prof. Les présets couvrent le mois/l'année **entiers** (pas
 * seulement jusqu'à aujourd'hui) pour que le prévisionnel de la fin de période
 * ait sa place. Un `perso` invalide retombe sur le mois courant.
 */
export function resolvePeriod(
  params: PeriodParams,
  now: Date,
  timezone: string
): Period {
  const todayKey = civilDateKeyInZone(now, timezone);
  const requested = isPreset(params.periode) ? params.periode : "mois";

  const customValid =
    requested === "perso" &&
    !!params.debut &&
    DATE_KEY.test(params.debut) &&
    !!params.fin &&
    DATE_KEY.test(params.fin) &&
    params.debut <= params.fin;

  const preset: PeriodPreset =
    requested === "perso" && !customValid ? "mois" : requested;

  let startKey: string;
  let endExclusiveKey: string;

  switch (preset) {
    case "perso":
      startKey = params.debut as string;
      endExclusiveKey = addDays(params.fin as string, 1);
      break;
    case "30j":
      startKey = addDays(todayKey, -29);
      endExclusiveKey = addDays(todayKey, 1);
      break;
    case "mois-dernier":
      startKey = shiftMonth(monthStart(todayKey), -1);
      endExclusiveKey = monthStart(todayKey);
      break;
    case "annee":
      startKey = yearStart(todayKey);
      endExclusiveKey = shiftMonth(yearStart(todayKey), 12);
      break;
    case "mois":
    default:
      startKey = monthStart(todayKey);
      endExclusiveKey = shiftMonth(monthStart(todayKey), 1);
      break;
  }

  return {
    preset,
    start: new Date(wallClockToInstant(startKey, 0, timezone)),
    end: new Date(wallClockToInstant(endExclusiveKey, 0, timezone)),
    startKey,
    endKey: addDays(endExclusiveKey, -1),
  };
}

export type ActivityBooking = {
  id: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  priceCents: number | null;
  isTrial: boolean;
  /** Instant où le prof a marqué le cours réglé. Nul = pas encore encaissé. */
  paidAt: Date | null;
  instrumentName: string;
  studentId: string;
  studentName: string | null;
};

export type Breakdown = { label: string; cents: number; count: number };
export type MonthBar = { key: string; label: string; cents: number; count: number };

export type JournalRow = {
  id: string;
  startsAt: Date;
  status: string;
  studentName: string;
  instrumentName: string;
  durationMin: number;
  cents: number;
  isTrial: boolean;
  /** Réglé par l'élève (marqué par le prof). Pertinent pour les seuls cours donnés. */
  paid: boolean;
  /** Compté dans le réalisé (cours clôturé). */
  counted: boolean;
};

export type ActivityReport = {
  realizedCents: number;
  realizedCount: number;
  /** Part du réalisé déjà encaissée (cours donné **et** marqué payé). */
  paidCents: number;
  /** Part du réalisé encore due — le « reste à encaisser ». */
  unpaidCents: number;
  unpaidCount: number;
  taughtMinutes: number;
  projectedCents: number;
  projectedCount: number;
  avgCents: number;
  /** Cours marqués absents sur la période. */
  noShowCount: number;
  /** Cours annulés ou refusés sur la période (par l'une ou l'autre partie). */
  cancelledCount: number;
  /**
   * Part d'absences parmi les cours qui devaient avoir lieu
   * (donnés + absents). `null` si aucun cours à ce jour — pas de taux à afficher.
   */
  absenceRate: number | null;
  /**
   * Minutes de cours réellement posées sur le temps **écoulé** de la période
   * (cours qui occupaient un créneau et ont déjà commencé). Numérateur du taux
   * de remplissage — le dénominateur (heures ouvertes) se calcule à part, il
   * dépend des règles de dispo.
   */
  bookedMinutes: number;
  /** Nombre d'élèves distincts vus sur la période (cours donnés/à venir/absents). */
  studentCount: number;
  byInstrument: Breakdown[];
  byStudent: Breakdown[];
  byMonth: MonthBar[];
  journal: JournalRow[];
};

/** Statuts retenus au journal — les cours qui ont eu lieu ou auront lieu. */
const JOURNAL_STATUSES = new Set(["COMPLETED", "CONFIRMED", "NO_SHOW"]);

/** Statuts qui occupent un créneau (numérateur du remplissage). */
const OCCUPYING_STATUSES = new Set([
  "PENDING",
  "CONFIRMED",
  "COMPLETED",
  "NO_SHOW",
]);

/** Un cours qui n'aura pas lieu : sa trace compte au dénominateur des absences ? Non — il a libéré son créneau. */
const CANCELLED_STATUSES = new Set(["CANCELLED", "DECLINED"]);

function durationMin(booking: { startsAt: Date; endsAt: Date }): number {
  return Math.round((booking.endsAt.getTime() - booking.startsAt.getTime()) / 60000);
}

function groupByLabel(
  bookings: ActivityBooking[],
  label: (b: ActivityBooking) => string
): Breakdown[] {
  const map = new Map<string, Breakdown>();
  for (const booking of bookings) {
    const key = label(booking);
    const current = map.get(key) ?? { label: key, cents: 0, count: 0 };
    current.cents += booking.priceCents ?? 0;
    current.count += 1;
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => b.cents - a.cents || b.count - a.count);
}

/** Suite des mois « AAAA-MM » couverts par la période, trous compris. */
function enumerateMonths(period: Period): string[] {
  const [startMonth, endMonth] = [
    period.startKey.slice(0, 7),
    period.endKey.slice(0, 7),
  ];
  const [sy, sm] = startMonth.split("-").map(Number);
  const [ey, em] = endMonth.split("-").map(Number);

  const out: string[] = [];
  let index = sy * 12 + (sm - 1);
  const last = ey * 12 + (em - 1);
  // Garde-fou : une plage personnalisée absurde ne doit pas produire des
  // milliers de barres.
  while (index <= last && out.length < 36) {
    out.push(
      `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`
    );
    index++;
  }
  return out;
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("fr-FR", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

/**
 * Agrège les réservations d'une période. Les réservations sont supposées déjà
 * filtrées à la période côté requête, mais on refiltre par sécurité sur
 * `startsAt ∈ [start, end)` — la source de vérité reste l'intervalle.
 */
export function computeActivity(
  bookings: ActivityBooking[],
  period: Period,
  now: Date,
  timezone: string
): ActivityReport {
  const inRange = bookings.filter(
    (b) => b.startsAt >= period.start && b.startsAt < period.end
  );

  const completed = inRange.filter((b) => b.status === "COMPLETED");
  const projected = inRange.filter(
    (b) => b.status === "CONFIRMED" && b.startsAt.getTime() > now.getTime()
  );

  const realizedCents = completed.reduce((acc, b) => acc + (b.priceCents ?? 0), 0);
  const projectedCents = projected.reduce((acc, b) => acc + (b.priceCents ?? 0), 0);
  const taughtMinutes = completed.reduce((acc, b) => acc + durationMin(b), 0);

  // Encaissé vs reste à encaisser : le réalisé compte l'argent *gagné* (cours
  // donné), pas l'argent *reçu*. L'élève règle hors plateforme, souvent en
  // décalé — c'est cette différence que le prof vient piloter.
  const paid = completed.filter((b) => b.paidAt != null);
  const unpaid = completed.filter((b) => b.paidAt == null);
  const paidCents = paid.reduce((acc, b) => acc + (b.priceCents ?? 0), 0);
  const unpaidCents = unpaid.reduce((acc, b) => acc + (b.priceCents ?? 0), 0);

  const noShowCount = inRange.filter((b) => b.status === "NO_SHOW").length;
  const cancelledCount = inRange.filter((b) =>
    CANCELLED_STATUSES.has(b.status)
  ).length;
  const absenceDenom = completed.length + noShowCount;
  const absenceRate = absenceDenom === 0 ? null : noShowCount / absenceDenom;

  // Remplissage : minutes de cours déjà commencés sur la période, bornées à
  // `now` (un cours en cours ne compte que pour sa part écoulée), pour un
  // rapport cohérent avec les heures ouvertes écoulées.
  const bookedMinutes = inRange
    .filter(
      (b) => OCCUPYING_STATUSES.has(b.status) && b.startsAt.getTime() < now.getTime()
    )
    .reduce((acc, b) => {
      const end = Math.min(b.endsAt.getTime(), now.getTime());
      return acc + Math.max(0, Math.round((end - b.startsAt.getTime()) / 60000));
    }, 0);

  const studentCount = new Set(
    inRange
      .filter((b) => JOURNAL_STATUSES.has(b.status))
      .map((b) => b.studentId)
  ).size;

  const monthTotals = new Map<string, { cents: number; count: number }>();
  for (const booking of completed) {
    const key = civilDateKeyInZone(booking.startsAt, timezone).slice(0, 7);
    const current = monthTotals.get(key) ?? { cents: 0, count: 0 };
    current.cents += booking.priceCents ?? 0;
    current.count += 1;
    monthTotals.set(key, current);
  }

  const byMonth: MonthBar[] = enumerateMonths(period).map((key) => {
    const totals = monthTotals.get(key) ?? { cents: 0, count: 0 };
    return { key, label: monthLabel(key), cents: totals.cents, count: totals.count };
  });

  const journal: JournalRow[] = inRange
    .filter((b) => JOURNAL_STATUSES.has(b.status))
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
    .map((b) => ({
      id: b.id,
      startsAt: b.startsAt,
      status: b.status,
      studentName: b.studentName ?? "Élève",
      instrumentName: b.instrumentName,
      durationMin: durationMin(b),
      cents: b.priceCents ?? 0,
      isTrial: b.isTrial,
      paid: b.paidAt != null,
      counted: b.status === "COMPLETED",
    }));

  return {
    realizedCents,
    realizedCount: completed.length,
    paidCents,
    unpaidCents,
    unpaidCount: unpaid.length,
    taughtMinutes,
    projectedCents,
    projectedCount: projected.length,
    avgCents: completed.length
      ? Math.round(realizedCents / completed.length)
      : 0,
    noShowCount,
    cancelledCount,
    absenceRate,
    bookedMinutes,
    studentCount,
    byInstrument: groupByLabel(completed, (b) => b.instrumentName),
    byStudent: groupByLabel(completed, (b) => b.studentName ?? "Élève"),
    byMonth,
    journal,
  };
}

/**
 * Minutes d'ouverture sur la partie **écoulée** de la période, dans le fuseau
 * du prof — le dénominateur du taux de remplissage.
 *
 * Pur et testable comme le reste : parcourt les jours civils de la période,
 * borne le dernier jour à `now` (les ouvertures encore à venir aujourd'hui ne
 * comptent pas, pour rester cohérent avec les minutes réservées), et somme les
 * ouvertures que `dayOpenings` retient (règles − congés). Comme l'agenda, on
 * raisonne en minutes murales : le changement d'heure ne fausse que deux jours
 * par an, ce qui illustre sans prétendre au chronomètre.
 */
export function openMinutesInPeriod(
  rules: RuleInput[],
  exceptions: ExceptionInput[],
  period: Period,
  now: Date,
  timezone: string
): number {
  const todayKey = civilDateKeyInZone(now, timezone);
  const nowMinutes = localMinutesInZone(now, timezone);
  // La période s'arrête à aujourd'hui : au-delà, rien n'est encore « écoulé ».
  const lastKey = period.endKey < todayKey ? period.endKey : todayKey;

  let total = 0;
  // Garde-fou : une plage personnalisée absurde ne doit pas boucler sans fin.
  for (
    let day = period.startKey, guard = 0;
    day <= lastKey && guard < 400;
    day = addDays(day, 1), guard++
  ) {
    const cap = day === todayKey ? nowMinutes : MINUTES_PER_DAY;
    for (const interval of dayOpenings(day, rules, exceptions).open) {
      const end = Math.min(interval.end, cap);
      if (end > interval.start) total += end - interval.start;
    }
  }

  return total;
}

export const JOURNAL_STATUS_LABELS: Record<string, string> = {
  COMPLETED: "Donné",
  CONFIRMED: "À venir",
  NO_SHOW: "Absent",
};

/** Centimes → euros sans décimales, séparateur français (« 1 250 € »). */
export function formatEuros(cents: number): string {
  return `${(cents / 100).toLocaleString("fr-FR", {
    maximumFractionDigits: 0,
  })} €`;
}

/** Minutes → « 12 h » ou « 12 h 30 ». */
export function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

function csvCell(value: string): string {
  // Guillemets, virgules, sauts de ligne : on entoure et on double les
  // guillemets, format CSV standard.
  return /["\n\r,;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Journal en CSV, pour la compta. Séparateur `;` (Excel FR le préfère au `,`,
 * qui sert de décimale), dates et heures dans le fuseau du prof.
 */
export function activityCsv(journal: JournalRow[], timezone: string): string {
  const header = [
    "Date",
    "Heure",
    "Élève",
    "Instrument",
    "Durée (min)",
    "Statut",
    "Montant (€)",
    "Compté au CA",
    "Payé",
  ];

  const lines = journal.map((row) =>
    [
      row.startsAt.toLocaleDateString("fr-FR", {
        timeZone: timezone,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
      row.startsAt.toLocaleTimeString("fr-FR", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
      }),
      row.studentName,
      row.instrumentName + (row.isTrial ? " (essai)" : ""),
      String(row.durationMin),
      JOURNAL_STATUS_LABELS[row.status] ?? row.status,
      (row.cents / 100).toFixed(2).replace(".", ","),
      row.counted ? "oui" : "non",
      // Le règlement ne concerne que les cours donnés ; ailleurs la case est vide.
      row.counted ? (row.paid ? "oui" : "non") : "",
    ]
      .map(csvCell)
      .join(";")
  );

  return [header.join(";"), ...lines].join("\r\n");
}
