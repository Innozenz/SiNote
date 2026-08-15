"use client";

import Link from "next/link";
import { LogIn, Menu, Search, Sparkles, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Menu déroulant des pages publiques sur mobile.
 *
 * Île client (le déroulant a besoin d'un état d'ouverture), affichée seulement
 * sous `sm` : au-dessus, la nav complète de `SiteHeader` reprend la main. Elle
 * garde **tous** les liens que la barre desktop expose, pour qu'aucun ne
 * disparaisse quand la place manque.
 *
 * Les entrées sont de vrais `Link` (via `asChild`) plutôt qu'un `router.push` :
 * navigation publique, pas d'état à préserver, donc autant laisser un lien
 * normal — crawlable et ouvrable dans un nouvel onglet.
 */
export function MobileNav({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Ouvrir le menu">
          <Menu className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-52" align="end">
        <DropdownMenuItem asChild>
          <Link href="/profs">
            <Search className="mr-2 h-4 w-4" />
            Trouver un prof
          </Link>
        </DropdownMenuItem>

        {isSignedIn ? (
          <DropdownMenuItem asChild>
            <Link href="/dashboard">
              <User className="mr-2 h-4 w-4" />
              Mon espace
            </Link>
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem asChild>
              <Link href="/enseigner">
                <Sparkles className="mr-2 h-4 w-4" />
                Devenir prof
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/connexion">
                <LogIn className="mr-2 h-4 w-4" />
                Se connecter
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}