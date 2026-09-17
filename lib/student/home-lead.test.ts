import { describe, expect, it } from "vitest";

import { composeStudentLead, describeLessonDistance } from "./home-lead";

const PARIS = "Europe/Paris";

/** 2026-09-17, 10:00 à Paris (été : UTC+2). */
const NOW = new Date("2026-09-17T08:00:00.000Z");

const inHours = (h: number) => new Date(NOW.getTime() + h * 3_600_000);
const inMinutes = (m: number) => new Date(NOW.getTime() + m * 60_000);

describe("describeLessonDistance", () => {
  it("compte en minutes sous l'heure", () => {
    expect(describeLessonDistance(inMinutes(35), NOW, PARIS)).toBe(
      "dans 35 minutes"
    );
  });

  it("écrit les petits nombres en toutes lettres", () => {
    expect(describeLessonDistance(inHours(2), NOW, PARIS)).toBe(
      "dans deux heures"
    );
    expect(describeLessonDistance(inMinutes(5), NOW, PARIS)).toBe(
      "dans cinq minutes"
    );
  });

  it("accorde le singulier", () => {
    expect(describeLessonDistance(inHours(1), NOW, PARIS)).toBe("dans une heure");
  });

  it("dit « maintenant » pour un cours qui commence", () => {
    expect(describeLessonDistance(NOW, NOW, PARIS)).toBe("maintenant");
    // Un cours déjà commencé n'est plus « dans -2 heures ».
    expect(describeLessonDistance(inHours(-2), NOW, PARIS)).toBe("maintenant");
  });

  it("passe à la date civile au-delà de la journée", () => {
    // 22 h plus tard : encore le même jour + 22 h → toujours une durée.
    expect(describeLessonDistance(inHours(22), NOW, PARIS)).toBe(
      "dans 22 heures"
    );
    // 26 h plus tard : le lendemain.
    expect(describeLessonDistance(inHours(26), NOW, PARIS)).toBe("demain");
  });

  it("nomme le jour dans la semaine, puis la date au-delà", () => {
    // Jeudi 17 + 3 jours = dimanche 20.
    expect(describeLessonDistance(inHours(24 * 3), NOW, PARIS)).toBe("dimanche");
    // 10 jours : on donne la date.
    expect(describeLessonDistance(inHours(24 * 10), NOW, PARIS)).toBe(
      "le 27 septembre"
    );
  });

  it("lit le jour civil dans le fuseau, pas en UTC", () => {
    // 23:30 à Paris le 17 → 21:30 UTC. Vu de Paris c'est « aujourd'hui »
    // (donc une durée) ; vu d'un fuseau plus à l'est ce serait déjà demain.
    const tonight = new Date("2026-09-17T21:30:00.000Z");
    expect(describeLessonDistance(tonight, NOW, PARIS)).toBe("dans 13 heures");

    // Le même instant, lu à Tokyo (UTC+9), tombe le 18 au matin.
    expect(describeLessonDistance(tonight, NOW, "Asia/Tokyo")).toBe(
      "dans 13 heures"
    );
  });
});

describe("composeStudentLead", () => {
  it("compose cours et demandes", () => {
    expect(
      composeStudentLead({
        nextStartsAt: inHours(2),
        pendingCount: 1,
        now: NOW,
        timezone: PARIS,
      })
    ).toBe("Un cours dans deux heures, une demande en attente de réponse.");
  });

  it("accorde le pluriel des demandes", () => {
    expect(
      composeStudentLead({
        nextStartsAt: inHours(2),
        pendingCount: 3,
        now: NOW,
        timezone: PARIS,
      })
    ).toBe("Un cours dans deux heures, trois demandes en attente de réponse.");
  });

  it("n'annonce que le cours quand rien n'est en attente", () => {
    expect(
      composeStudentLead({
        nextStartsAt: inHours(26),
        pendingCount: 0,
        now: NOW,
        timezone: PARIS,
      })
    ).toBe("Un cours demain.");
  });

  it("sans cours confirmé, nomme les demandes", () => {
    expect(
      composeStudentLead({
        nextStartsAt: null,
        pendingCount: 1,
        now: NOW,
        timezone: PARIS,
      })
    ).toBe("Aucun cours confirmé, une demande en attente de réponse.");
  });

  it("sans rien, ne blâme personne", () => {
    expect(
      composeStudentLead({
        nextStartsAt: null,
        pendingCount: 0,
        now: NOW,
        timezone: PARIS,
      })
    ).toBe("Aucun cours prévu.");
  });
});
