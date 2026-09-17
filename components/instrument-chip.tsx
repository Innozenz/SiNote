import type { InstrumentFamily } from "@prisma/client";

import { FAMILY_STYLES } from "@/lib/instruments/family";
import { cn } from "@/lib/utils";

/**
 * Pastille d'instrument, teintée par sa famille.
 *
 * Reprend dans l'espace connecté la règle que suit déjà tout le site : **une
 * teinte nomme quelque chose**. Ici elle nomme la famille de l'instrument, et
 * un prof qui enseigne le piano et le chant distingue ses deux cours d'un coup
 * d'œil sans lire les mots. Les classes viennent de `FAMILY_STYLES`, écrites en
 * toutes lettres — Tailwind ne génère pas une classe montée à l'exécution.
 *
 * Composant serveur : il n'habille qu'un mot. Le niveau (« intermédiaire ») se
 * pose à sa suite dans la même pastille quand on le connaît, parce qu'il
 * qualifie l'instrument et non l'élève : avancé au piano, débutant au chant.
 */
export function InstrumentChip({
  name,
  family,
  detail,
  size = "sm",
  className,
}: {
  name: string;
  family: InstrumentFamily;
  /** Précision accolée (« intermédiaire », « essai »), en teinte atténuée. */
  detail?: string | null;
  size?: "xs" | "sm";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full font-medium",
        size === "xs" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs",
        FAMILY_STYLES[family].chipStatic,
        className
      )}
    >
      <span className="truncate">{name}</span>
      {detail ? (
        <span className="truncate font-normal opacity-70">· {detail}</span>
      ) : null}
    </span>
  );
}
