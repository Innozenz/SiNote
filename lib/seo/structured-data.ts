import { absoluteUrl, SITE_NAME, SITE_TAGLINE } from "./config";

/**
 * Constructeurs de données structurées (JSON-LD).
 *
 * Centralisés pour que chaque page décrive la même marque de la même façon : un
 * `Organization` et un `WebSite` incohérents d'une page à l'autre brouillent le
 * graphe de connaissances plutôt que de l'aider. Les pages injectent le résultat
 * via un `<script type="application/ld+json">`.
 */

type JsonLd = Record<string, unknown>;

/** L'organisation SiNote — identité de marque, logo, réseau. */
export function organizationSchema(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: absoluteUrl("/"),
    logo: absoluteUrl("/icon.svg"),
    description: SITE_TAGLINE,
  };
}

/**
 * Le site + sa boîte de recherche (sitelinks searchbox). La cible pointe vers la
 * recherche par instrument, qui est l'axe indexé et le plus utile.
 */
export function websiteSchema(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: absoluteUrl("/"),
    inLanguage: "fr-FR",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${absoluteUrl("/profs")}?instrument={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/** Fil d'Ariane. `items` sont ordonnés du plus général au plus précis. */
export function breadcrumbSchema(
  items: { name: string; path: string }[]
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/** FAQ — éligible aux résultats enrichis « questions fréquentes ». */
export function faqSchema(
  entries: { question: string; answer: string }[]
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  };
}

/**
 * Liste d'éléments (les profs d'une page de cours), avec leur URL. Aide les
 * moteurs à comprendre qu'une page de cours agrège une offre réelle.
 */
export function itemListSchema(
  urls: { name: string; path: string }[]
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: urls.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      url: absoluteUrl(entry.path),
    })),
  };
}

/**
 * Sérialise un ou plusieurs schémas pour un `dangerouslySetInnerHTML`. Le
 * `<` est échappé (`<`) pour qu'un contenu ne puisse pas fermer la balise
 * script — même si nos données sont maîtrisées, c'est l'usage sûr.
 */
export function jsonLdHtml(schema: JsonLd | JsonLd[]): string {
  return JSON.stringify(schema).replace(/</g, "\\u003c");
}
