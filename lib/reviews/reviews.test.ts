import { describe, expect, it } from "vitest";

import { canReviewTeacher, isValidRating } from "./eligibility";
import {
  distribution,
  formatAverage,
  summarize,
  summarizeFromCounts,
} from "./summary";

describe("canReviewTeacher", () => {
  it("autorise dès qu'un cours est terminé avec ce prof", () => {
    expect(canReviewTeacher(true)).toEqual({ ok: true });
  });

  it("refuse sans aucun cours terminé", () => {
    expect(canReviewTeacher(false)).toMatchObject({
      ok: false,
      reason: "no_completed_lesson",
    });
  });
});

describe("isValidRating", () => {
  it.each([1, 2, 3, 4, 5])("accepte %i", (rating) => {
    expect(isValidRating(rating)).toBe(true);
  });

  it.each([0, 6, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuse %p",
    (rating) => {
      expect(isValidRating(rating)).toBe(false);
    }
  );
});

describe("summarize", () => {
  it("rend une moyenne nulle sans avis", () => {
    expect(summarize([])).toEqual({ count: 0, average: null });
  });

  it("arrondit au dixième", () => {
    expect(summarize([5, 4, 4])).toEqual({ count: 3, average: 4.3 });
  });

  it("ne perd pas les notes basses", () => {
    expect(summarize([1, 1, 5])).toEqual({ count: 3, average: 2.3 });
  });

  it("donne le même résultat que le calcul par comptage", () => {
    const ratings = [5, 5, 4, 3, 5, 2];
    const counts = [
      { rating: 5, count: 3 },
      { rating: 4, count: 1 },
      { rating: 3, count: 1 },
      { rating: 2, count: 1 },
    ];

    expect(summarizeFromCounts(counts)).toEqual(summarize(ratings));
  });
});

describe("distribution", () => {
  it("rend les cinq lignes, y compris les notes absentes", () => {
    const rows = distribution([
      { rating: 5, count: 3 },
      { rating: 3, count: 1 },
    ]);

    expect(rows.map((r) => r.rating)).toEqual([5, 4, 3, 2, 1]);
    expect(rows.find((r) => r.rating === 4)).toEqual({
      rating: 4,
      count: 0,
      share: 0,
    });
    expect(rows.find((r) => r.rating === 5)?.share).toBe(75);
  });

  it("ne divise pas par zéro", () => {
    expect(distribution([]).every((row) => row.share === 0)).toBe(true);
  });
});

describe("formatAverage", () => {
  it("écrit la virgule française", () => {
    expect(formatAverage(4.8)).toBe("4,8");
  });

  it("garde le dixième d'un entier", () => {
    expect(formatAverage(5)).toBe("5,0");
  });

  it("rend null sans avis", () => {
    expect(formatAverage(null)).toBeNull();
  });
});
