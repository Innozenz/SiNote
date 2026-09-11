import { describe, expect, it } from "vitest";

import { summarizeOpenings } from "./openings-summary";

describe("summarizeOpenings", () => {
  it("rend null sans règle", () => {
    expect(summarizeOpenings([])).toBeNull();
  });

  it("nomme les plages couvertes, dans l'ordre des jours", () => {
    expect(
      summarizeOpenings([
        { weekday: 5, startMinute: 9 * 60, endMinute: 12 * 60 },
        { weekday: 1, startMinute: 18 * 60, endMinute: 22 * 60 },
        { weekday: 1, startMinute: 9 * 60, endMinute: 13 * 60 },
      ])
    ).toBe("lun. matin, après-midi et soir · ven. matin");
  });

  it("omet les plages quand la journée entière est ouverte", () => {
    expect(
      summarizeOpenings([{ weekday: 3, startMinute: 8 * 60, endMinute: 20 * 60 }])
    ).toBe("mer.");
  });

  it("une plage qui chevauche 12:00 compte pour le matin et l'après-midi", () => {
    expect(
      summarizeOpenings([{ weekday: 2, startMinute: 11 * 60, endMinute: 14 * 60 }])
    ).toBe("mar. matin et après-midi");
  });
});
