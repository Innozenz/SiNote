import type { InstrumentFamily } from "@prisma/client";
import {
  AudioLines,
  AudioWaveform,
  Disc3,
  Drum,
  Guitar,
  MicVocal,
  Music4,
  Piano,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Pastille illustrée d'une famille d'instruments : une icône monoline dans la
 * couleur de la famille, sur un fond de la même teinte en très clair.
 *
 * Le choix des icônes suit une logique lisible plutôt que le hasard : un
 * instrument **littéral** quand Lucide en a un (voix → micro, claviers → piano,
 * cordes → guitare, percussions → batterie, électronique → platine), un glyphe
 * **d'onde** pour les deux familles de souffle (vents, cuivres — que Lucide ne
 * représente pas), et une **portée** pour la théorie. La couleur, elle, nomme
 * la famille comme partout ailleurs sur le site.
 */

const FAMILY_ICON: Record<InstrumentFamily, LucideIcon> = {
  VOICE: MicVocal,
  KEYBOARD: Piano,
  STRINGS: Guitar,
  WINDS: AudioLines,
  BRASS: AudioWaveform,
  PERCUSSION: Drum,
  ELECTRONIC: Disc3,
  THEORY: Music4,
};

// Classes écrites en entier et littéralement : Tailwind scanne le texte, une
// classe composée à l'exécution (`bg-family-${famille}-soft`) ne serait jamais
// générée et la couleur disparaîtrait en production. (Même règle que
// FAMILY_STYLES dans lib/instruments/family.ts.)
const FAMILY_WRAP: Record<InstrumentFamily, string> = {
  VOICE: "bg-family-voice-soft text-family-voice",
  KEYBOARD: "bg-family-keyboard-soft text-family-keyboard",
  STRINGS: "bg-family-strings-soft text-family-strings",
  WINDS: "bg-family-winds-soft text-family-winds",
  BRASS: "bg-family-brass-soft text-family-brass",
  PERCUSSION: "bg-family-percussion-soft text-family-percussion",
  ELECTRONIC: "bg-family-electronic-soft text-family-electronic",
  THEORY: "bg-family-theory-soft text-family-theory",
};

export function FamilyIcon({
  family,
  className,
}: {
  family: InstrumentFamily;
  className?: string;
}) {
  const Icon = FAMILY_ICON[family];
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-sm)]",
        FAMILY_WRAP[family],
        className
      )}
    >
      <Icon className="h-6 w-6" strokeWidth={1.5} />
    </span>
  );
}
