import type { Role } from "@prisma/client";
import Link from "next/link";
import { Search } from "lucide-react";

import { SiteLogo } from "@/components/site-logo";
import { UserNav, type NavUser } from "@/components/user-nav";
import { Button } from "@/components/ui/button";

/**
 * En-tête de l'espace connecté.
 *
 * Même coquille que `SiteHeader` — hauteur, logo, largeur — pour qu'on ne
 * change pas de site en se connectant. C'est la seule chose que l'ancien
 * bandeau ne faisait pas : il n'affichait ni le nom du produit, ni de retour
 * vers les pages publiques, ni de moyen de se déconnecter, et l'espace prof
 * empilait donc deux barres sans identité.
 *
 * Le rôle, `isAdmin` **et l'identité** sont passés par le layout, qui a déjà lu
 * l'utilisateur pour son propre contrôle : les relire ici ferait une requête de
 * plus par page, et les lire côté client les ferait clignoter — puis rester
 * périmés après un changement de nom, la session étant mise en cache.
 *
 * Cet en-tête n'habille que l'espace d'administration (le reste de l'espace
 * connecté a sa barre latérale). Un admin peut aussi être prof ou élève : s'il
 * a un rôle, « chez soi » reste son tableau de bord ; sinon, son espace admin.
 */
export function AppHeader({
  role,
  isAdmin,
  user,
}: {
  role: Role | null;
  isAdmin: boolean;
  user: NavUser;
}) {
  // Le logo renvoie au hub `/dashboard` quand la personne a un rôle marketplace
  // (le hub route ensuite selon le rôle). Un admin sans rôle n'a pas de hub — il
  // y serait redirigé vers l'onboarding : on l'envoie droit à son espace.
  const home = role === "TEACHER" || role === "STUDENT" ? "/dashboard" : "/admin/utilisateurs";

  return (
    <header className="border-b border-border bg-white">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        {/* Le logo renvoie à l'espace de l'utilisateur, pas à l'accueil public. */}
        <Link href={home} aria-label="SiNote — accueil">
          <SiteLogo />
        </Link>

        <nav className="flex items-center gap-1">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/profs">
              <Search className="mr-2 h-4 w-4" />
              Trouver un prof
            </Link>
          </Button>
          <UserNav role={role} isAdmin={isAdmin} user={user} />
        </nav>
      </div>
    </header>
  );
}
