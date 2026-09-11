import type { Notification } from "./templates";

/**
 * Inscription d'un prof : message aux administrateurs.
 *
 * Fonction pure, comme `report.ts` — aucune requête, aucun envoi. L'orchestration
 * (qui sont les administrateurs, l'envoi effectif) passe par
 * `notifyAdminsInBackground` dans `lib/admin/notify.ts`.
 *
 * Pourquoi prévenir : une fiche prof naît en brouillon, invisible tant qu'elle
 * n'est ni complétée, ni publiée, ni abonnée. Sans ce message, un nouveau prof
 * n'existe pour l'équipe que le jour où quelqu'un ouvre `/admin/utilisateurs`
 * — c'est-à-dire trop tard pour l'accompagner, ou pour lui accorder un accès
 * manuel s'il n'a pas à passer par Stripe.
 */

export type TeacherSignupContext = {
  name: string | null;
  email: string;
  slug: string;
  /** Fuseau retenu à l'inscription (IANA), ou null si non reconnu. */
  timezone: string | null;
};

export function buildTeacherSignupNotifications(
  recipients: readonly string[],
  context: TeacherSignupContext,
  appUrl: string
): Notification[] {
  const displayName = context.name?.trim() || context.email;

  const lines = [
    `${displayName} vient de s'inscrire comme professeur.`,
    "",
    `E-mail : ${context.email}`,
    `Adresse de la fiche : ${appUrl}/profs/${context.slug}`,
    context.timezone ? `Fuseau : ${context.timezone}` : null,
    "",
    // Dire l'état réel de la fiche : elle n'est pas en ligne, et personne
    // n'a rien à modérer. Le message informe, il ne demande pas d'agir.
    "La fiche est en brouillon : elle ne sera visible qu'une fois complétée, publiée et l'accès plateforme actif.",
    "",
    "Voir le compte dans l'administration :",
    `${appUrl}/admin/utilisateurs?q=${encodeURIComponent(context.email)}`,
  ].filter((line): line is string => line !== null);

  const text = lines.join("\n");

  return recipients.map((to) => ({
    to,
    subject: `Nouveau prof inscrit — ${displayName}`,
    text,
  }));
}
