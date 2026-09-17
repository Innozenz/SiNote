import Link from "next/link";

import { PageHeader } from "@/components/editorial";
import { cn } from "@/lib/utils";

/**
 * « Ma fiche » : la page publique du prof, ce qu'on en dit, et l'abonnement qui
 * la rend visible.
 *
 * Les trois vivaient sous trois entrées de menu, alors qu'elles répondent à une
 * seule question — « à quoi ressemble ma fiche pour un élève ? ». Un avis et un
 * abonnement n'ont de sens que rapportés à elle : l'un la fait choisir, l'autre
 * la fait exister. Les réunir en onglets a d'ailleurs vidé trois entrées de la
 * barre latérale, qui n'en a plus que six.
 *
 * Des liens, pas un état React : l'onglet actif est une adresse, donc
 * partageable, en favori, et le bouton retour se comporte bien — même logique
 * que `FicheTabs`, que cette barre reprend visuellement pour qu'un prof passant
 * d'un dossier élève à sa fiche retrouve le même dessin.
 */
export type MaFicheTab = "fiche" | "avis" | "abonnement";

const TABS: { key: MaFicheTab; label: string; href: string }[] = [
  { key: "fiche", label: "Fiche", href: "/dashboard/prof" },
  { key: "avis", label: "Avis", href: "/dashboard/prof/avis" },
  { key: "abonnement", label: "Abonnement", href: "/dashboard/prof/abonnement" },
];

export function MaFicheTabs({
  active,
  counts,
}: {
  active: MaFicheTab;
  /** Total par onglet — un repère en texte discret, jamais une alerte. */
  counts?: Partial<Record<MaFicheTab, number>>;
}) {
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1">
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        const count = counts?.[tab.key];

        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            )}
          >
            {tab.label}
            {count ? (
              <span className="text-xs font-normal tabular-nums text-subtle">
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * En-tête commun aux trois onglets. **Un seul par page** : les trois écrans
 * portaient chacun le leur (« Ma fiche », « Avis », « Abonnement »), si bien
 * qu'en passant de l'un à l'autre le titre changeait sous des onglets qui,
 * eux, ne bougeaient pas — on avait l'air de changer de page, pas d'onglet.
 *
 * `meta` reçoit ce qui appartient à l'onglet courant : l'adresse publique et le
 * bouton Publier sur la fiche, la moyenne sur les avis, l'état de l'abonnement.
 */
export function MaFicheHeader({
  active,
  meta,
  counts,
}: {
  active: MaFicheTab;
  meta?: React.ReactNode;
  counts?: Partial<Record<MaFicheTab, number>>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        size="page"
        eyebrow="Espace professeur"
        title="Ma fiche"
        lead="Votre page publique, ce que les élèves en disent, et l'abonnement qui la rend visible."
        meta={meta}
      />
      <MaFicheTabs active={active} counts={counts} />
    </div>
  );
}
