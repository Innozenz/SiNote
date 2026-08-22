import type { SubscriptionReminderKind } from "@prisma/client";

/**
 * Quand prévenir un prof que son accès plateforme approche de sa fin.
 *
 * Fonction pure, `now` injecté : testable sans attendre l'échéance, comme le
 * rappel de cours (`lib/reminders/schedule.ts`).
 *
 * Deux préavis, du plus large au plus serré. La fenêtre est **ouverte vers le
 * bas** pour la même raison que les rappels de cours : viser l'instant exact
 * suppose que le cron tourne pile à l'heure. On envoie donc un préavis dès que
 * l'échéance entre dans sa fenêtre, et l'unicité en base empêche le doublon.
 *
 * En marche normale (un passage par jour ou par heure), J5 part ~5 jours avant
 * et J1 ~1 jour avant, sans se chevaucher. Si le cron a été interrompu
 * plusieurs jours, les deux peuvent tomber au même passage — J5 déjà réclamé
 * est simplement ignoré, et prévenir deux fois vaut mieux que ne jamais
 * prévenir.
 */

export const SUBSCRIPTION_REMINDER_LEADS: {
  kind: SubscriptionReminderKind;
  leadHours: number;
}[] = [
  { kind: "EXPIRY_J5", leadHours: 5 * 24 },
  { kind: "EXPIRY_J1", leadHours: 1 * 24 },
];

/** Préavis le plus large : borne haute de la requête. */
export const MAX_LEAD_HOURS = Math.max(
  ...SUBSCRIPTION_REMINDER_LEADS.map((l) => l.leadHours)
);

/**
 * Préavis dus pour une échéance donnée : ceux dont la fenêtre est entamée et
 * l'échéance pas encore passée. Un accès déjà expiré ne déclenche rien — il n'y
 * a plus rien à prévenir.
 */
export function dueSubscriptionReminders(
  periodEnd: Date,
  now: Date
): SubscriptionReminderKind[] {
  if (periodEnd.getTime() <= now.getTime()) return [];

  return SUBSCRIPTION_REMINDER_LEADS.filter(
    ({ leadHours }) =>
      periodEnd.getTime() <= now.getTime() + leadHours * 3_600_000
  ).map(({ kind }) => kind);
}
