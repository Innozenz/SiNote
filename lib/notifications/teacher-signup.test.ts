import { describe, expect, it } from "vitest";

import {
  buildTeacherSignupNotifications,
  type TeacherSignupContext,
} from "./teacher-signup";

const context = (
  overrides: Partial<TeacherSignupContext> = {}
): TeacherSignupContext => ({
  name: "Camille Roy",
  email: "camille@example.test",
  slug: "camille-roy",
  timezone: "Europe/Paris",
  ...overrides,
});

const APP_URL = "https://sinote.fr";

describe("notification d'inscription d'un prof", () => {
  it("écrit un message par administrateur", () => {
    const notifications = buildTeacherSignupNotifications(
      ["a@example.test", "b@example.test"],
      context(),
      APP_URL
    );

    expect(notifications.map((n) => n.to)).toEqual([
      "a@example.test",
      "b@example.test",
    ]);
  });

  it("n'écrit rien quand personne n'est administrateur", () => {
    expect(buildTeacherSignupNotifications([], context(), APP_URL)).toEqual([]);
  });

  it("nomme le prof dans l'objet et donne son e-mail", () => {
    const [notification] = buildTeacherSignupNotifications(
      ["a@example.test"],
      context(),
      APP_URL
    );

    expect(notification.subject).toContain("Camille Roy");
    expect(notification.text).toContain("camille@example.test");
  });

  it("se rabat sur l'e-mail quand le nom est vide", () => {
    // Better Auth n'impose pas de nom : le message doit rester identifiable.
    const [notification] = buildTeacherSignupNotifications(
      ["a@example.test"],
      context({ name: "  " }),
      APP_URL
    );

    expect(notification.subject).toContain("camille@example.test");
  });

  it("dit que la fiche est en brouillon, pas en ligne", () => {
    // Un admin qui ouvrirait la fiche publique tomberait sur un 404 : le dire
    // évite de croire à une erreur.
    const [notification] = buildTeacherSignupNotifications(
      ["a@example.test"],
      context(),
      APP_URL
    );

    expect(notification.text).toContain("brouillon");
  });

  it("mène au compte dans l'administration, filtré sur son e-mail", () => {
    const [notification] = buildTeacherSignupNotifications(
      ["a@example.test"],
      context({ email: "prof+test@example.test" }),
      APP_URL
    );

    expect(notification.text).toContain(
      "https://sinote.fr/admin/utilisateurs?q=prof%2Btest%40example.test"
    );
  });

  it("omet le fuseau quand il n'a pas été reconnu", () => {
    const [notification] = buildTeacherSignupNotifications(
      ["a@example.test"],
      context({ timezone: null }),
      APP_URL
    );

    expect(notification.text).not.toContain("Fuseau");
  });
});
