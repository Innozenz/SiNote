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

  const groups = audios.length + scores.length + (images.length > 0 ? 1 : 0);

  return (
    <div className="flex flex-col gap-5">
      {report.content ? <RichTextContent html={report.content} /> : null}

      {/* Les pièces jointes en colonnes titrées, côte à côte : un cours donne
          une note audio, une partition et une photo du tableau, et les empiler
          en trois blocs muets obligeait à cliquer pour savoir lequel est quoi.
          Le titre dit le type, la carte porte le contenu. */}
      {groups > 0 ? (
        <div
          className={
            groups === 1
              ? "grid gap-3"
              : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          }
        >
          {audios.map((a) => (
            <AttachmentGroup key={a.id} label="Note audio">
              <div className="flex items-center gap-3 rounded-[var(--radius)] border border-border bg-elevated px-3.5 py-3">
                <Mic className="h-4 w-4 shrink-0 text-subtle" />
                <AudioPlayer src={`${base}/${a.id}`} className="min-w-0 flex-1" />
              </div>
            </AttachmentGroup>
          ))}

          {scores.map((a) => (
            <AttachmentGroup key={a.id} label="Partition">
              <a
                href={`${base}/${a.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2.5 rounded-[var(--radius)] border border-border bg-elevated px-3.5 py-3 text-sm transition-colors hover:border-border-strong"
              >
                <FileText className="h-5 w-5 shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {a.filename}
                  </span>
                  <span className="block text-xs text-muted">
                    {formatSize(a.sizeBytes)}
                  </span>
                </span>
                <Download className="h-4 w-4 shrink-0 text-subtle" />
              </a>
            </AttachmentGroup>
          ))}

          {images.length > 0 ? (
            <AttachmentGroup label={images.length === 1 ? "Image" : "Images"}>
              <ReportImages
                base={base}
                images={images.map((a) => ({ id: a.id, filename: a.filename }))}
              />
            </AttachmentGroup>
          ) : null}
        </div>
      ) : null}

      {/* Échanges autour de ce cours. */}
      <ReportComments bookingId={bookingId} comments={report.comments} me={me} />
    </div>
  );
}

/** Une pièce jointe sous son type, en petites capitales. */
function AttachmentGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-xs uppercase tracking-[0.1em] text-muted">
        {label}
      </span>
      {children}
    </div>
  );
}

/** « 1,2 Mo », « 340 ko » — la taille, pas un nombre d'octets. */
function formatSize(bytes: number): string {
  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
  }

  return `${Math.max(1, Math.round(bytes / 1000))} ko`;
}
