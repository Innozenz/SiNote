import { renderEmailHtml } from "./render-html";
import type { Notification } from "./templates";

/**
 * Envoi des notifications.
 *
 * Adaptateur volontairement mince : toute la logique — qui prévenir, de quoi —
 * vit dans templates.ts et se teste sans réseau. Ici il ne reste qu'un appel
 * HTTP, fait à la main plutôt qu'avec un SDK : une seule requête ne justifie
 * pas une dépendance de plus.
 *
 * Sans `RESEND_API_KEY`, les messages sont écrits dans la console. Le
 * développement reste donc utilisable sans compte chez un fournisseur, et on
 * voit exactement ce qui serait parti.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type SendResult =
  | { ok: true; transport: "resend" | "console" }
  | { ok: false; error: string };

export async function sendNotification(
  notification: Notification
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFICATIONS_FROM;

  if (!apiKey || !from) {
    console.info(
      `[NOTIFICATION] à ${notification.to} — ${notification.subject}\n${notification.text}`
    );
    return { ok: true, transport: "console" };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: notification.to,
        subject: notification.subject,
        // On envoie les deux : le HTML habille l'e-mail, le texte sert de repli
        // (clients sans HTML) et aide la délivrabilité.
        text: notification.text,
        html: renderEmailHtml(notification),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return { ok: false, error: `${response.status} ${detail.slice(0, 200)}` };
    }

    return { ok: true, transport: "resend" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "envoi impossible",
    };
  }
}

/**
 * Envoie sans jamais faire échouer l'appelant.
 *
 * Une notification est un effet de bord : si l'e-mail ne part pas, la
 * réservation reste valide et doit être confirmée à l'utilisateur. L'inverse —
 * une réservation refusée parce qu'un fournisseur d'e-mail est en panne —
 * serait absurde.
 *
 * Non attendu volontairement : la réponse HTTP ne doit pas dépendre de la
 * latence d'un tiers.
 */
export function notifyInBackground(
  notification: Notification | null
): void {
  if (!notification) return;

  void sendNotification(notification).then((result) => {
    if (!result.ok) {
      console.error(
        `[NOTIFICATION] échec vers ${notification.to} : ${result.error}`
      );
    }
  });
}
