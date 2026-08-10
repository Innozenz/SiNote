import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Primitives de mise en page « éditoriale ».
 *
 * La page d'accueil s'était donné une voix — yeux-de-bœuf en petites capitales,
 * titres d'affichage démesurés, listes séparées par des filets plutôt que des
 * cartes, asymétrie — mais cette voix s'arrêtait à l'accueil : les pages
 * internes retombaient sur des cartes shadcn par défaut, ce qui faisait « site
 * standard ». Ces primitives extraient ce langage pour que toutes les pages le
 * partagent. Le patron de liste vient directement du « répertoire » de
 * l'accueil (`divide-y divide-border border-y`).
 *
 * Toutes sont des composants serveur (aucun état) : elles habillent, elles ne
 * font rien. Les tailles fluides passent par un `style` en ligne — `clamp()`
 * contient des virgules qu'une valeur arbitraire Tailwind découperait.
 */

/**
 * Petit intitulé en capitales espacées, au-dessus d'un titre ou d'une section.
 * En bronze : c'est l'un des rares points chauds qui contrebalancent le vert,
 * et il nomme une chose précise — l'étiquette éditoriale d'une page.
 */
export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-xs font-medium uppercase tracking-[0.2em] text-accent",
        className
      )}
    >
      {children}
    </p>
  );
}

/**
 * Titre d'affichage (Cormorant). Casse laissée au choix de l'appelant.
 * `display` (défaut) : démesuré, pour les pages vitrines. `page` : marqué mais
 * plus sobre, pour les écrans internes qui vivent déjà sous une barre d'onglets.
 */
export function PageTitle({
  children,
  size = "display",
  className,
}: {
  children: React.ReactNode;
  size?: "display" | "page";
  className?: string;
}) {
  return (
    <h1
      className={cn(
        "text-balance font-display font-semibold leading-[0.95] tracking-[-0.02em] text-foreground",
        size === "page" && "text-3xl sm:text-4xl",
        className
      )}
      style={
        size === "display"
          ? { fontSize: "clamp(2.25rem, 5vw, 3.75rem)" }
          : undefined
      }
    >
      {children}
    </h1>
  );
}

/**
 * En-tête de page : œil-de-bœuf, titre démesuré, accroche facultative à gauche ;
 * méta alignée sur la ligne de base à droite (asymétrie). Un filet ferme le bloc
 * — c'est lui, pas une carte, qui structure la page.
 */
export function PageHeader({
  eyebrow,
  title,
  titleClassName,
  lead,
  meta,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  titleClassName?: string;
  lead?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-6 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="flex flex-col gap-3">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <PageTitle className={titleClassName}>{title}</PageTitle>
        {lead ? (
          <p className="max-w-xl text-pretty text-muted">{lead}</p>
        ) : null}
      </div>
      {meta ? (
        <div className="shrink-0 sm:text-right">{meta}</div>
      ) : null}
    </header>
  );
}

/**
 * Intitulé de section : une pastille (tête de note), un libellé en capitales,
 * puis un filet qui file jusqu'au bord. Reprend le rythme des familles du
 * répertoire, appliqué aux sections d'une fiche.
 */
export function SectionTitle({
  children,
  trailing,
  className,
}: {
  children: React.ReactNode;
  /** Contenu posé après le titre, avant le filet — un compteur, par exemple. */
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-accent" />
      <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-foreground">
        {children}
      </h2>
      {trailing}
      <span aria-hidden className="h-px flex-1 bg-border" />
    </div>
  );
}

/** Liste en filets : bordée en haut et en bas, chaque ligne séparée d'un trait. */
export function RowList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "divide-y divide-border border-y border-border",
        className
      )}
    >
      {children}
    </ul>
  );
}

/**
 * Une ligne de liste, cliquable. Le survol lave le fond (`bg-surface`) au lieu
 * d'entourer d'une carte : la ligne reste une ligne, elle ne devient pas une
 * boîte. `main` à gauche, `meta` alignée en haut à droite.
 */
export function Row({
  href,
  main,
  meta,
}: {
  href: string;
  main: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group -mx-3 flex items-start justify-between gap-6 rounded-lg px-3 py-6 transition-colors hover:bg-surface"
      >
        <div className="min-w-0">{main}</div>
        {meta ? (
          <div className="shrink-0 text-right">{meta}</div>
        ) : null}
      </Link>
    </li>
  );
}
