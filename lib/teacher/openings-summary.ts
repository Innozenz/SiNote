import { AFTERNOON_FROM, EVENING_FROM } from "@/lib/bookings/day-period";

/**
 * Résumé lisible d'une semaine type : « lun. matin et soir · mar. · jeu. soir ».
 *
 * La fiche publique n'offrait que le widget pour savoir *quand* un prof donne
 * cours ; il fallait feuilleter les semaines pour comprendre qu'il n'enseigne
 * que le lundi. Une ligne suffit, et elle est vraie par construction : elle
 * vient des mêmes règles que le moteur de créneaux.
 *
 * Module pur, en minutes-depuis-minuit dans le fuseau du prof — les règles
 * sont déjà exprimées ainsi, aucune conversion n'est nécessaire. Les plages
 * (matin / après-midi / soir) reprennent les frontières de `day-period.ts`,
 * pour que le résumé et le widget parlent la même langue.
 */
type Rule = { weekday: number; startMinute: number; endMinute: number };

const DAY_ABBREV: Record<number, string> = {
  1: "lun.",
  2: "mar.",
  3: "mer.",
  4: "jeu.",
  5: "ven.",
  6: "sam.",
  7: "dim.",
};

const PERIODS: { label: string; from: number; to: number }[] = [
  { label: "matin", from: 0, to: AFTERNOON_FROM },
  { label: "après-midi", from: AFTERNOON_FROM, to: EVENING_FROM },
  { label: "soir", from: EVENING_FROM, to: 24 * 60 },
];

/** « a et b », « a, b et c ». */
function joinFr(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} et ${parts[parts.length - 1]}`;
}

export function summarizeOpenings(rules: Rule[]): string | null {
  if (rules.length === 0) return null;

  const days: string[] = [];

  for (let weekday = 1; weekday <= 7; weekday += 1) {
    const dayRules = rules.filter((rule) => rule.weekday === weekday);
    if (dayRules.length === 0) continue;

    const covered = PERIODS.filter((period) =>
      dayRules.some(
        (rule) => rule.startMinute < period.to && rule.endMinute > period.from
      )
    ).map((period) => period.label);

    // Une seule plage qui va du matin au soir : le jour seul suffit. Deux
    // plages disjointes (9–13 et 18–22) touchent aussi les trois périodes,
    // mais les nommer reste plus juste que de laisser croire à une journée
    // continue.
    const allDay = dayRules.some(
      (rule) => rule.startMinute < AFTERNOON_FROM && rule.endMinute > EVENING_FROM
    );
    days.push(
      allDay ? DAY_ABBREV[weekday] : `${DAY_ABBREV[weekday]} ${joinFr(covered)}`
    );
  }

  return days.join(" · ");
}
