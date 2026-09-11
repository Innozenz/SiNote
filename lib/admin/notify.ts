import type { Notification } from "@/lib/notifications/templates";
import { sendNotification } from "@/lib/notifications/send";
import prisma from "@/lib/prisma";

/**
 * Prévient les administrateurs d'un événement de plateforme.
 *
 * Orchestration commune au signalement d'avis et à l'inscription d'un prof :
 * résoudre qui est administrateur, construire les messages via un builder pur
 * (testé sans base), envoyer. Le builder reçoit la liste des destinataires
 * parce que leur nombre n'est pas connu à l'avance — il n'y a ni acteur à
 * exclure, ni destinataire fixe.
 *
 * Non attendu, et n'échoue jamais : l'événement est enregistré que l'e-mail
 * parte ou non. Refuser une inscription parce qu'un fournisseur d'e-mail est en
 * panne serait absurde.
 */
export function notifyAdminsInBackground(
  tag: string,
  build: (recipients: string[], appUrl: string) => Notification[]
): void {
  void (async () => {
    try {
      const admins = await prisma.user.findMany({
        where: { isAdmin: true },
        select: { email: true },
      });

      if (admins.length === 0) {
        // Pas une erreur : tant que personne n'est administrateur, il n'y a
        // personne à prévenir. Le dire évite de chercher un e-mail perdu.
        console.info(`[${tag}] enregistré, aucun administrateur à prévenir`);
        return;
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

      for (const notification of build(
        admins.map((admin) => admin.email),
        appUrl
      )) {
        const result = await sendNotification(notification);

        if (!result.ok) {
          console.error(
            `[${tag}] échec vers ${notification.to} : ${result.error}`
          );
        }
      }
    } catch (error) {
      console.error(`[${tag}] notification impossible`, error);
    }
  })();
}
