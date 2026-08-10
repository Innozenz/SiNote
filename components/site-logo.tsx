import { cn } from "@/lib/utils";

/**
 * Logo SiNote — le « sceau » : une note dans un anneau doré, façon médaille de
 * conservatoire, suivie du nom en Cormorant. Server-safe (aucun état), partagé
 * par l'en-tête public, la barre latérale et l'en-tête connecté pour une marque
 * cohérente partout.
 *
 * L'anneau doré est peint au `box-shadow` interne (un liseré crème puis un
 * liseré or-doux à l'intérieur de la bordure or), sur les jetons du thème —
 * il suit donc la palette sans retouche.
 */
export function SiteLogo({
  className,
  onDark = false,
}: {
  className?: string;
  /** Sur un fond sombre (la barre latérale bleue), le sceau reçoit un disque
   * clair pour que la note bleue reste lisible ; sinon le centre est transparent
   * sur la crème. La note et l'anneau restent bleu/or dans les deux cas. */
  onDark?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      {/* Anneau doré, note bleue. Sur foncé, un disque crème clair derrière la
          note (une petite médaille). Le nom hérite de la couleur du texte
          ambiant (`currentColor`) — encre sur clair, clair sur foncé. */}
      <span
        aria-hidden
        className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full border border-accent font-display text-lg font-semibold leading-none text-primary"
      >
        {/* Disque clair en retrait de la bordure (un jeu laisse voir le fond
            entre le disque et l'anneau), seulement sur foncé. */}
        {onDark ? (
          <span className="absolute inset-[3px] rounded-full bg-elevated" />
        ) : null}
        <span className="relative leading-none">♪</span>
      </span>
      <span className="font-display text-xl font-semibold tracking-tight">
        SiNote
      </span>
    </span>
  );
}
