import sanitizeHtml from "sanitize-html";

/**
 * Assainissement du HTML des comptes rendus.
 *
 * Le prof rédige avec un éditeur riche (TipTap) dont la sortie est du HTML, mais
 * ce HTML est **affiché à l'élève** : le rendre tel quel serait une faille XSS
 * stockée (un `<script>` posté directement sur la route d'écriture, hors de
 * l'éditeur). On ne garde donc qu'une liste blanche stricte — exactement les
 * balises que produit notre configuration de TipTap — et rien d'autre : aucun
 * attribut, aucun lien (un `href: javascript:` serait un vecteur), aucune balise
 * hors liste (leur contenu texte est conservé, la balise jetée).
 *
 * Volontairement **côté serveur uniquement** : `sanitize-html` s'appuie sur un
 * parseur Node et n'a rien à faire dans le bundle client. On l'appelle donc à
 * l'écriture (la route PUT) et à chaque frontière où le contenu part vers un
 * composant de rendu, jamais dans un composant client.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "em",
    "s",
    "h2",
    "h3",
    "ul",
    "ol",
    "li",
    "blockquote",
  ],
  allowedAttributes: {},
  // Le contenu texte d'une balise interdite est conservé, seule la balise saute.
  disallowedTagsMode: "discard",
};

/** HTML assaini, prêt à être rendu à l'élève comme au prof. */
export function sanitizeReportHtml(dirty: string): string {
  return sanitizeHtml(dirty, OPTIONS);
}

/**
 * Texte nu d'un compte rendu, pour la recherche : les balises deviennent des
 * espaces afin qu'« la gamme » se retrouve même quand « gamme » est en gras.
 */
export function reportPlainText(html: string): string {
  // Une espace entre deux blocs, sinon « <h3>Exercice 1</h3><p>Apprendre…</p> »
  // se lirait « Exercice 1Apprendre… » une fois les balises retirées.
  return sanitizeHtml(html.replace(/<\/(p|li|h2|h3|blockquote|br)\s*>|<br\s*\/?>/gi, "$& "), {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/\s+/g, " ")
    .trim();
}