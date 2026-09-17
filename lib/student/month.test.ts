import { describe, expect, it } from "vitest";

import {
  buildStudentMonth,
  currentMonthKey,
  isMonthKey,
  shiftMonth,
  type StudentMonthLesson,
} from "./month";

const PARIS = "Europe/Paris";

/** 2026-09-17, 10:00 à Paris. */
const NOW = new Date("2026-09-17T08:00:00.000Z");

const lesson = (
  startsAt: string,
  status: StudentMonthLesson["status"] = "CONFIRMED",
  hours = 1
): StudentMonthLesson => ({
  startsAt: new Date(startsAt),
  endsAt: new Date(new Date(startsAt).getTime() + hours * 3_600_000),
  status,
});

const cell = (month: ReturnType<typeof buildStudentMonth>, date: string) =>
  month.weeks.flat().find((c) => c.date === date)!;

describe("isMonthKey", () => {
  it("accepte une clé bien formée", () => {
    expect(isMonthKey("2026-09")).toBe(true);
  });

  it("refuse tout le reste", () => {
    for (const value of [undefined, "", "2026-13", "2026-00", "2026-9", "septembre"]) {
      expect(isMonthKey(value as string | undefined)).toBe(false);
    }
  });
});

describe("shiftMonth", () => {
  it("avance et recule dans l'année", () => {
    expect(shiftMonth("2026-09", 1)).toBe("2026-10");
    expect(shiftMonth("2026-09", -1)).toBe("2026-08");
  });

  it("franchit décembre et janvier", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-01", -13)).toBe("2024-12");
  });
});

describe("currentMonthKey", () => {
  it("lit le mois dans le fuseau de l'élève", () => {
    // 2026-09-30 23:30 UTC : déjà octobre à Paris, encore septembre à Chicago.
    const instant = new Date("2026-09-30T23:30:00.000Z");
    expect(currentMonthKey(instant, PARIS)).toBe("2026-10");
    expect(currentMonthKey(instant, "America/Chicago")).toBe("2026-09");
  });
});

describe("buildStudentMonth", () => {
  const month = buildStudentMonth({
    timezone: PARIS,
    month: "2026-09",
    now: NOW,
    lessons: [
      lesson("2026-09-18T07:00:00.000Z"), // confirmé à venir
      lesson("2026-09-21T07:00:00.000Z", "PENDING"), // demande
      lesson("2026-09-10T07:00:00.000Z"), // confirmé mais passé
      lesson("2026-09-03T07:00:00.000Z", "COMPLETED"),
    ],
  });

  it("rend des semaines complètes de lundi à dimanche", () => {
    expect(month.weeks.every((week) => week.length === 7)).toBe(true);
    expect(month.weeks[0][0].date).toBe("2026-08-31"); // lundi précédent
  });

  it("marque le mois voisin comme hors mois", () => {
    expect(cell(month, "2026-08-31").inMonth).toBe(false);
    expect(cell(month, "2026-09-01").inMonth).toBe(true);
  });

  it("repère aujourd'hui dans le fuseau de l'élève", () => {
    expect(cell(month, "2026-09-17").isToday).toBe(true);
    expect(cell(month, "2026-09-18").isToday).toBe(false);
  });

  it("distingue confirmé, en attente et passé", () => {
    expect(cell(month, "2026-09-18").marks).toEqual(["confirmed"]);
    expect(cell(month, "2026-09-21").marks).toEqual(["pending"]);
    expect(cell(month, "2026-09-10").marks).toEqual(["past"]);
    expect(cell(month, "2026-09-03").marks).toEqual(["past"]);
  });

  it("laisse les jours sans cours nus", () => {
    expect(cell(month, "2026-09-19").marks).toEqual([]);
    expect(cell(month, "2026-09-19").count).toBe(0);
  });

  it("dédoublonne les pastilles mais compte les cours", () => {
    const busy = buildStudentMonth({
      timezone: PARIS,
      month: "2026-09",
      now: NOW,
      lessons: [
        lesson("2026-09-22T07:00:00.000Z"),
        lesson("2026-09-22T12:00:00.000Z"),
        lesson("2026-09-22T15:00:00.000Z", "PENDING"),
      ],
    });

    expect(cell(busy, "2026-09-22").marks).toEqual(["confirmed", "pending"]);
    expect(cell(busy, "2026-09-22").count).toBe(3);
  });

  it("range un cours sous son jour local, pas son jour UTC", () => {
    // 2026-09-24 22:30 UTC = le 25 à 00:30 à Paris.
    const late = buildStudentMonth({
      timezone: PARIS,
      month: "2026-09",
      now: NOW,
      lessons: [lesson("2026-09-24T22:30:00.000Z")],
    });

    expect(cell(late, "2026-09-25").marks).toEqual(["confirmed"]);
    expect(cell(late, "2026-09-24").marks).toEqual([]);
  });
});
