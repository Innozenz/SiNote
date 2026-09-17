"use server";

import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * Marque « Mes cours » comme consulté : avance `coursSeenAt` à maintenant, ce
 * qui vide la pastille du signal in-app.
 *
 * Déclenchée au montage de la page **côté client** (voir `MarkCoursSeen`), donc
 * seulement sur une vraie visite — jamais lors d'un préchargement de lien, qui
 * rendrait la page côté serveur et viderait la pastille sans que l'élève ait
 * rien vu. `updateMany` : sans profil élève, c'est un no-op silencieux.
 */
export async function markCoursSeen() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return;

  await prisma.studentProfile.updateMany({
    where: { userId: session.user.id },
    data: { coursSeenAt: new Date() },
  });
}
