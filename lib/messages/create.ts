import { randomUUID } from "node:crypto";

import prisma from "@/lib/prisma";
import { resolveAttachmentType } from "@/lib/reports/attachments";
import { messageAttachmentKey } from "@/lib/storage/keys";
import { uploadPrivate } from "@/lib/storage/objects";

/**
 * Création d'un message de fil, avec pièce jointe optionnelle.
 *
 * Mutualisé par les trois entrées (fil général prof, fil général élève,
 * commentaire de compte rendu) : elles diffèrent par l'authentification, jamais
 * par la façon d'écrire un message. Un message porte du texte, une pièce jointe,
 * ou les deux — mais pas rien. Les images sont ré-encodées en WebP (EXIF/GPS
 * retiré, dimensions bornées), comme pour les comptes rendus ; PDF et audio
 * partent tels quels dans le bucket **privé**.
 */

const MAX_CONTENT = 3000;

export type CreatedMessage = {
  id: string;
  sender: "TEACHER" | "STUDENT";
  content: string;
  createdAt: Date;
  attachments: {
    id: string;
    filename: string;
    contentType: string;
    kind: "IMAGE" | "SCORE" | "AUDIO";
  }[];
};

type Result =
  | { ok: true; message: CreatedMessage }
  | { ok: false; error: string; status: number };

export async function createThreadMessage(input: {
  teacherId: string;
  studentId: string;
  sender: "TEACHER" | "STUDENT";
  reportId?: string | null;
  content: string;
  file: File | null;
}): Promise<Result> {
  const content = input.content.trim();

  if (content.length > MAX_CONTENT) {
    return { ok: false, error: "Message trop long.", status: 400 };
  }
  if (!content && !input.file) {
    return { ok: false, error: "Message vide.", status: 400 };
  }

  // Prépare la pièce jointe (validation + traitement) avant tout écrit en base :
  // un fichier refusé ne doit pas laisser de message fantôme.
  let attachment: {
    storageKey: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    kind: "IMAGE" | "SCORE" | "AUDIO";
  } | null = null;

  if (input.file) {
    const type = resolveAttachmentType(input.file.type);
    if (!type) {
      return {
        ok: false,
        error: "Type de fichier non supporté (image, PDF ou audio).",
        status: 400,
      };
    }
    if (input.file.size > type.maxBytes) {
      return {
        ok: false,
        error: `Fichier trop lourd : ${Math.round(type.maxBytes / (1024 * 1024))} Mo au maximum.`,
        status: 400,
      };
    }

    const raw = Buffer.from(await input.file.arrayBuffer());
    let body = raw;
    let contentType = input.file.type.split(";")[0]?.trim() ?? input.file.type;
    let ext = type.ext;

    if (type.kind === "IMAGE") {
      try {
        // Import paresseux : un module natif chargé en tête de fichier ferait
        // planter *tout* l'envoi (même un message texte) si sa lib système
        // manque. Ici, sharp n'est requis que pour une vraie image.
        const sharp = (await import("sharp")).default;
        body = await sharp(raw)
          .rotate()
          .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 85 })
          .toBuffer();
      } catch {
        return { ok: false, error: "Image illisible ou corrompue.", status: 400 };
      }
      contentType = "image/webp";
      ext = "webp";
    }

    const key = messageAttachmentKey(
      input.teacherId,
      input.studentId,
      randomUUID(),
      ext
    );

    // L'objet part d'abord ; l'écrit en base qui le référence suit. Un échec
    // d'upload laisse zéro ligne, un échec DB un objet orphelin (rare, toléré).
    await uploadPrivate({ key, body, contentType });

    attachment = {
      storageKey: key,
      filename: input.file.name,
      contentType,
      sizeBytes: body.length,
      kind: type.kind,
    };
  }

  const message = await prisma.message.create({
    data: {
      teacherId: input.teacherId,
      studentId: input.studentId,
      sender: input.sender,
      content,
      reportId: input.reportId ?? null,
      attachments: attachment ? { create: attachment } : undefined,
    },
    select: {
      id: true,
      sender: true,
      content: true,
      createdAt: true,
      attachments: {
        select: { id: true, filename: true, contentType: true, kind: true },
      },
    },
  });

  return { ok: true, message };
}
