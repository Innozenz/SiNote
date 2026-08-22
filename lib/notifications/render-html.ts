import type { Notification } from "./templates";

/**
 * Habillage HTML de marque des e-mails.
 *
 * Volontairement **générique** : il transforme le corps texte déjà produit par
 * les constructeurs de notifications (`templates.ts`, `account.ts`,
 * `subscription.ts`, `reminders.ts`…) en un e-mail présentable, sans qu'aucun
 * d'eux n'ait à changer. Le texte reste la source ; le HTML n'est qu'une mise
 * en forme. Resend envoie les deux — `text` sert de repli et aide la
 * délivrabilité.
 *
 * Contraintes propres à l'e-mail respectées :
 * - **styles en ligne** (les clients ignorent le plus souvent `<style>`) ;
 * - **mise en page en tableaux** (Outlook n'a pas de flexbox) ;
 * - couleurs de la charte codées en dur — un e-mail n'a pas accès aux jetons
 *   CSS de l'app (mêmes hex que la charte : bleu de Prusse, or, crème).
 *
 * Tout texte est **échappé** : `studentMessage`, un avis, un nom… sont des
 * contenus utilisateur et ne doivent jamais être injectés en HTML brut.
 */

const COLORS = {
  bg: "#f5efe1", // crème (fond de page)
  card: "#fdfaf2", // carte élevée
  ink: "#1f2b33", // texte principal (bleu-ardoise)
  muted: "#5c6b73", // texte secondaire
  primary: "#123551", // bleu de Prusse (marque, boutons)
  accent: "#a97f38", // or antique (filet)
  border: "#e7dcc4",
};

const URL_RE = /(https?:\/\/[^\s]+)/;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Bouton pleine largeur, en tableau pour Outlook. */
function button(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0;"><tr><td style="border-radius:8px;background:${COLORS.primary};">
    <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
  </td></tr></table>`;
}

/** Une ligne de texte → paragraphe, citation, ou bouton selon son contenu. */
function renderLine(line: string): string {
  const trimmed = line.trim();
  if (trimmed === "") return "";

  const urlMatch = trimmed.match(URL_RE);

  if (urlMatch) {
    const url = urlMatch[0];

    // « Libellé : https://… » → bouton portant le libellé.
    const labelled = trimmed.match(/^(.*?):\s*(https?:\/\/\S+)$/);
    if (labelled && labelled[1].trim()) {
      return button(labelled[1].trim(), labelled[2]);
    }

    // URL seule sur la ligne → bouton générique.
    if (trimmed === url) {
      return button("Ouvrir SiNote", url);
    }

    // URL au milieu d'une phrase : lien en ligne.
    const linked = escapeHtml(trimmed).replace(
      escapeHtml(url),
      `<a href="${escapeHtml(url)}" style="color:${COLORS.primary};">${escapeHtml(url)}</a>`
    );
    return paragraph(linked, true);
  }

  // Citation d'un avis : « … ».
  if (trimmed.startsWith("«")) {
    return `<p style="margin:0 0 12px;padding:10px 14px;border-left:3px solid ${COLORS.accent};background:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-style:italic;color:${COLORS.muted};">${escapeHtml(trimmed)}</p>`;
  }

  return paragraph(escapeHtml(trimmed), true);
}

function paragraph(inner: string, preEscaped: boolean): string {
  const content = preEscaped ? inner : escapeHtml(inner);
  return `<p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:${COLORS.ink};">${content}</p>`;
}

export function renderEmailHtml(notification: Notification): string {
  const body = notification.text
    .split("\n")
    .map(renderLine)
    .filter((chunk) => chunk !== "")
    .join("\n");

  const year = new Date().getFullYear();

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(notification.subject)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.bg};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.bg};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;">
        <tr><td style="padding:8px 4px 16px;">
          <span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;letter-spacing:0.5px;color:${COLORS.primary};">SiNote</span>
          <div style="height:2px;width:40px;background:${COLORS.accent};margin-top:8px;"></div>
        </td></tr>
        <tr><td style="background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:14px;padding:28px 26px;">
          <h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:600;line-height:1.3;color:${COLORS.ink};">${escapeHtml(notification.subject)}</h1>
          ${body}
        </td></tr>
        <tr><td style="padding:18px 4px 4px;">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${COLORS.muted};">
            SiNote — trouvez votre professeur de musique.<br>
            Cet e-mail vous a été envoyé automatiquement, merci de ne pas y répondre.<br>
            © ${year} SiNote
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
