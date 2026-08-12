import { describe, expect, it } from "vitest";

import {
  activityCsv,
  computeActivity,
  openMinutesInPeriod,
  resolvePeriod,
  type ActivityBooking,
} from "./activity";
import type { ExceptionInput, RuleInput } from "@/lib/availability";

const PARIS = "Europe/Paris";

/** 15 juillet 2026, 12:00 à Paris (été, UTC+2). */
const NOW = new Date("2026-07-15T10:00:00Z");

function booking(over: Partial<ActivityBooking>): ActivityBooking {
  // À défaut d'identifiant d'élève explicite, on le dérive du nom : suffit à
  // distinguer les élèves dans les tests de comptage.
  const studentName = over.studentName ?? "Alice";
  return {
    id: "b1",
    status: "COMPLETED",
    startsAt: new Date("2026-07-05T08:00:00Z"),
    endsAt: new Date("2026-07-05T09:00:00Z"),
    priceCents: 4500,
    isTrial: false,
    paidAt: null,
    instrumentName: "Piano",
    studentId: studentName.toLowerCase(),
    studentName,
    ...over,
  };
}

describe("resolvePeriod", () => {
  it("« mois » couvre le mois civil entier, borné dans le fuseau", () => {
    const period = resolvePeriod({ periode: "mois" }, NOW, PARIS);
    expect(period.preset).toBe("mois");
    expect(period.startKey).toBe("2026-07-01");
    expect(period.endKey).toBe("2026-07-31");
    // 1er juillet 00:00 à Paris (UTC+2) = 30 juin 22:00 UTC.
    expect(period.start.toISOString()).toBe("2026-06-30T22:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-07-31T22:00:00.000Z");
  });

  it("« mois-dernier » prend le mois précédent complet", () => {
    const period = resolvePeriod({ periode: "mois-dernier" }, NOW, PARIS);
    expect(period.startKey).toBe("2026-06-01");
    expect(period.endKey).toBe("2026-06-30");
  });

  it("« annee » borne l'année, en tenant compte du changement d'heure", () => {
    const period = resolvePeriod({ periode: "annee" }, NOW, PARIS);
    expect(period.startKey).toBe("2026-01-01");
    expect(period.endKey).toBe("2026-12-31");
    // 1er janvier à Paris = hiver (UTC+1) : 31 déc 23:00 UTC.
    expect(period.start.toISOString()).toBe("2025-12-31T23:00:00.000Z");
  });

  it("« 30j » inclut aujourd'hui et les 29 jours précédents", () => {
    const period = resolvePeriod({ periode: "30j" }, NOW, PARIS);
    expect(period.startKey).toBe("2026-06-16");
    expect(period.endKey).toBe("2026-07-15");
  });

  it("« perso » valide prend les dates telles quelles, fin incluse", () => {
    const period = resolvePeriod(
      { periode: "perso", debut: "2026-07-10", fin: "2026-07-12" },
      NOW,
      PARIS
    );
    expect(period.preset).toBe("perso");
    expect(period.startKey).toBe("2026-07-10");
    expect(period.endKey).toBe("2026-07-12");
    expect(period.end.toISOString()).toBe("2026-07-12T22:00:00.000Z");
  });

  it("« perso » invalide (fin avant début) retombe sur le mois courant", () => {
    const period = resolvePeriod(
      { periode: "perso", debut: "2026-07-12", fin: "2026-07-10" },
      NOW,
      PARIS
    );
    expect(period.preset).toBe("mois");
    expect(period.startKey).toBe("2026-07-01");
  });

  it("une période absente vaut « mois »", () => {
    expect(resolvePeriod({}, NOW, PARIS).preset).toBe("mois");
  });
});

describe("computeActivity", () => {
  const period = resolvePeriod({ periode: "mois" }, NOW, PARIS);

  const bookings: ActivityBooking[] = [
    booking({
      instrumentName: "Piano",
      studentName: "Alice",
      priceCents: 4500,
      // Ce cours-là est réglé ; le suivant (Bob) ne l'est pas.
      paidAt: new Date("2026-07-06T09:00:00Z"),
    }),
    booking({
      startsAt: new Date("2026-07-06T08:00:00Z"),
      endsAt: new Date("2026-07-06T08:30:00Z"),
      instrumentName: "Chant",
      studentName: "Bob",
      priceCents: 3000,
    }),
    // Confirmé à venir → prévisionnel.
    booking({
      status: "CONFIRMED",
      startsAt: new Date("2026-07-20T08:00:00Z"),
      endsAt: new Date("2026-07-20T09:00:00Z"),
      instrumentName: "Piano",
      studentName: "Alice",
      priceCents: 4500,
    }),
    // Confirmé mais déjà passé (avant NOW) → journal seulement.
    booking({
      status: "CONFIRMED",
      startsAt: new Date("2026-07-10T08:00:00Z"),
      endsAt: new Date("2026-07-10T09:00:00Z"),
    }),
    // Absent → journal, ni réalisé ni prévisionnel.
    booking({
      status: "NO_SHOW",
      startsAt: new Date("2026-07-07T08:00:00Z"),
      endsAt: new Date("2026-07-07T09:00:00Z"),
    }),
    // Annulé → exclu partout.
    booking({ status: "CANCELLED", startsAt: new Date("2026-07-08T08:00:00Z") }),
    // Hors période → ignoré.
    booking({ startsAt: new Date("2026-08-02T08:00:00Z"), endsAt: new Date("2026-08-02T09:00:00Z") }),
  ];

  const report = computeActivity(bookings, period, NOW, PARIS);

  it("compte le réalisé sur les seuls cours clôturés de la période", () => {
    expect(report.realizedCents).toBe(7500);
    expect(report.realizedCount).toBe(2);
    expect(report.taughtMinutes).toBe(90);
    expect(report.avgCents).toBe(3750);
  });

  it("compte le prévisionnel sur les cours confirmés encore à venir", () => {
    expect(report.projectedCents).toBe(4500);
    expect(report.projectedCount).toBe(1);
  });

  it("sépare l'encaissé du reste à encaisser sur les cours donnés", () => {
    // Alice réglée (4500), Bob non (3000).
    expect(report.paidCents).toBe(4500);
    expect(report.unpaidCents).toBe(3000);
    expect(report.unpaidCount).toBe(1);
    // Le réalisé reste la somme des deux.
    expect(report.paidCents + report.unpaidCents).toBe(report.realizedCents);
  });

  it("compte les absences, les annulations et le taux d'absence", () => {
    expect(report.noShowCount).toBe(1);
    expect(report.cancelledCount).toBe(1);
    // 1 absence sur 3 cours qui devaient avoir lieu (2 donnés + 1 absent).
    expect(report.absenceRate).toBeCloseTo(1 / 3);
  });

  it("somme les minutes de cours écoulées pour le remplissage", () => {
    // 60 (Alice 5 juil) + 30 (Bob 6 juil) + 60 (confirmé passé 10 juil) +
    // 60 (absent 7 juil) ; le confirmé du 20 juil est à venir, l'annulé et le
    // hors-période sont exclus.
    expect(report.bookedMinutes).toBe(210);
  });

  it("compte les élèves distincts vus sur la période", () => {
    expect(report.studentCount).toBe(2);
  });

  it("répartit le réalisé par instrument, du plus rémunérateur au moins", () => {
    expect(report.byInstrument).toEqual([
      { label: "Piano", cents: 4500, count: 1 },
      { label: "Chant", cents: 3000, count: 1 },
    ]);
  });

  it("répartit le réalisé par élève", () => {
    expect(report.byStudent).toEqual([
      { label: "Alice", cents: 4500, count: 1 },
      { label: "Bob", cents: 3000, count: 1 },
    ]);
  });

  it("agrège le réalisé par mois de la période", () => {
    expect(report.byMonth).toHaveLength(1);
    expect(report.byMonth[0]).toMatchObject({ key: "2026-07", cents: 7500, count: 2 });
  });

  it("garde au journal les cours donnés, à venir et absents, du plus récent au plus ancien", () => {
    expect(report.journal).toHaveLength(5);
    expect(report.journal.map((r) => r.status)).toEqual([
      "CONFIRMED", // 20 juillet
      "CONFIRMED", // 10 juillet
      "NO_SHOW", // 7 juillet
      "COMPLETED", // 6 juillet
      "COMPLETED", // 5 juillet
    ]);
    expect(report.journal.every((r) => r.status !== "CANCELLED")).toBe(true);
  });
});

describe("openMinutesInPeriod", () => {
  const noExceptions: ExceptionInput[] = [];

  it("somme les ouvertures des jours écoulés d'une période passée", () => {
    // Lundi 9h–12h = 180 min. Fenêtre du lundi 6 au mercredi 8 juillet 2026,
    // entièrement passée (NOW = 15 juillet) : seul le lundi porte la règle.
    const rules: RuleInput[] = [
      { weekday: 1, startMinute: 540, endMinute: 720 },
    ];
    const period = resolvePeriod(
      { periode: "perso", debut: "2026-07-06", fin: "2026-07-08" },
      NOW,
      PARIS
    );
    expect(openMinutesInPeriod(rules, noExceptions, period, NOW, PARIS)).toBe(180);
  });

  it("borne le jour en cours à l'heure courante", () => {
    // NOW = mercredi 15 juillet, 12:00 à Paris. Règle du mercredi 9h–18h :
    // seules les heures écoulées (9h→12h = 180 min) comptent aujourd'hui.
    const rules: RuleInput[] = [
      { weekday: 3, startMinute: 540, endMinute: 1080 },
    ];
    const period = resolvePeriod(
      { periode: "perso", debut: "2026-07-15", fin: "2026-07-15" },
      NOW,
      PARIS
    );
    expect(openMinutesInPeriod(rules, noExceptions, period, NOW, PARIS)).toBe(180);
  });

  it("retire un congé posé sur une ouverture", () => {
    const rules: RuleInput[] = [
      { weekday: 1, startMinute: 540, endMinute: 720 },
    ];
    // Congé de 10h à 11h le lundi 6 juillet : 180 − 60 = 120 min ouvertes.
    const exceptions: ExceptionInput[] = [
      {
        date: new Date("2026-07-06T00:00:00Z"),
        type: "BLOCKED",
        startMinute: 600,
        endMinute: 660,
      },
    ];
    const period = resolvePeriod(
      { periode: "perso", debut: "2026-07-06", fin: "2026-07-08" },
      NOW,
      PARIS
    );
    expect(openMinutesInPeriod(rules, exceptions, period, NOW, PARIS)).toBe(120);
  });
});

describe("activityCsv", () => {
  const period = resolvePeriod({ periode: "mois" }, NOW, PARIS);
  const report = computeActivity(
    [
      booking({
        studentName: 'Éric "le grand"',
        instrumentName: "Guitare",
        priceCents: 4500,
      }),
    ],
    period,
    NOW,
    PARIS
  );

  it("produit un en-tête et une ligne par cours, séparés par des points-virgules", () => {
    const csv = activityCsv(report.journal, PARIS);
    const lines = csv.split("\r\n");
    expect(lines[0]).toContain("Date;Heure;Élève");
    expect(lines).toHaveLength(2);
  });

  it("échappe les guillemets et met la virgule décimale du montant", () => {
    const csv = activityCsv(report.journal, PARIS);
    // Guillemets doublés autour du nom, montant « 45,00 ».
    expect(csv).toContain('"Éric ""le grand"""');
    expect(csv).toContain("45,00");
  });
});
