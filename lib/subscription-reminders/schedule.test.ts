import { describe, expect, it } from "vitest";

import { dueSubscriptionReminders, MAX_LEAD_HOURS } from "./schedule";

const now = new Date("2026-08-22T12:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 24 * 3_600_000);

describe("dueSubscriptionReminders", () => {
  it("ne déclenche rien loin de l'échéance", () => {
    expect(dueSubscriptionReminders(days(10), now)).toEqual([]);
  });

  it("déclenche J-5 quand l'échéance entre dans les 5 jours", () => {
    expect(dueSubscriptionReminders(days(4), now)).toEqual(["EXPIRY_J5"]);
  });

  it("ne déclenche pas encore J-5 à 5 jours et une heure", () => {
    const periodEnd = new Date(now.getTime() + (5 * 24 + 1) * 3_600_000);
    expect(dueSubscriptionReminders(periodEnd, now)).toEqual([]);
  });

  it("déclenche les deux dans la dernière journée (J-5 sera ignoré s'il est déjà pris)", () => {
    expect(dueSubscriptionReminders(days(0.5), now)).toEqual([
      "EXPIRY_J5",
      "EXPIRY_J1",
    ]);
  });

  it("ne déclenche rien pour un accès déjà expiré", () => {
    expect(dueSubscriptionReminders(days(-1), now)).toEqual([]);
    expect(dueSubscriptionReminders(now, now)).toEqual([]);
  });

  it("expose le préavis le plus large comme horizon", () => {
    expect(MAX_LEAD_HOURS).toBe(5 * 24);
  });
});
