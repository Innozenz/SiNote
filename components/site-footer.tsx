import Link from "next/link";

/**
 * Pied de page des pages publiques.
 *
 * Server Component, sans état. **Les trois mentions légales sont obligatoires**
 * pour une marketplace française, et leur absence se lit comme un signal de
 * méfiance avant même de laisser une adresse e-mail : ce sont les seuls liens
 * que ce pied de page doit porter. Pas de lien de connexion ni de « Trouver un
 * prof » : l'en-tête les affiche déjà sur toutes les pages publiques, et selon
 * l'état de session.
 */
const LINKS: { href: string; label: string }[] = [
  { href: "/mentions-legales", label: "Mentions légales" },
  { href: "/cgu", label: "CGU" },
  { href: "/confidentialite", label: "Confidentialité" },
];

export function SiteFooter() {
  return (
    <footer className="mx-auto max-w-[82rem] px-4 sm:px-8">
      {/* Un simple filet et une ligne : la page se termine, elle ne redémarre
          pas sur un plan du site. Les trois colonnes précédentes doublaient
          l'en-tête (« Trouver un prof », « Devenir prof »), qui est présent sur
          toutes les pages publiques. */}
      <div className="flex flex-col gap-4 border-t border-border py-8 text-[0.8125rem] text-subtle sm:flex-row sm:items-center sm:justify-between">
        <span>© SiNote {new Date().getFullYear()}</span>

        <nav
          aria-label="Pied de page"
          className="flex flex-wrap gap-x-6 gap-y-2"
        >
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
