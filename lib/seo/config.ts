/**
 * Configuration SEO partagée.
 *
 * `siteUrl()` est l'unique source de l'URL publique canonique — lue par le
 * sitemap, le robots.txt et les données structurées. Elle vient de
 * `NEXT_PUBLIC_APP_URL` (baked au build), **sans slash final**, pour que la
 * concaténation `siteUrl() + "/profs"` ne produise jamais de `//`.
 *
 * En production cette variable doit être l'URL réellement déployée
 * (https://www.sinote.fr), sinon sitemap, canonical et OG pointent vers
 * localhost — un site invisible pour les moteurs.
 */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

/** URL absolue à partir d'un chemin racine (`/profs` → `https://…/profs`). */
export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Nom de la marque, réutilisé dans les titres et le JSON-LD. */
export const SITE_NAME = "SiNote";

/**
 * Baseline de la marque : une phrase qui porte les mots-clés cœur de cible
 * (« réservation en ligne », « cours de musique ») sans jamais mentir sur ce
 * qu'est le produit.
 */
export const SITE_TAGLINE =
  "Réservez en ligne des cours de musique, de chant et de MAO avec un professeur près de chez vous.";
