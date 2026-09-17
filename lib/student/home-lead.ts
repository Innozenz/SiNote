import { civilDateKeyInZone } from "@/lib/availability/zone";

/**
 * Phrase d'accroche de l'accueil élève.
 *
 * « Un cours dans deux heures, une demande en attente de réponse. » — l'accroche
 * dit l'état réel du compte, pas une généralité. Elle est composée ici plutôt
 * que dans la page pour une raison précise : c'est la seule partie de l'écran
 * dont la justesse dépend d'un calcul de distance temporelle, et cette distance
 * se lit à l'horloge (jour civil dans le fuseau), jamais par une soustraction de
 * millisecondes — les deux jours de changement d'heure, « demain » tomberait à
 * côté.
 *
 * Fonction pure, `now` injecté : testable sans base ni horloge.
 */

/**
 * Petits nombres en toutes lettres : « dans deux heures » se lit, « dans 2
 * heures » se compte. Au-delà de douze, le chiffre reprend la main — on ne dit
 * pas « dans dix-sept jours » dans une accroche.
 */
const WORDS = [
  "zéro",
  "une",
  "deux",
  "trois",
  "quatre",
  "cinq",
  "six",
  "sept",
  "huit",
  "neuf",
  "dix",
  "onze",
  "douze",
];

function count(n: number): string {
  return n < WORDS.length ? WORDS[n] : String(n);
}

/**
 * Distance jusqu'au cours, telle qu'on la dirait : « dans une heure »,
 * « demain », « jeudi », « le 18 septembre ».
 *
 * En deçà du jour, c'est une durée (c'est ce qui compte quand on s'apprête à
 * partir) ; au-delà, c'est une date (personne ne compte en heures à trois
 * jours).
 */
export function describeLessonDistance(
  startsAt: Date,
  now: Date,
  timezone: string
): string {
  const ms = startsAt.getTime() - now.getTime();

  if (ms <= 60_000) return "maintenant";

  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) {
    return `dans ${count(minutes)} ${minutes === 1 ? "minute" : "minutes"}`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `dans ${count(hours)} ${hours === 1 ? "heure" : "heures"}`;
  }

  // Au-delà de vingt-quatre heures, on parle en jours civils : « demain » est
  // une date, pas une durée, et un cours dans 25 h peut tomber après-demain.
  const todayKey = civilDateKeyInZone(now, timezone);
  const dayKey = civilDateKeyInZone(startsAt, timezone);
  const days = daysBetween(todayKey, dayKey);

  if (days <= 1) return "demain";

  if (days < 7) {
    return startsAt.toLocaleDateString("fr-FR", {
      weekday: "long",
      timeZone: timezone,
    });
  }

  return `le ${startsAt.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    timeZone: timezone,
  })}`;
}

/** Écart en jours entre deux dates civiles AAAA-MM-JJ. */
function daysBetween(from: string, to: string): number {
  const at = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };

  return Math.round((at(to) - at(from)) / 86_400_000);
}

export type StudentLeadInput = {
  /** Début du prochain cours confirmé à venir, s'il y en a un. */
  nextStartsAt: Date | null;
  /** Demandes encore en attente de réponse du prof. */
  pendingCount: number;
  now: Date;
  timezone: string;
};

/**
 * L'accroche complète, ponctuation comprise.
 *
 * Trois cas, trois phrases : un cours à venir, des demandes en suspens, ou
 * rien. Le troisième ne dit pas « aucun cours confirmé » — sans demande en
 * attente, il n'y a rien de confirmé *ni* de demandé, et l'écran propose alors
 * de chercher un prof.
 */
export function composeStudentLead({
  nextStartsAt,
  pendingCount,
  now,
  timezone,
}: StudentLeadInput): string {
  const pendingPart =
    pendingCount === 1
      ? "une demande en attente de réponse"
      : pendingCount > 1
        ? `${count(pendingCount)} demandes en attente de réponse`
        : null;

  if (!nextStartsAt) {
    return pendingPart
      ? `Aucun cours confirmé, ${pendingPart}.`
      : "Aucun cours prévu.";
  }

  const distance = describeLessonDistance(nextStartsAt, now, timezone);
  const lessonPart =
    distance === "maintenant" ? "Un cours maintenant" : `Un cours ${distance}`;

  return pendingPart ? `${lessonPart}, ${pendingPart}.` : `${lessonPart}.`;
}
