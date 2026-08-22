"use server";

import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * Marque les comptes rendus comme consultés du côté de l'utilisateur courant :
 * avance `reportsSeenAt` à maintenant, ce qui vide la pastille in-app (nav).
 *
 * Même patron que `markCoursSeen` : déclenchée au montage **côté client** (voir
 * `MarkReportsSeen`), donc seulement sur une vraie visite — jamais lors d'un
 * préchargement de lien. Les deux `updateMany` sont sans effet pour le rôle
 * absent (un prof n'a pas de profil élève et réciproquement), donc l'action sert
 * indifféremment les deux surfaces sans savoir qui appelle.
 */
export async function markReportsSeen() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return;

  const now = new Date();
  await Promise.all([
    prisma.teacherProfile.updateMany({
      where: { userId: session.user.id },
      data: { reportsSeenAt: now },
    }),
    prisma.studentProfile.updateMany({
      where: { userId: session.user.id },
      data: { reportsSeenAt: now },
    }),
  ]);
}
