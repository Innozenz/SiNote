"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Mic,
  Paperclip,
  Pencil,
  Square,
  Trash2,
  User,
} from "lucide-react";

import { AudioPlayer } from "@/components/audio-player";
import { type MessageView } from "@/components/message-thread";
import { ReportComments } from "@/components/report-comments";
import { RichTextContent } from "@/components/rich-text-content";
import { RichTextEditor } from "@/components/rich-text-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { lessonTitle } from "@/lib/bookings/title";
import { FILE_ACCEPT } from "@/lib/reports/attachments";
import { notifySuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";

export type ReportAttachmentView = {
  id: string;
  filename: string;
  contentType: string;
  kind: "IMAGE" | "SCORE" | "AUDIO";
  sizeBytes: number;
};

export type ReportEditorLesson = {
  bookingId: string;
  dateLabel: string;
  studentName: string;
  instrumentName: string;
  isTrial: boolean;
  /** Titre libre donné par le prof ; vide → titre auto « Cours de … ». */
  title: string;
  content: string;
  attachments: ReportAttachmentView[];
  /**
   * Lien vers la fiche de l'élève. Fourni par l'atelier global (tous élèves
   * confondus), où rejoindre le profil demande sinon de retrouver l'élève à la
   * main ; absent sur la fiche élève elle-même, où le lien pointerait sur la
   * page courante.
   */
  studentHref?: string;
};

/**
 * Éditeur d'un compte rendu de cours (côté prof).
 *
 * Une carte repliée par cours ; dépliée, elle édite le texte et gère les pièces
 * jointes (images, partitions PDF, notes audio enregistrées au micro). Chaque
 * pièce part vers le bucket privé via la route dédiée, et s'affiche par une URL
 * signée servie par cette même route.
 *
 * Sur la fiche élève, on lui passe en plus le fil d'échanges (`comments`/`me`)
 * et une ancre (`hashId`) : le prof peut alors compléter ou modifier le compte
 * rendu **et** dialoguer au même endroit, sans repasser par l'atelier global.
 * Le lien « Compte rendu » de l'historique ouvre directement le bon via l'ancre.
 */
export function ReportEditor({
  lesson,
  comments,
  me,
  hashId,
  defaultOpen = false,
}: {
  lesson: ReportEditorLesson;
  /** Fil d'échanges rattaché au cours ; rendu sous l'éditeur si fourni. */
  comments?: MessageView[];
  me?: "TEACHER" | "STUDENT";
  /** Ancre `#…` : ouvre et fait défiler jusqu'à ce compte rendu au chargement. */
  hashId?: string;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const base = `/api/bookings/${lesson.bookingId}/report`;

  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(defaultOpen);
  const [title, setTitle] = useState(lesson.title);
  const [savedTitle, setSavedTitle] = useState(lesson.title);
  const [content, setContent] = useState(lesson.content);
  const [saved, setSaved] = useState(lesson.content);
  const [savingContent, setSavingContent] = useState(false);
  // Le texte s'affiche en lecture une fois enregistré ; ce drapeau bascule vers
  // l'édition. Tant qu'aucun texte n'est enregistré, il n'y a rien à lire, donc
  // le champ reste ouvert quoi qu'il arrive (voir le rendu plus bas).
  const [editingText, setEditingText] = useState(false);
  const [attachments, setAttachments] = useState(lesson.attachments);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    // Synchronisation avec l'URL : l'ancre n'est connue que côté client, après
    // hydratation. Serveur et client rendent d'abord `defaultOpen` à l'identique
    // (pas de divergence) ; on ouvre ensuite le compte rendu visé.
    if (hashId && window.location.hash === `#${hashId}`) {
      setOpen(true);
      rootRef.current?.scrollIntoView({ block: "start" });
    }
  }, [hashId]);

  const dirty = content !== saved || title.trim() !== savedTitle.trim();
  const documented = saved.trim().length > 0 || attachments.length > 0;
  // Titre affiché dans l'en-tête : celui du prof, ou le titre auto à défaut.
  const heading =
    savedTitle.trim() ||
    `${lessonTitle(lesson.instrumentName, lesson.isTrial)} avec ${lesson.studentName}`;

  // Pièces jointes regroupées par type — images, notes audio, partitions — pour
  // que l'éditeur soit aussi lisible que la vue en lecture seule, plutôt qu'un
  // mélange de vignettes, de lecteurs et de documents dans une seule rangée.
  const images = attachments.filter((a) => a.kind === "IMAGE");
  const audios = attachments.filter((a) => a.kind === "AUDIO");
  const scores = attachments.filter((a) => a.kind === "SCORE");

  const saveContent = async () => {
    setSavingContent(true);
    setError(null);
    try {
      const res = await fetch(base, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() || null, content }),
      });
      const data = (await res.json().catch(() => null)) as
        | { title?: string | null; content?: string | null; error?: string }
        | null;
      if (!res.ok) {
        setError(data?.error ?? "L'enregistrement a échoué.");
        return;
      }
      // On adopte les valeurs renvoyées par le serveur : elles ont été assainies
      // et stockées, donc la seule vérité pour la lecture et le prochain
      // « Modifier ».
      const stored = data?.content ?? "";
      const storedTitle = data?.title ?? "";
      setContent(stored);
      setSaved(stored);
      setTitle(storedTitle);
      setSavedTitle(storedTitle);
      setEditingText(false);
      notifySuccess("Compte rendu enregistré.");
      router.refresh();
    } catch {
      setError("Impossible de joindre le serveur.");
    } finally {
      setSavingContent(false);
    }
  };

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.append("file", file);
    try {
      const res = await fetch(`${base}/attachments`, { method: "POST", body });
      const data = (await res.json().catch(() => null)) as
        | ReportAttachmentView
        | { error?: string }
        | null;
      if (!res.ok || !data || !("id" in data)) {
        setError(
          (data && "error" in data && data.error) || "L'envoi a échoué."
        );
        return;
      }
      setAttachments((list) => [...list, data]);
      router.refresh();
    } catch {
      setError("Impossible de joindre le serveur.");
    } finally {
      setBusy(false);
    }
  };

  const onPickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) upload(file);
  };

  const removeAttachment = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${base}/attachments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("La suppression a échoué.");
        return;
      }
      setAttachments((list) => list.filter((a) => a.id !== id));
      notifySuccess("Pièce jointe supprimée.");
      router.refresh();
    } catch {
      setError("Impossible de joindre le serveur.");
    } finally {
      setBusy(false);
    }
  };

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunks, { type });
        const ext = type.includes("ogg") ? "ogg" : "webm";
        await upload(
          new File([blob], `note-audio-${Date.now()}.${ext}`, { type })
        );
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError(
        "Micro inaccessible. Autorisez l'accès au microphone dans le navigateur."
      );
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  const commentCount = comments?.length ?? 0;

  return (
    <div
      ref={rootRef}
      id={hashId}
      className={cn(
        "rounded-lg border border-border bg-elevated",
        hashId && "scroll-mt-20"
      )}
    >
      {/* En-tête cliquable */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{heading}</p>
          <p className="truncate text-xs text-muted">
            {savedTitle.trim()
              ? `${lessonTitle(lesson.instrumentName, lesson.isTrial)} avec ${lesson.studentName} · ${lesson.dateLabel}`
              : lesson.dateLabel}
          </p>
        </div>

        {!open && (attachments.length > 0 || commentCount > 0) ? (
          <span className="hidden shrink-0 items-center gap-2 text-xs text-subtle sm:flex">
            {attachments.length > 0 ? (
              <span className="flex items-center gap-1">
                <Paperclip className="h-3.5 w-3.5" />
                {attachments.length}
              </span>
            ) : null}
            {commentCount > 0 ? (
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3.5 w-3.5" />
                {commentCount}
              </span>
            ) : null}
          </span>
        ) : null}

        <Badge variant={documented ? "success" : "secondary"}>
          {documented ? "Documenté" : "À documenter"}
        </Badge>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {/* Pliage animé : ligne de grille 0fr → 1fr, hauteur animée jusqu'à
          `auto` sans mesure JS. Le corps reste monté (brouillon de texte et
          pièces jointes conservés) mais devient `inert` quand il est replié. */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden" inert={!open}>
          <div className="flex flex-col gap-4 border-t border-border px-4 py-4">
            {/* Accès à la fiche de l'élève depuis l'atelier global, où l'on
                travaille tous élèves confondus. */}
            {lesson.studentHref ? (
              <Link
                href={lesson.studentHref}
                className="flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <User className="h-3.5 w-3.5" />
                Voir le profil de l&apos;élève
              </Link>
            ) : null}

            {/* Texte. Une fois enregistré, il s'affiche en lecture — tel que
                l'élève le voit — avec un bouton « Modifier ». Tant qu'il est
                vide, il n'y a rien à lire : le champ reste ouvert. */}
          {editingText || saved.trim().length === 0 ? (
            <div className="flex flex-col gap-2">
              {/* Titre libre, optionnel : donne un intitulé au compte rendu à la
                  place du « Cours de … avec … » automatique. */}
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`title-${lesson.bookingId}`}
                  className="text-xs font-medium uppercase tracking-wide text-subtle"
                >
                  Titre <span className="normal-case text-subtle">(optionnel)</span>
                </label>
                <Input
                  id={`title-${lesson.bookingId}`}
                  value={title}
                  disabled={savingContent}
                  maxLength={200}
                  placeholder={`Ex. ${lessonTitle(lesson.instrumentName, lesson.isTrial)} — les gammes`}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <RichTextEditor
                value={content}
                disabled={savingContent}
                // Un document TipTap « vide » vaut « <p></p> » : on le ramène à
                // une chaîne vide pour que « dirty » et « documenté » restent
                // justes, et que le serveur le stocke bien comme null.
                onChange={(html) => setContent(htmlIsBlank(html) ? "" : html)}
              />
              <div className="flex items-center gap-3">
                <Button size="sm" disabled={!dirty || savingContent} onClick={saveContent}>
                  {savingContent ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Enregistrer
                </Button>
                {saved.trim().length > 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={savingContent}
                    onClick={() => {
                      setContent(saved);
                      setTitle(savedTitle);
                      setEditingText(false);
                    }}
                  >
                    Annuler
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <RichTextContent html={saved} />
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingText(true)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Modifier
                </Button>
              </div>
            </div>
          )}

          {/* Pièces jointes, groupées par type */}
          {attachments.length > 0 ? (
            <div className="flex flex-col gap-4">
              {images.length > 0 ? (
                <AttachmentBlock
                  icon={ImageIcon}
                  label="Images"
                  count={images.length}
                >
                  <div className="flex flex-wrap gap-3">
                    {images.map((a) => (
                      <AttachmentTile
                        key={a.id}
                        attachment={a}
                        src={`${base}/attachments/${a.id}`}
                        onDelete={() => removeAttachment(a.id)}
                        disabled={busy}
                      />
                    ))}
                  </div>
                </AttachmentBlock>
              ) : null}

              {audios.length > 0 ? (
                <AttachmentBlock
                  icon={Mic}
                  label="Notes audio"
                  count={audios.length}
                >
                  <div className="flex flex-col gap-2">
                    {audios.map((a) => (
                      <AttachmentTile
                        key={a.id}
                        attachment={a}
                        src={`${base}/attachments/${a.id}`}
                        onDelete={() => removeAttachment(a.id)}
                        disabled={busy}
                      />
                    ))}
                  </div>
                </AttachmentBlock>
              ) : null}

              {scores.length > 0 ? (
                <AttachmentBlock
                  icon={FileText}
                  label="Partitions"
                  count={scores.length}
                >
                  <div className="flex flex-wrap gap-3">
                    {scores.map((a) => (
                      <AttachmentTile
                        key={a.id}
                        attachment={a}
                        src={`${base}/attachments/${a.id}`}
                        onDelete={() => removeAttachment(a.id)}
                        disabled={busy}
                      />
                    ))}
                  </div>
                </AttachmentBlock>
              ) : null}
            </div>
          ) : null}

          {/* Actions d'ajout */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || recording}
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip className="mr-2 h-4 w-4" />
              Image ou partition
            </Button>

            {recording ? (
              <Button type="button" variant="destructive" size="sm" onClick={stopRecording}>
                <Square className="mr-2 h-4 w-4" />
                Arrêter l&apos;enregistrement
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={startRecording}
              >
                <Mic className="mr-2 h-4 w-4" />
                Note audio
              </Button>
            )}

            {busy ? <Loader2 className="h-4 w-4 animate-spin text-muted" /> : null}
            {recording ? (
              <span className="flex items-center gap-1.5 text-sm text-danger">
                <span className="h-2 w-2 animate-pulse rounded-full bg-danger" />
                Enregistrement…
              </span>
            ) : null}

            <input
              ref={fileRef}
              type="file"
              accept={FILE_ACCEPT}
              className="hidden"
              onChange={onPickFile}
            />
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          {/* Échanges autour de ce cours, quand la fiche les fournit. */}
          {comments && me ? (
            <ReportComments
              bookingId={lesson.bookingId}
              comments={comments}
              me={me}
            />
          ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** HTML vide au sens du contenu : que des balises, aucun texte visible. */
function htmlIsBlank(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;|\s/g, "").length === 0;
}

/**
 * Bloc d'un type de pièce jointe : un intitulé discret (icône, libellé, nombre)
 * au-dessus de ses vignettes. C'est ce qui donne à l'éditeur la même lisibilité
 * groupée que la vue en lecture seule.
 */
function AttachmentBlock({
  icon: Icon,
  label,
  count,
  children,
}: {
  icon: typeof Mic;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-subtle">
        <Icon className="h-3.5 w-3.5" />
        {label}
        <span className="text-muted">{count}</span>
      </p>
      {children}
    </div>
  );
}

function AttachmentTile({
  attachment,
  src,
  onDelete,
  disabled,
}: {
  attachment: ReportAttachmentView;
  src: string;
  onDelete: () => void;
  disabled: boolean;
}) {
  return (
    <div className="relative flex flex-col gap-1">
      {attachment.kind === "IMAGE" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={attachment.filename}
          className="h-28 w-28 rounded-lg border border-border object-cover"
        />
      ) : attachment.kind === "AUDIO" ? (
        <div className="flex w-64 max-w-full items-center rounded-lg border border-border bg-elevated px-3 py-3">
          <AudioPlayer src={src} className="min-w-0 flex-1" />
        </div>
      ) : (
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="flex h-28 w-40 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-elevated px-2 text-center text-xs text-muted hover:text-foreground"
        >
          <FileText className="h-6 w-6 text-subtle" />
          <span className="line-clamp-2 break-all">{attachment.filename}</span>
        </a>
      )}
      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        aria-label="Supprimer la pièce jointe"
        className="absolute -right-2 -top-2 rounded-full border border-border bg-elevated p-1 text-muted shadow-sm hover:text-danger"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
