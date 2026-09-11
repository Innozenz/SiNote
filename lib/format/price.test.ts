import { describe, expect, it } from "vitest";

import { formatPrice } from "./price";

// `Intl` sépare le montant du symbole par une espace fine insécable (U+202F).
const normalize = (s: string) => s.replace(/ | /g, " ");

describe("formatPrice", () => {
  it("omet les décimales quand le montant est rond", () => {
    expect(normalize(formatPrice(4500))).toBe("45 €");
    expect(normalize(formatPrice(0))).toBe("0 €");
  });

  it("en garde deux sinon, avec la virgule", () => {
    expect(normalize(formatPrice(4250))).toBe("42,50 €");
  });

  it("groupe les milliers à la française", () => {
    expect(normalize(formatPrice(125000))).toBe("1 250 €");
  });
});
