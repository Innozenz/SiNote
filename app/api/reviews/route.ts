import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { notifyInBackground } from "@/lib/notifications/send";
import { buildNotification } from "@/lib/notifications/templates";
import prisma from "@/lib/prisma";
import { canReviewTeacher } from "@/lib/reviews/eligibility";

/**
 * Dépôt (ou mise à jour) de l'avis global d'un élève sur un prof.
 *
 * L'avis est **par couple prof↔élève**, pas par cours (`@@unique([teacherId,
 * studentId])`) : l'élève en a un seul, qu'il peut modifier. Il reste ancré sur
 * un cours réellement suivi (`bookingId`, le plus récent cours terminé) — c'est
 * ce qui garantit qu'il émane de quelqu'un qui a pris cours, et fournit un
 * instrument et une date crédibles à l'affichage. Sans cours terminé avec ce
 * prof, pas d'avis.
 *
 * La règle d'admissibilité vit dans lib/reviews/eligibility.ts, partagée avec
 * l'écran de l'élève.
 */

const bodySchema = z.object({
  teacherId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  // Un avis peut n'être qu'une note : exiger un texte ferait baisser le volume
  // sans gagner en qualité.
  comment: z.string().trim().max(2000).optional(),
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

    const { teacherId, rating, comment } = parsed.data;

    const student = await prisma.studentProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!student) {
      return NextResponse.json(
        { error: "Profil élève requis" },
        { status: 403 }
      );
    }

    // Cours terminé le plus récent avec ce prof : il prouve l'admissibilité et
    // sert d'ancre (`bookingId`, instrument et date de l'avis). Sans lui, l'élève
    // n'a pas suivi de cours avec ce prof — indiscernable d'un prof inexistant,
    // donc 404 comme partout ailleurs sur les ressources d'autrui.
    const anchor = await prisma.booking.findFirst({
      where: { teacherId, studentId: student.id, status: "COMPLETED" },
      orderBy: { startsAt: "desc" },
      select: {
        id: true,
        startsAt: true,
        isTrial: true,
        instrument: { select: { name: true } },
        teacher: {
          select: {
            user: { select: { name: true, email: true, timezone: true } },
          },
        },
        student: { select: { user: { select: { name: true, email: true } } } },
      },
    });

    const eligibility = canReviewTeacher(anchor !== null);

    if (!eligibility.ok) {
      // Aucun cours terminé : on ne confirme pas que le prof existe.
      return NextResponse.json(
        { error: "Cours introuvable" },
        { status: 404 }
      );
    }

    // anchor est non nul ici (eligibility l'exige).
    const booking = anchor!;

    // Un avis existant se met à jour (l'élève affine son jugement) ; sinon on le
    // crée. `upsert` sur la clé du couple. Sur mise à jour, on conserve l'ancre
    // `bookingId` d'origine — l'avis reste rattaché au cours qui l'a débloqué.
    const existing = await prisma.review.findUnique({
      where: { teacherId_studentId: { teacherId, studentId: student.id } },
      select: { id: true },
    });

    const review = await prisma.review.upsert({
      where: { teacherId_studentId: { teacherId, studentId: student.id } },
      create: {
        bookingId: booking.id,
        teacherId,
        studentId: student.id,
        rating,
        comment: comment || null,
        // Publié d'emblée (modération a posteriori — cf. lib/reviews).
        publishedAt: new Date(),
      },
      update: {
        rating,
        comment: comment || null,
      },
      select: { id: true, rating: true, comment: true, publishedAt: true },
    });

    // On ne prévient le prof qu'au premier avis, pas à chaque retouche : le
    // répéter serait du bruit, et le droit de réponse porte sur l'avis, pas sur
    // chacune de ses versions.
    if (!existing) {
      notifyInBackground(
        buildNotification(
          "review_received",
          {
            teacherName: booking.teacher.user.name,
            teacherEmail: booking.teacher.user.email,
            studentName: booking.student.user.name,
            studentEmail: booking.student.user.email,
            instrumentName: booking.instrument.name,
            startsAt: booking.startsAt,
            timezone: booking.teacher.user.timezone,
            isTrial: booking.isTrial,
            rating,
            reviewComment: comment || null,
            appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
          },
          "student"
        )
      );
    }

    return NextResponse.json(review, { status: existing ? 200 : 201 });
  } catch (error) {
    // Deux dépôts simultanés pour le même couple : l'unicité tranche là où la
    // vérification applicative a une fenêtre de course, comme ailleurs.
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "Vous avez déjà donné votre avis sur ce prof" },
        { status: 409 }
      );
    }

    console.error("[REVIEW_CREATE_ERROR]", error);
    return NextResponse.json(
      { error: "Impossible d'enregistrer l'avis" },
      { status: 500 }
    );
  }
}

/**
 * L'adaptateur de pilote n'expose pas de code d'erreur exploitable ; le nom de
 * la contrainte survit à la sérialisation — même raison qu'à `overlapConflict()`.
 */
function isUniqueViolation(error: unknown): boolean {
  const text = error instanceof Error ? `${error.message}` : String(error);

  return (
    text.includes("review_teacherId_studentId_key") ||
    text.includes("Unique constraint")
  );
}
