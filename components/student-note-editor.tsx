"use client";

import { useState } from "react";
import { Loader2, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { notifySuccess } from "@/lib/toast";

/**
 * Note privée du prof sur un élève.
 *
 * Persistante, propre au couple prof↔élève, jamais vue de l'élève. S'enregistre
 * seule via la route dédiée. Le cadenas et la mention le rappellent.
 */
export function StudentNoteEditor({
  studentId,
  initialContent,
}: {
  studentId: string;
  initialContent: string;
}) {
  const [content, setContent] = useState(initialContent);
  const [saved, setSaved] = useState(initialContent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = content !== saved;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/teacher/students/${studentId}/note`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "L'enregistrement a échoué.");
        return;
      }
      setSaved(content);
      notifySuccess("Note enregistrée.");
    } catch {
      setError("Impossible de joindre le serveur.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-xs text-subtle">
        <Lock className="h-3 w-3" />
        Visible par vous seul — jamais par l&apos;élève.
      </p>
      {/* Cadre pointillé : une note à soi, pas un champ de formulaire. */}
      <Textarea
        rows={3}
        value={content}
        placeholder="Visible par vous seul. Ex. : « Payé en espèces, préfère les cours le jeudi. »"
        onChange={(e) => setContent(e.target.value)}
        className="border-dashed border-border-strong bg-transparent text-sm shadow-none"
      />
      <div className="flex items-center gap-3">
        <Button size="sm" disabled={!dirty || busy} onClick={save}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Enregistrer la note
        </Button>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
