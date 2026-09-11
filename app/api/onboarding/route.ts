import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { notifyAdminsInBackground } from "@/lib/admin/notify";
import { auth } from "@/lib/auth";
import { buildTeacherSignupNotifications } from "@/lib/notifications/teacher-signup";
import prisma from "@/lib/prisma";
import { uniqueSlug } from "@/lib/slug";

/**
 * Choix du rôle après inscription.
 *
 * Nécessaire parce que l'inscription crée le compte avant que l'utilisateur
 * ait pu dire ce qu'il vient faire : `User.role` naît nul et c'est cette route
 * qui le renseigne, en créant le profil correspondant.
 *
 * Le rôle n'est pas modifiable ensuite : une fiche prof porte un slug public,
 * des disponibilités et un historique de cours, qu'une bascule vers « élève »
 * laisserait orphelins. Changer de rôle relève du support, pas d'un bouton.
 */

const bodySchema = z.object({
  role: z.enum(["TEACHER", "STUDENT"]),
  /** Fuseau IANA détecté côté navigateur. */
  timezone: z.string().min(1).max(64).optional(),
});

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Paramètres invalides", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { role } = parsed.data;
    const timezone = normalizeTimezone(parsed.data.timezone);

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Compte introuvable" },
        { status: 404 }
      );
    }

    if (user.role) {
      return NextResponse.json(
        { error: "Le rôle a déjà été choisi" },
        { status: 409 }
      );
    }

    if (role === "STUDENT") {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { role, ...(timezone ? { timezone } : {}) },
        }),
        prisma.studentProfile.create({ data: { userId: user.id } }),
      ]);

      return NextResponse.json({ role, redirectTo: "/dashboard" }, { status: 201 });
    }

    // Le slug se déduit du nom, avec l'adresse e-mail en repli : un compte
    // sans nom renseigné doit malgré tout obtenir une URL lisible.
    const base = user.name?.trim() || user.email.split("@")[0];
    const slug = await uniqueSlug(base, async (candidate) => {
      const existing = await prisma.teacherProfile.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      return existing !== null;
    });

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { role, ...(timezone ? { timezone } : {}) },
      }),
      // La fiche naît en DRAFT : elle n'est publiable qu'une fois renseignée,
      // et de toute façon invisible tant que l'abonnement n'est pas actif.
      prisma.teacherProfile.create({ data: { userId: user.id, slug } }),
    ]);

    // Une fiche naît invisible : sans ce message, l'équipe ne découvre un
    // nouveau prof qu'en ouvrant l'administration. Non attendu — l'inscription
    // vaut que l'e-mail parte ou non.
    notifyAdminsInBackground("TEACHER_SIGNUP", (recipients, appUrl) =>
      buildTeacherSignupNotifications(
        recipients,
        { name: user.name, email: user.email, slug, timezone },
        appUrl
      )
    );

    return NextResponse.json(
      { role, slug, redirectTo: "/dashboard" },
      { status: 201 }
    );
  } catch (error) {
    console.error("[ONBOARDING_ERROR]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

/**
 * Le fuseau vient du navigateur : on ne le retient que s'il est réellement
 * connu d'Intl, sinon tout le calcul de créneaux reposerait sur une chaîne
 * arbitraire.
 */
function normalizeTimezone(timezone: string | undefined): string | null {
  if (!timezone) return null;

  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone: timezone });
    return timezone;
  } catch {
    return null;
  }
}
