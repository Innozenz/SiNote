import type { SubscriptionReminderKind } from "@prisma/client";

import type { Notification } from "./templates";

/**
 * Rappel d'expiration de l'accès plateforme d'un prof.
 *
 * Pur et testable, comme les autres constructeurs de notifications. Aucun acteur
 * à exclure : c'est l'horloge qui déclenche, et le seul destinataire est le prof
 * concerné.
 *
 * La date est toujours dite dans le fuseau du prof, et de façon **exacte** — pas
 * « dans 5 jours » : le cron peut passer avec un peu de retard, une date fausse
 * serait pire que pas de date.
 */

export type SubscriptionExpiryContext = {
  teacherName: string | null;
  teacherEmail: string;
  /** Fin d'accès. */
  periodEnd: Date;
  /** Fuseau du prof (IANA). */
  timezone: string;
  kind: SubscriptionReminderKind;
  /** Racine des liens (NEXT_PUBLIC_APP_URL en prod). */
  appUrl: string;
};

export function buildSubscriptionExpiryReminder(
  context: SubscriptionExpiryContext
): Notification {
  const greeting = context.teacherName?.trim()
    ? `Bonjour ${context.teacherName.trim().split(" ")[0]},`
    : "Bonjour,";

  const dateLabel = context.periodEnd.toLocaleString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: context.timezone,
  });

  const soon = context.kind === "EXPIRY_J1";
  const link = `${context.appUrl}/dashboard/prof/abonnement`;

  return {
    to: context.teacherEmail,
    subject: soon
      ? "Votre accès SiNote expire demain"
      : "Votre accès SiNote expire bientôt",
    text: [
      greeting,
      ``,
      `Votre accès à SiNote prend fin le ${dateLabel}.`,
      ``,
      // Le vrai enjeu, dit clairement : ce qu'on perd à l'expiration.
      `Passé cette date, votre fiche n'apparaîtra plus dans les recherches et vos élèves ne pourront plus réserver de cours avec vous. Vos données, elles, sont conservées.`,
      ``,
      `Pour rester visible, prolongez votre accès ici :`,
      link,
    ].join("\n"),
  };
}
