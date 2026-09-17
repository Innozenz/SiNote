import type { InstrumentFamily } from "@prisma/client";

/**
 * Familles d'instruments : nom affiché, couleur, position sur la portée.
 *
 * La couleur du site suit une seule règle, héritée de l'agenda du prof (« les
 * neutres à la grille, les teintes aux cours ») : **une teinte doit nommer
 * quelque chose**. Ici elle nomme une famille, et rien d'autre. Le gris reste
 * la mise en page, le rose `--accent` reste l'emphase éditoriale.
 *
 * Conséquence pratique : deux instruments d'une même famille portent la même
 * couleur partout où ils apparaissent, et un lecteur apprend la correspondance
 * sans qu'on la lui explique. Repeindre un instrument « parce que ça fait
 * joli » casse ça.
 *
 * Les classes sont écrites **en entier et littéralement**. Tailwind lit les
 * sources au texte : une classe composée à l'exécution (`bg-family-${famille}`)
 * n'est jamais générée, et la couleur disparaît en production sans erreur.
 */

/** Ordre d'affichage : la voix d'abord, la théorie en dernier. */
export const FAMILY_ORDER: InstrumentFamily[] = [
  "VOICE",
  "KEYBOARD",
  "STRINGS",
  "WINDS",
  "BRASS",
  "PERCUSSION",
  "ELECTRONIC",
  "THEORY",
];

export const FAMILY_LABELS: Record<InstrumentFamily, string> = {
  VOICE: "Voix",
  KEYBOARD: "Claviers",
  STRINGS: "Cordes",
  WINDS: "Vents",
  BRASS: "Cuivres",
  PERCUSSION: "Percussions",
  ELECTRONIC: "Électronique",
  THEORY: "Théorie",
};

export type FamilyStyle = {
  /** Texte et pastille : la teinte pleine. */
  text: string;
  dot: string;
  /** Pastille d'instrument **cliquable** : fond très clair, teinte au survol. */
  chip: string;
  /**
   * Même pastille, mais **inerte** : dans l'espace connecté, une chip nomme
   * l'instrument d'un cours, elle ne mène nulle part. Le survol de `chip`
   * promettait alors un clic qui n'existe pas.
   */
  chipStatic: string;
};

export const FAMILY_STYLES: Record<InstrumentFamily, FamilyStyle> = {
  VOICE: {
    text: "text-family-voice",
    dot: "bg-family-voice",
    chip: "bg-family-voice-soft text-family-voice hover:bg-family-voice hover:text-white",
    chipStatic: "bg-family-voice-soft text-family-voice",
  },
  KEYBOARD: {
    text: "text-family-keyboard",
    dot: "bg-family-keyboard",
    chip: "bg-family-keyboard-soft text-family-keyboard hover:bg-family-keyboard hover:text-white",
    chipStatic: "bg-family-keyboard-soft text-family-keyboard",
  },
  STRINGS: {
    text: "text-family-strings",
    dot: "bg-family-strings",
    chip: "bg-family-strings-soft text-family-strings hover:bg-family-strings hover:text-white",
    chipStatic: "bg-family-strings-soft text-family-strings",
  },
  WINDS: {
    text: "text-family-winds",
    dot: "bg-family-winds",
    chip: "bg-family-winds-soft text-family-winds hover:bg-family-winds hover:text-white",
    chipStatic: "bg-family-winds-soft text-family-winds",
  },
  BRASS: {
    text: "text-family-brass",
    dot: "bg-family-brass",
    chip: "bg-family-brass-soft text-family-brass hover:bg-family-brass hover:text-white",
    chipStatic: "bg-family-brass-soft text-family-brass",
  },
  PERCUSSION: {
    text: "text-family-percussion",
    dot: "bg-family-percussion",
    chip: "bg-family-percussion-soft text-family-percussion hover:bg-family-percussion hover:text-white",
    chipStatic: "bg-family-percussion-soft text-family-percussion",
  },
  ELECTRONIC: {
    text: "text-family-electronic",
    dot: "bg-family-electronic",
    chip: "bg-family-electronic-soft text-family-electronic hover:bg-family-electronic hover:text-white",
    chipStatic: "bg-family-electronic-soft text-family-electronic",
  },
  THEORY: {
    text: "text-family-theory",
    dot: "bg-family-theory",
    chip: "bg-family-theory-soft text-family-theory hover:bg-family-theory hover:text-white",
    chipStatic: "bg-family-theory-soft text-family-theory",
  },
};

/**
 * Hauteur de base de la famille sur la portée, en demi-interlignes depuis la
 * ligne du haut. `lib/instruments/score.ts` la transpose de mesure en mesure.
 *
 * Fixe et non aléatoire : le motif doit être le même à chaque rechargement,
 * sinon ce n'est plus une signature, c'est du bruit.
 *
 * Le contour monte puis redescend — une phrase, pas un escalier.
 */
export const FAMILY_PITCH: Record<InstrumentFamily, number> = {
  VOICE: 6,
  KEYBOARD: 4,
  STRINGS: 7,
  WINDS: 3,
  BRASS: 5,
  PERCUSSION: 8,
  ELECTRONIC: 2,
  THEORY: 5,
};
