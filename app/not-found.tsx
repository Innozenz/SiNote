import Link from "next/link";
import { Compass, Search } from "lucide-react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";

/**
 * Page 404 globale.
 *
 * Il n'en existait qu'une, propre à la fiche prof ; toute autre adresse
 * inconnue tombait sur celle de Next — sans en-tête, sans navigation, sans
 * français. Une 404 est une page comme les autres : elle doit porter
 * l'identité du site et proposer une sortie.
 *
 * Server Component, donc l'en-tête connaît l'état de session : quelqu'un de
 * connecté ne se voit pas proposer de se connecter.
 */
export default function NotFound() {
  return (
    <>
      <SiteHeader />

      <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-6 px-4 text-center">
        <Compass className="h-10 w-10 text-subtle" />

        <div className="flex flex-col gap-2">
          <h1 className="text-2xl">Cette page n&apos;existe pas</h1>
          <p className="text-muted">
            Le lien est peut-être ancien, ou la fiche que vous cherchiez n&apos;est
            plus en ligne.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href="/profs">
              <Search className="mr-2 h-4 w-4" />
              Trouver un prof
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">Retour à l&apos;accueil</Link>
          </Button>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
