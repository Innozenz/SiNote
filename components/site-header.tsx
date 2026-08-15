import { headers } from "next/headers";
import Link from "next/link";
import { Search } from "lucide-react";

import { MobileNav } from "@/components/mobile-nav";
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
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-2 px-4">
        <Link href="/" aria-label="SiNote — accueil" className="shrink-0">
          <SiteLogo />
        </Link>

        {/* Barre complète à partir de `sm`. Sous ce seuil, tout passe dans le
            menu déroulant `MobileNav`, qui garde exactement les mêmes liens. */}
        <nav className="hidden items-center gap-2 sm:flex">
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
                <Link href="/enseigner">Devenir prof</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/connexion">Se connecter</Link>
              </Button>
            </>
          )}
        </nav>

        <div className="sm:hidden">
          <MobileNav isSignedIn={isSignedIn} />
        </div>
      </div>
    </header>
  );
}
