import { describe, expect, it } from "vitest";

import { medianResponseHours, type ResponseSample } from "./response-time";

const BASE = new Date("2026-09-01T08:00:00.000Z");

/** Une demande répondue `hours` heures plus tard. */
const answered = (hours: number): ResponseSample => ({
  createdAt: BASE,
  confirmedAt: new Date(BASE.getTime() + hours * 3_600_000),
});

describe("medianResponseHours", () => {
  it("se tait en deçà de trois réponses", () => {
    expect(medianResponseHours([])).toBeNull();
    expect(medianResponseHours([answered(1), answered(2)])).toBeNull();
  });

  it("ignore les demandes jamais répondues", () => {
    const samples = [
      answered(1),
      answered(2),
      { createdAt: BASE, confirmedAt: null },
    ];
    // Deux réponses seulement : pas assez.
    expect(medianResponseHours(samples)).toBeNull();
  });

  it("prend la médiane, pas la moyenne", () => {
    // Moyenne ≈ 34 h, médiane 0,2 h : c'est la médiane qui décrit l'habitude.
    const samples = [
      answered(0.1),
      answered(0.2),
      answered(0.2),
      answered(0.3),
      answered(168),
    ];
    expect(medianResponseHours(samples)).toBe(1);
  });

  it("arrondit au palier supérieur", () => {
    expect(medianResponseHours([answered(2.5), answered(2.9), answered(3)])).toBe(3);
    expect(medianResponseHours([answered(5), answered(5), answered(5)])).toBe(6);
    expect(medianResponseHours([answered(20), answered(20), answered(20)])).toBe(24);
  });

  it("moyenne les deux valeurs centrales sur un effectif pair", () => {
    // Valeurs centrales 1 et 3 → médiane 2 → palier 2 h.
    expect(
      medianResponseHours([answered(1), answered(1), answered(3), answered(5)])
    ).toBe(2);
  });

  it("se tait au-delà du dernier palier", () => {
    expect(medianResponseHours([answered(200), answered(200), answered(200)])).toBeNull();
  });

  it("écarte une réponse antérieure à la demande", () => {
    const broken: ResponseSample = {
      createdAt: BASE,
      confirmedAt: new Date(BASE.getTime() - 3_600_000),
    };
    // Reste deux échantillons valides : pas assez pour se prononcer.
    expect(medianResponseHours([broken, answered(2), answered(2)])).toBeNull();
  });
});
