import Link from "next/link";

/**
 * Pied de page des pages publiques.
 *
 * Server Component, sans état. Il portait un seul lien (« Trouver un prof »)
 * et aucune mention légale — pour une marketplace française, les mentions
 * légales, les CGU et la politique de confidentialité sont obligatoires, et
 * leur absence se lit comme un signal de méfiance avant même de laisser une
 * adresse e-mail. Pas de lien de connexion ici : l'en-tête l'affiche déjà, et
 * selon l'état de session.
 */
const GROUPS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Découvrir",
    links: [
      { href: "/profs", label: "Trouver un prof" },
      { href: "/profs?mode=online", label: "Cours en visio" },
      { href: "/enseigner", label: "Devenir prof" },
    ],
  },
  {
    title: "Informations",
    links: [
      { href: "/mentions-legales", label: "Mentions légales" },
      { href: "/cgu", label: "Conditions générales d'utilisation" },
      { href: "/confidentialite", label: "Confidentialité" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border py-12">
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-3">
          <span className="font-display text-lg font-bold uppercase tracking-[0.14em] text-foreground">
            SiNote
          </span>
          <p className="max-w-xs text-sm text-muted">
            Cours de musique et de chant avec des professeurs indépendants.
            Le règlement se fait directement entre vous et votre prof.
          </p>
        </div>

        <nav
          aria-label="Pied de page"
          className="grid grid-cols-2 gap-8 text-sm sm:gap-14"
        >
          {GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-2.5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtle">
                {group.title}
              </p>
              {group.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-muted underline-offset-4 hover:text-foreground hover:underline"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </div>

      <p className="mx-auto mt-10 max-w-5xl px-4 text-xs text-subtle">
        © {new Date().getFullYear()} SiNote. Aucune commission n&apos;est
        prélevée sur les cours.
      </p>
    </footer>
  );
}
