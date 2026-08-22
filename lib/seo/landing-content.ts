import type { InstrumentFamily } from "@prisma/client";

/**
 * Contenu éditorial des pages d'atterrissage.
 *
 * Le risque SEO n°1 de pages générées est le **contenu mince ou dupliqué** :
 * trente-sept pages au même gabarit et au même texte se cannibalisent. On lutte
 * sur trois fronts : un paragraphe propre à chaque *famille* (huit textes
 * distincts), le nom de l'instrument interpolé partout, et la liste de profs
 * réelle qui diffère d'une page à l'autre. La ville ajoute une troisième
 * variable. Ce module ne produit que le texte ; la donnée vit dans
 * `lib/seo/landing.ts`.
 */

/** Amorce par famille : ce qu'on vient apprendre, dans les mots de l'élève. */
const FAMILY_INTRO: Record<InstrumentFamily, string> = {
  VOICE:
    "poser sa voix, travailler la justesse, le souffle et l'interprétation, du premier cours de technique vocale à la scène",
  KEYBOARD:
    "lire une partition, délier ses doigts et jouer ses premiers morceaux, du repertoire classique aux accords de variété",
  STRINGS:
    "accorder son instrument, placer ses accords et faire sonner ses premières mélodies, en classique comme en musiques actuelles",
  WINDS:
    "maîtriser le souffle et les doigtés, obtenir un son juste et gagner en aisance sur tout le répertoire",
  BRASS:
    "travailler l'embouchure et le souffle, gagner en puissance et en justesse, de l'harmonie au jazz",
  PERCUSSION:
    "installer un tempo solide, coordonner ses membres et bâtir ses premiers grooves, de la technique aux morceaux",
  ELECTRONIC:
    "composer, arranger et produire ses propres morceaux, prendre en main un logiciel de MAO ou les platines, du beatmaking au mix",
  THEORY:
    "comprendre ce que vous jouez : lecture de notes, rythme, harmonie et formation musicale pour progresser plus vite sur votre instrument",
};

/** Pourquoi apprendre cette famille — texte plus long, section dédiée. */
const FAMILY_WHY: Record<InstrumentFamily, string> = {
  VOICE:
    "La voix est l'instrument le plus personnel qui soit, et le plus exigeant à apprivoiser seul. Un professeur vous aide à respirer correctement, à trouver votre tessiture et à chanter sans forcer — les progrès sont rapides quand quelqu'un écoute et corrige en direct.",
  KEYBOARD:
    "Le clavier est un formidable point d'entrée dans la musique : on y voit la théorie sous les doigts. Un professeur adapte le répertoire à vos goûts et vous évite les mauvaises habitudes de posture qui freinent la progression.",
  STRINGS:
    "Les instruments à cordes récompensent la régularité. Un professeur règle votre technique de main gauche et de main droite dès le départ, vous fait passer les premiers caps — accords barrés, changements de position — et choisit avec vous les morceaux qui donnent envie de travailler.",
  WINDS:
    "Sur un instrument à vent, tout part du souffle et de l'embouchure. Difficile à corriger seul, facile à ajuster avec un professeur qui vous écoute : le son se pose, la justesse vient, et le plaisir de jouer avec.",
  BRASS:
    "Les cuivres demandent une embouchure solide et une bonne gestion du souffle. Un professeur vous construit ces fondations sans fatigue inutile et vous ouvre les répertoires — fanfare, harmonie, jazz, musiques actuelles.",
  PERCUSSION:
    "Le rythme se travaille à deux : un professeur vous fait sentir le tempo, coordonne vos membres et vous met rapidement sur des morceaux réels. Rien ne remplace l'oreille et l'exemple d'un batteur expérimenté à côté de vous.",
  ELECTRONIC:
    "La musique électronique et la production s'apprennent vite quand on est guidé dans la jungle des logiciels et des techniques. Un professeur de MAO, de DJ ou de beatmaking vous fait gagner des mois : prise en main d'Ableton, Logic ou FL Studio, structure d'un morceau, mixage, mix aux platines.",
  THEORY:
    "Le solfège et la formation musicale ne sont pas une corvée quand ils servent votre pratique. Un professeur relie la théorie à ce que vous jouez déjà : vous lisez plus vite, vous comprenez l'harmonie et vous progressez sur votre instrument.",
};

/** Paragraphe d'introduction, sous le H1. */
export function instrumentIntro(
  name: string,
  family: InstrumentFamily,
  city?: string
): string {
  const place = city ? ` à ${city}` : "";
  return `Prenez des cours de ${name}${place} avec un professeur qui vous correspond. Sur SiNote, vous choisissez votre prof de ${name}, consultez ses disponibilités en temps réel et réservez votre cours en ligne en quelques clics — débutant ou confirmé, pour ${FAMILY_INTRO[family]}. Vous réglez directement le professeur, sans commission ni intermédiaire.`;
}

/** Section « Pourquoi apprendre … ». */
export function whyLearn(name: string, family: InstrumentFamily): string {
  return `${FAMILY_WHY[family]}`.replace(/\{name\}/g, name);
}

/** Titre de la section « pourquoi », interpolé. */
export function whyLearnTitle(name: string): string {
  return `Pourquoi prendre des cours de ${name} ?`;
}

/**
 * FAQ — interpolée par instrument (et ville). Alimente à la fois la section
 * visible et le `FAQPage` JSON-LD, pour que le texte lu et le texte indexé
 * soient identiques.
 */
export function landingFaq(
  name: string,
  city?: string
): { question: string; answer: string }[] {
  const place = city ? ` à ${city}` : "";
  const placeLong = city ? ` à ${city} et alentour` : "";
  return [
    {
      question: `Combien coûte un cours de ${name}${place} ?`,
      answer: `Chaque professeur fixe librement son tarif — il est affiché sur sa fiche, à l'heure. Vous comparez les prix des profs de ${name}${placeLong} avant de réserver, et vous réglez le professeur directement, sans commission de la plateforme.`,
    },
    {
      question: `Faut-il déjà un niveau pour commencer le ${name} ?`,
      answer: `Non. Les professeurs de ${name} sur SiNote accueillent tous les niveaux, du grand débutant qui n'a jamais touché l'instrument au musicien confirmé qui veut se perfectionner. Précisez votre niveau et vos objectifs, le prof adapte chaque cours.`,
    },
    {
      question: `Peut-on prendre des cours de ${name} en ligne ?`,
      answer: `Oui. De nombreux professeurs proposent des cours de ${name} en visio, en plus des cours en présentiel. Filtrez sur « en ligne » pour ne voir que les profs disponibles à distance.`,
    },
    {
      question: `Comment réserver un cours de ${name}${place} ?`,
      answer: `Choisissez un professeur, sélectionnez un créneau libre dans son agenda et réservez en ligne. Le professeur confirme la demande, et vous convenez ensemble des modalités. Aucun paiement en ligne : vous réglez le prof directement.`,
    },
  ];
}
