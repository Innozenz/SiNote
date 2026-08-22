import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  // `sharp` (traitement d'images : photos de profil, pièces jointes) est un
  // module natif — il charge une lib système (`libvips`). Empaqueté par le
  // bundler serveur (Turbopack), son binaire natif ne se retrouve plus à côté
  // du chunk et le chargement échoue au runtime (« Could not load the sharp
  // module … libvips-cpp.so »), cassant jusqu'à l'envoi d'un message texte.
  // On le garde donc externe : il est requis depuis node_modules à l'exécution.
  serverExternalPackages: ["sharp"],

  // Ceinture-bretelles pour l'empaquetage serverless (Vercel/Lambda) : on force
  // l'inclusion du binaire natif de sharp et de sa lib `libvips` dans les
  // fonctions des routes qui traitent des images. Sans ça, seul le JS de sharp
  // est tracé et le `.so` manque à l'exécution (`libvips-cpp.so: cannot open
  // shared object file`). Les globs sont relatifs à la racine du projet ; sur
  // Vercel (build Linux) ils résolvent les paquets `@img/*-linux-x64`.
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/@img/**", "./node_modules/sharp/**"],
  },
  // Pas de distDir configurable : un répertoire de build alternatif n'est
  // ignoré ni par le scanner de Tailwind ni par eslint, qui se mettent alors à
  // lire les artefacts compilés. Pour lancer un second serveur, arrêter le
  // premier.

  // En-têtes de sécurité appliqués à toutes les réponses. Pas de
  // Content-Security-Policy ici : une CSP utile exige un nonce par requête
  // (donc le proxy) et une liste des origines réellement utilisées ;
  // une CSP posée à l'aveugle casserait l'hydratation de Next. Les en-têtes
  // ci-dessous, eux, sont sans risque de régression.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Personne n'a de raison d'afficher le site dans une iframe.
          { key: "X-Frame-Options", value: "DENY" },
          // Empêche le navigateur de deviner un type MIME plus permissif.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // L'URL complète (dont callbackUrl, jetons éventuels) ne sort pas
          // vers les sites tiers.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Le micro est autorisé pour l'origine même (`self`) : l'enregistrement
          // des notes audio des comptes rendus en a besoin. Caméra et
          // géolocalisation restent désactivées.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
