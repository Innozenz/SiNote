import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveParticipant } from "@/lib/bookings/participant";
import { notifyInBackground } from "@/lib/notifications/send";
import { buildNotification } from "@/lib/notifications/templates";
import prisma from "@/lib/prisma";
import { canDocument } from "@/lib/reports/eligibility";
import { sanitizeReportHtml } from "@/lib/reports/sanitize";

/**
 * Compte rendu d'un cours — le texte.
 *
 * Écrit par le prof, lu par l'élève (qui le voit sur son tableau de bord). Le
 * texte est optionnel : un compte rendu peut n'être que des pièces jointes.
 */
const putSchema = z.object({
  // Titre libre, optionnel : à défaut, l'affichage retombe sur le titre auto
  // « Cours de … ». Texte simple, rendu échappé par React côté vues.
  title: z.string().max(200).nullish(),
  content: z.string().max(5000).nullable(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const parsed = putSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Paramètres invalides.", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const access = await resolveParticipant((await params).id);

    if ("error" in access) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status }
      );
    }

    // L'élève est un participant légitime (donc pas de 404), mais seul le prof
    // rédige : 403 explicite.
    if (access.actor !== "teacher") {
      return NextResponse.json(
        { error: "Seul le professeur rédige le compte rendu." },
        { status: 403 }
      );
    }

    if (!canDocument(access.booking.status, access.booking.startsAt, new Date())) {
      return NextResponse.json(
        { error: "Ce cours ne peut pas encore être documenté." },
        { status: 409 }
      );
    }

    // Le HTML de l'éditeur riche est assaini avant stockage (liste blanche
    // stricte) : rendu tel quel à l'élève, il serait sinon un vecteur XSS. Un
    // contenu réduit à des balises vides retombe sur null.
    const sanitized = parsed.data.content
      ? sanitizeReportHtml(parsed.data.content)
      : null;
    const content =
      sanitized && sanitized.replace(/<[^>]*>/g, "").trim()
        ? sanitized
        : null;

    // Titre : texte simple, réduit à null quand vide.
    const title = parsed.data.title?.trim() ? parsed.data.title.trim() : null;

    const existing = await prisma.lessonReport.findUnique({
      where: { bookingId: access.booking.id },
      select: { content: true },
    });

    const report = await prisma.lessonReport.upsert({
      where: { bookingId: access.booking.id },
      create: { bookingId: access.booking.id, title, content },
      update: { title, content },
      select: { id: true, title: true, content: true, updatedAt: true },
    });

    // On prévient l'élève au premier compte rendu (vide → renseigné), pas à
    // chaque retouche : le répéter serait du bruit.
    if (!existing?.content?.trim() && content) {
      await notifyReportPublished(access.booking.id);
    }

    return NextResponse.json(report);
  } catch (error) {
    console.error("[REPORT_PUT_ERROR]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

/** Relit le cours pour ses noms/e-mails et prévient l'élève, sans bloquer. */
async function notifyReportPublished(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      startsAt: true,
      isTrial: true,
      instrument: { select: { name: true } },
      teacher: {
        select: { user: { select: { name: true, email: true, timezone: true } } },
      },
      student: { select: { user: { select: { name: true, email: true } } } },
    },
  });

  if (!booking) return;

  notifyInBackground(
    buildNotification(
      "report_published",
      {
        teacherName: booking.teacher.user.name,
        teacherEmail: booking.teacher.user.email,
        studentName: booking.student.user.name,
        studentEmail: booking.student.user.email,
        instrumentName: booking.instrument.name,
        startsAt: booking.startsAt,
        timezone: booking.teacher.user.timezone,
        isTrial: booking.isTrial,
        appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      },
      "teacher"
    )
  );
}
