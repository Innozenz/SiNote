import type { MetadataRoute } from "next";

import { absoluteUrl, siteUrl } from "@/lib/seo/config";

/**
 * robots.txt.
 *
 * On autorise tout l'espace public et on **bloque explicitement** les zones qui
 * n'ont aucune raison d'être indexées : l'espace connecté, l'admin, les routes
 * d'API et les écrans d'authentification. Ce sont des pages soit privées, soit
 * sans valeur pour un moteur, et les laisser crawler dilue le budget
 * d'exploration sur du vide.
 *
 * Le lien vers le sitemap est ce qui permet à un moteur de découvrir d'un coup
 * toutes les fiches profs et toutes les pages de cours, sans dépendre du seul
 * maillage interne.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dashboard/",
        "/admin/",
        "/onboarding",
        "/connexion",
        "/mot-de-passe-oublie",
        "/reinitialiser-mot-de-passe",
      ],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: siteUrl(),
  };
}
