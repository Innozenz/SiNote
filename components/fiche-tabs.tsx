import Link from "next/link";

import { cn } from "@/lib/utils";

export type FicheTab = {
  key: string;
  label: string;
  /** Total d'éléments sous l'onglet — un repère, pas une alerte. */
  badge?: number;
  /** Éléments non lus : la seule pastille pleine, réservée à ce qui attend. */
  unread?: number;
};

/**
 * Barre d'onglets d'une fiche / d'un dossier.
 *
 * Deux compteurs, deux rendus. Le total (« Historique 10 ») est écrit en
 * texte discret ; il ressemblait à une pastille de notification alors que la
 * barre latérale réserve ce dessin aux non-lus, et « Messages 13 » se lisait
 * comme treize messages à lire. Seul `unread` prend la pastille pleine.
 *
 * L'onglet actif vit dans l'URL (`?onglet=…`) : le rendu reste côté serveur,
 * l'état est partageable et le bouton retour se comporte bien — même logique que
 * les filtres de recherche et la semaine de l'agenda. Le premier onglet est le
 * défaut et pointe sur l'URL nue (sans paramètre), pour une adresse canonique.
 */
export function FicheTabs({
  tabs,
  active,
  basePath,
}: {
  tabs: FicheTab[];
  active: string;
  basePath: string;
}) {
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1">
      {tabs.map((tab, index) => {
        const isActive = tab.key === active;
        const href = index === 0 ? basePath : `${basePath}?onglet=${tab.key}`;

        return (
          <Link
            key={tab.key}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            )}
          >
            {tab.label}
            {tab.badge ? (
              <span className="text-xs font-normal tabular-nums text-subtle">
                {tab.badge}
              </span>
            ) : null}
            {tab.unread ? (
              <span className="rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                {tab.unread}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
