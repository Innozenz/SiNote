import { Download, FileText, Mic } from "lucide-react";

import { AudioPlayer } from "@/components/audio-player";
import { type MessageView } from "@/components/message-thread";
import { ReportComments } from "@/components/report-comments";
import { ReportImages } from "@/components/report-images";
import { RichTextContent } from "@/components/rich-text-content";

export type ReportView = {
  /** Titre libre du prof ; vide → l'appelant retombe sur le titre auto. */
  title?: string | null;
  content: string | null;
  attachments: {
    id: string;
    filename: string;
    contentType: string;
    kind: "IMAGE" | "SCORE" | "AUDIO";
    sizeBytes: number;
  }[];
  comments: MessageView[];
};

/**
 * Compte rendu en lecture seule.
 *
 * Corps « nu » (pas de cadre à lui) : c'est la carte de l'appelant qui encadre,
 * pour ne pas emboîter deux boîtes. Les pièces jointes sont groupées par type —
 * vignettes pour les images, documents pour les partitions, lecteur pour l'audio.
 * Elles sont servies par la route d'accès (qui vérifie le participant) ; l'`src`
 * pointe dessus, jamais sur l'objet privé en direct.
 */
export function ReportViewer({
  bookingId,
  report,
  me,
}: {
  bookingId: string;
  report: ReportView;
  /** Rôle du lecteur, pour aligner ses propres messages. */
  me: "TEACHER" | "STUDENT";
}) {
  const base = `/api/bookings/${bookingId}/report/attachments`;
  const images = report.attachments.filter((a) => a.kind === "IMAGE");
  const scores = report.attachments.filter((a) => a.kind === "SCORE");
  const audios = report.attachments.filter((a) => a.kind === "AUDIO");

  return (
    <div className="flex flex-col gap-4">
      {report.content ? <RichTextContent html={report.content} /> : null}

      {images.length > 0 ? (
        <ReportImages
          base={base}
          images={images.map((a) => ({ id: a.id, filename: a.filename }))}
        />
      ) : null}

      {audios.length > 0 ? (
        <div className="flex flex-col gap-2">
          {audios.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-elevated px-3 py-2"
            >
              <Mic className="h-4 w-4 shrink-0 text-subtle" />
              <AudioPlayer src={`${base}/${a.id}`} className="min-w-0 flex-1" />
            </div>
          ))}
        </div>
      ) : null}

      {scores.length > 0 ? (
        <div className="flex flex-col gap-2">
          {scores.map((a) => (
            <a
              key={a.id}
              href={`${base}/${a.id}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-lg border border-border bg-elevated px-3 py-2 text-sm transition-colors hover:border-border-strong"
            >
              <FileText className="h-5 w-5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate">{a.filename}</span>
              <Download className="h-4 w-4 shrink-0 text-subtle" />
            </a>
          ))}
        </div>
      ) : null}

      {/* Échanges autour de ce cours. */}
      <ReportComments bookingId={bookingId} comments={report.comments} me={me} />
    </div>
  );
}
