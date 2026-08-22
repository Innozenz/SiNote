import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { resolveParticipant } from "@/lib/bookings/participant";
import prisma from "@/lib/prisma";
import {
  MAX_ATTACHMENTS,
  resolveAttachmentType,
} from "@/lib/reports/attachments";
import { canDocument } from "@/lib/reports/eligibility";
import { reportAttachmentKey } from "@/lib/storage/keys";
import { uploadPrivate } from "@/lib/storage/objects";

/**
 * Ajout d'une pièce jointe à un compte rendu (image, partition PDF, note audio).
 *
 * Le fichier part dans le bucket **privé** — jamais public. Les images sont
 * ré-encodées en WebP (EXIF/GPS supprimé, taille bornée) ; PDF et audio sont
 * stockés tels quels.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const access = await resolveParticipant((await params).id);

    if ("error" in access) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status }
      );
    }

    if (access.actor !== "teacher") {
      return NextResponse.json(
        { error: "Seul le professeur ajoute des pièces jointes." },
        { status: 403 }
      );
    }

    if (!canDocument(access.booking.status, access.booking.startsAt, new Date())) {
      return NextResponse.json(
        { error: "Ce cours ne peut pas encore être documenté." },
        { status: 409 }
      );
    }

    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
    }

    const type = resolveAttachmentType(file.type);

    if (!type) {
      return NextResponse.json(
        { error: "Type de fichier non supporté (image, PDF ou audio)." },
        { status: 400 }
      );
    }

    if (file.size > type.maxBytes) {
      return NextResponse.json(
        {
          error: `Fichier trop lourd : ${Math.round(type.maxBytes / (1024 * 1024))} Mo au maximum.`,
        },
        { status: 400 }
      );
    }

    // Le compte rendu peut ne pas exister encore (pièces jointes avant le texte).
    const report = await prisma.lessonReport.upsert({
      where: { bookingId: access.booking.id },
      create: { bookingId: access.booking.id },
      update: {},
      select: { id: true, _count: { select: { attachments: true } } },
    });

    if (report._count.attachments >= MAX_ATTACHMENTS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_ATTACHMENTS} pièces jointes par compte rendu.` },
        { status: 400 }
      );
    }

    const raw = Buffer.from(await file.arrayBuffer());

    // Images : ré-encodage WebP (métadonnées supprimées, dimensions bornées).
    let body = raw;
    let contentType = file.type.split(";")[0]?.trim() ?? file.type;
    let ext = type.ext;

    if (type.kind === "IMAGE") {
      try {
        // Import paresseux (cf. lib/messages/create.ts) : sharp n'est chargé
        // que pour une vraie image, jamais au chargement du module.
        const sharp = (await import("sharp")).default;
        body = await sharp(raw)
          .rotate()
          .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 85 })
          .toBuffer();
      } catch {
        return NextResponse.json(
          { error: "Image illisible ou corrompue." },
          { status: 400 }
        );
      }
      contentType = "image/webp";
      ext = "webp";
    }

    const key = reportAttachmentKey(access.booking.id, randomUUID(), ext);

    await uploadPrivate({ key, body, contentType });

    const attachment = await prisma.reportAttachment.create({
      data: {
        reportId: report.id,
        storageKey: key,
        filename: file.name,
        contentType,
        sizeBytes: body.length,
        kind: type.kind,
      },
      select: {
        id: true,
        filename: true,
        contentType: true,
        sizeBytes: true,
        kind: true,
      },
    });

    return NextResponse.json(attachment);
  } catch (error) {
    console.error("[REPORT_ATTACHMENT_POST_ERROR]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
