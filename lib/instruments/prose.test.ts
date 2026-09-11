import { describe, expect, it } from "vitest";

import { instrumentInProse } from "./prose";

describe("instrumentInProse", () => {
  it("met la première lettre en minuscule", () => {
    expect(instrumentInProse("Piano")).toBe("piano");
    expect(instrumentInProse("Guitare électrique")).toBe("guitare électrique");
    expect(instrumentInProse("Éveil musical")).toBe("éveil musical");
  });

  it("garde un sigle en capitales", () => {
    expect(instrumentInProse("MAO")).toBe("MAO");
    expect(instrumentInProse("DJ")).toBe("DJ");
  });

  it("ne touche pas à une chaîne vide", () => {
    expect(instrumentInProse("")).toBe("");
  });
});
