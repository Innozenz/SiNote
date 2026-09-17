import { addDays, civilDateKeyInZone } from "@/lib/availability/zone";
import { monthGrid } from "@/lib/teacher/agenda";

/**
 * Mini-mois de l'élève.
 *
 * L'élève avait une grille hebdomadaire heure par heure — celle du prof, qui a
 * trente cours par semaine — pour deux cours par mois : presque toujours vide,
 * et illisible quand elle ne l'était pas. Ce qu'un élève veut savoir tient en
 * une question : *quels jours ai-je cours ?* Donc un mois, et une pastille par
 * jour plutôt qu'un bloc placé à l'heure.
 *
 * Module pur, testé, `now` injecté — même raison que le moteur de créneaux et
 * l'agenda du prof : la conversion instant → jour civil est invisible à la
 * relecture et se trompe d'un jour dès qu'on la bricole.
 */

/** Ce qu'une pastille dit d'un jour. */
export type MonthMark = "confirmed" | "pending" | "past";

/** Ordre d'affichage des pastilles d'un même jour. */
const MARK_ORDER: MonthMark[] = ["confirmed", "pending", "past"];

export type StudentMonthLesson = {
  startsAt: Date;
  endsAt: Date;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "NO_SHOW";
};

export type StudentMonthCell = {
  /** Date civile AAAA-MM-JJ, dans le fuseau de l'élève. */
  date: string;
  /** Appartient au mois affiché ; les jours voisins complètent les semaines. */
  inMonth: boolean;
  isToday: boolean;
  /** Pastilles du jour, dédoublonnées : au plus trois. */
  marks: MonthMark[];
  /** Nombre de cours ce jour-là, pour l'infobulle. */
  count: number;
};

export type StudentMonth = {
  /** Mois affiché, « AAAA-MM ». */
  month: string;
  /** Semaines de 7 jours, lundi → dimanche. */
  weeks: StudentMonthCell[][];
};

/** « AAAA-MM » valide — sinon l'appelant retombe sur le mois courant. */
export function isMonthKey(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Décale une clé de mois d'un nombre de mois, dans les deux sens. */
export function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  // Index absolu de mois : évite tout cas particulier de fin d'année.
  const index = year * 12 + (m - 1) + delta;

  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Mois courant de l'élève, dans **son** fuseau et non celui du serveur. */
export function currentMonthKey(now: Date, timezone: string): string {
  return civilDateKeyInZone(now, timezone).slice(0, 7);
}

/**
 * Ce que dit la pastille d'un cours.
 *
 * Un cours dont l'heure est passée est du passé, quel que soit son statut : le
 * prof ne l'a peut-être pas encore clôturé, mais il a eu lieu — le dire « à
 * venir » serait faux. Les statuts qui libèrent le créneau (annulé, refusé) ne
 * sont pas dessinés du tout : l'appelant ne les passe pas, comme l'agenda du
 * prof ne les dessine pas.
 */
function markOf(lesson: StudentMonthLesson, now: Date): MonthMark {
  if (lesson.endsAt.getTime() <= now.getTime()) return "past";
  if (lesson.status === "COMPLETED" || lesson.status === "NO_SHOW") return "past";

  return lesson.status === "PENDING" ? "pending" : "confirmed";
}

export function buildStudentMonth(input: {
  timezone: string;
  month: string;
  lessons: StudentMonthLesson[];
  now: Date;
}): StudentMonth {
  const { timezone, month, lessons, now } = input;
  const { gridStart, gridEnd } = monthGrid(month);
  const todayKey = civilDateKeyInZone(now, timezone);

  const byDay = new Map<string, MonthMark[]>();
  for (const lesson of lessons) {
    // Le cours est rangé sous son jour de **début**, lu à l'horloge.
    const key = civilDateKeyInZone(lesson.startsAt, timezone);
    const bucket = byDay.get(key) ?? [];
    bucket.push(markOf(lesson, now));
    byDay.set(key, bucket);
  }

  const weeks: StudentMonthCell[][] = [];
  let week: StudentMonthCell[] = [];

  // Garde-fou : une grille de mois ne dépasse jamais six semaines.
  for (let date = gridStart, guard = 0; date <= gridEnd && guard < 43; guard++) {
    const marks = byDay.get(date) ?? [];

    week.push({
      date,
      inMonth: date.slice(0, 7) === month,
      isToday: date === todayKey,
      marks: MARK_ORDER.filter((mark) => marks.includes(mark)),
      count: marks.length,
    });

    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }

    date = addDays(date, 1);
  }

  return { month, weeks };
}
