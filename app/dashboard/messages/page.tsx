import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { MessageSquare, Paperclip } from "lucide-react";

import { PageHeader, Row, RowList } from "@/components/editorial";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { auth } from "@/lib/auth";
import { buildInbox, type InboxMessage, type Viewer } from "@/lib/messages/inbox";
import prisma from "@/lib/prisma";

/**
 * Boîte de réception agrégée.
 *
 * Un seul endroit pour tous les fils généraux (reportId nul) du couple : le prof
 * y voit ses élèves, l'élève ses profs, du plus récent au plus ancien, avec les
 * non-lus. Chaque ligne mène au fil existant (onglet Messages de la fiche ou du
 * dossier) — on n'a pas dupliqué l'écran de conversation, on l'indexe. Les
 * commentaires de comptes rendus restent sur leur compte rendu.
 */
export const metadata: Metadata = { title: "Messages" };

export default async function MessagesInboxPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      timezone: true,
      teacherProfile: { select: { id: true } },
      studentProfile: { select: { id: true } },
    },
  });

  const viewer: Viewer = user.teacherProfile ? "TEACHER" : "STUDENT";
  const where = user.teacherProfile
    ? { teacherId: user.teacherProfile.id, reportId: null }
    : { studentId: user.studentProfile!.id, reportId: null };

  const [rawMessages, reads] = await Promise.all([
    prisma.message.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        teacherId: true,
        studentId: true,
        sender: true,
        content: true,
        createdAt: true,
        attachments: { select: { id: true }, take: 1 },
        teacher: { select: { user: { select: { name: true, image: true } } } },
        student: { select: { user: { select: { name: true, image: true } } } },
      },
    }),
    prisma.messageThreadState.findMany({
      where: user.teacherProfile
        ? { teacherId: user.teacherProfile.id }
        : { studentId: user.studentProfile!.id },
      select: {
        teacherId: true,
        studentId: true,
        teacherReadAt: true,
        studentReadAt: true,
      },
    }),
  ]);

  const messages: InboxMessage[] = rawMessages.map((m) => ({
    teacherId: m.teacherId,
    studentId: m.studentId,
    sender: m.sender,
    content: m.content,
    hasAttachment: m.attachments.length > 0,
    createdAt: m.createdAt,
  }));

  // L'autre participant, par couple, pour l'affichage (nom + avatar).
  const other = new Map<string, { name: string | null; image: string | null }>();
  for (const m of rawMessages) {
    const k = `${m.teacherId}::${m.studentId}`;
    if (!other.has(k)) {
      const u = viewer === "TEACHER" ? m.student.user : m.teacher.user;
      other.set(k, { name: u.name, image: u.image });
    }
  }

  const conversations = buildInbox(messages, reads, viewer);

  const when = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: user.timezone,
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        size="page"
        eyebrow="Espace connecté"
        title="Messages"
        lead="Vos conversations, la plus récente en premier."
      />

      {conversations.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
          Aucune conversation pour l&apos;instant. Les échanges démarrent depuis
          {viewer === "TEACHER" ? " une fiche élève" : " un dossier de prof"}.
        </p>
      ) : (
        <RowList>
          {conversations.map((convo) => {
            const k = `${convo.teacherId}::${convo.studentId}`;
            const party = other.get(k);
            const name = party?.name ?? (viewer === "TEACHER" ? "Élève" : "Prof");
            const href =
              viewer === "TEACHER"
                ? `/dashboard/prof/eleves/${convo.studentId}?onglet=messages`
                : `/dashboard/dossiers/${convo.teacherId}?onglet=messages`;

            const preview =
              convo.last.hasAttachment && !convo.last.content.trim()
                ? "Pièce jointe"
                : convo.last.content;
            const mine = convo.last.sender === viewer;

            return (
              <Row
                key={k}
                href={href}
                main={
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 shrink-0 border border-border">
                      <AvatarImage src={party?.image || undefined} alt={name} />
                      <AvatarFallback>
                        {name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p
                        className={
                          convo.unread > 0
                            ? "font-semibold text-foreground"
                            : "font-medium text-foreground"
                        }
                      >
                        {name}
                      </p>
                      <p className="flex items-center gap-1 truncate text-sm text-muted">
                        {mine ? <span className="text-subtle">Vous : </span> : null}
                        {convo.last.hasAttachment && !convo.last.content.trim() ? (
                          <Paperclip className="h-3 w-3 shrink-0" />
                        ) : null}
                        <span className="truncate">{preview}</span>
                      </p>
                    </div>
                  </div>
                }
                meta={
                  <div className="flex flex-col items-end gap-1">
                    <span className="whitespace-nowrap text-xs text-subtle">
                      {when.format(convo.last.createdAt)}
                    </span>
                    {convo.unread > 0 ? (
                      <span className="rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                        {convo.unread}
                      </span>
                    ) : null}
                  </div>
                }
              />
            );
          })}
        </RowList>
      )}

      <p className="mt-6 flex items-center gap-1.5 text-xs text-subtle">
        <MessageSquare className="h-3.5 w-3.5" />
        Les commentaires laissés sous un compte rendu restent sur ce compte
        rendu.
      </p>
    </div>
  );
}
