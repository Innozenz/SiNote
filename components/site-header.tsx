import { headers } from "next/headers";
import Link from "next/link";
import { Search } from "lucide-react";

import { SiteLogo } from "@/components/site-logo";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";

/**
 * En-tête des pages publiques.
 *
 * Server Component : l'affichage dépend de la session, lue côté serveur, donc
 * ni clignotement au chargement ni état à attendre côté client.
 *
 * « Mon espace » pointe sur `/dashboard`, le hub, et non sur une sous-page :
 * c'est /dashboard qui route ensuite selon le rôle (élève/prof, ou /onboarding
 * si le rôle est nul). Inutile donc de lire le rôle ici — une requête DB de
 * moins sur chaque page publique.
 */
export async function SiteHeader() {
  const session = await auth.api.getSession({ headers: await headers() });
  const isSignedIn = Boolean(session?.user);

  return (
    <header className="border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <Link href="/" aria-label="SiNote — accueil">
          <SiteLogo />
        </Link>

        <nav className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/profs">
              <Search className="mr-2 h-4 w-4" />
              Trouver un prof
            </Link>
          </Button>

          {isSignedIn ? (
            <Button size="sm" asChild>
              <Link href="/dashboard">Mon espace</Link>
            </Button>
          ) : (
            <>
              {/* Vitrine côté profs : inutile pour un utilisateur déjà connecté,
                  qui a forcément un rôle. */}
              <Button variant="ghost" size="sm" asChild>
                <Link href="/enseigner">Enseigner</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/connexion">Se connecter</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
