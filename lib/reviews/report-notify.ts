import { notifyAdminsInBackground } from "@/lib/admin/notify";
import {
  buildReportNotifications,
  type ReportContext,
} from "@/lib/notifications/report";

/**
 * Prévient la modération qu'un avis a été signalé.
 *
 * Le contenu est pur et testé dans `lib/notifications/report.ts` ; la
 * résolution des administrateurs et l'envoi sont partagés avec l'inscription
 * d'un prof dans `lib/admin/notify.ts`.
 *
 * Non attendu, et n'échoue jamais : le signalement est enregistré et visible
 * dans la file que l'e-mail parte ou non.
 */
export function notifyReportInBackground(context: ReportContext): void {
  notifyAdminsInBackground("REVIEW_REPORT", (recipients, appUrl) =>
    buildReportNotifications(recipients, context, appUrl)
  );
}
