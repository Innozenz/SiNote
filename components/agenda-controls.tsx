import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  AgendaViewSwitch,
  type AgendaNav,
  type AgendaView,
} from "@/components/agenda-view-switch";
import { Button } from "@/components/ui/button";

/**
 * Commandes de l'agenda : bascule de vue, puis ‹ Aujourd'hui ›.
 *
 * Elles vivaient dans l'en-tête de la carte du calendrier, ce qui donnait deux
 * en-têtes empilés — celui de la page, puis celui de la carte, qui portait les
 * vrais boutons. Elles remontent dans le `meta` du `PageHeader` : la page a un
 * seul en-tête, et la carte ne garde que ce qu'elle sait, la période affichée.
 *
 * Server Component : ce ne sont que des liens. L'état (vue, période) vit dans
 * l'URL — partageable, favori, retour arrière correct.
 */
export function AgendaControls({
  view,
  nav,
}: {
  view: AgendaView;
  nav: AgendaNav;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
      <AgendaViewSwitch view={view} nav={nav} />

      <div className="flex items-center gap-1">
        <Button asChild variant="outline" size="sm">
          <Link href={nav.previousHref} aria-label="Période précédente">
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        {/* Le raccourci ne s'affiche que lorsqu'il mène ailleurs. */}
        {nav.currentHref ? (
          <Button asChild variant="outline" size="sm">
            <Link href={nav.currentHref}>{nav.currentLabel}</Link>
          </Button>
        ) : null}
        <Button asChild variant="outline" size="sm">
          <Link href={nav.nextHref} aria-label="Période suivante">
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
