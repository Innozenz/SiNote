"use client";

import { useState } from "react";
import { Copy, Loader2, Plus, Trash2 } from "lucide-react";

import { SectionTitle } from "@/components/editorial";
import { FormFailure } from "@/components/form-failure";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { localFailure, postJson, type Failure } from "@/lib/http/failure";
import { notifySuccess } from "@/lib/toast";
import {
  formatTime,
  parseTime,
  WEEKDAY_LABELS,
  type GridSlot,
} from "@/lib/teacher/weekly-grid";

type ExceptionRow = {
  id: string;
  date: string;
  type: "BLOCKED" | "EXTRA";
  startMinute: number | null;
  endMinute: number | null;
  reason: string | null;
};

/** Ligne en cours d'édition : on garde le texte saisi, pas des minutes. */
type DraftRow = { weekday: number; start: string; end: string };

export function AvailabilityEditor({
  timezone,
  initialSlots,
  initialExceptions,
}: {
  timezone: string;
  initialSlots: GridSlot[];
  initialExceptions: ExceptionRow[];
}) {
  const [rows, setRows] = useState<DraftRow[]>(
    initialSlots.map((slot) => ({
      weekday: slot.weekday,
      start: formatTime(slot.startMinute),
      end: formatTime(slot.endMinute),
    }))
  );
  const [exceptions, setExceptions] = useState(initialExceptions);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<Failure | null>(null);

  const addRow = (weekday: number) =>
    setRows((current) => [...current, { weekday, start: "09:00", end: "12:00" }]);

  const updateRow = (index: number, patch: Partial<DraftRow>) =>
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );

  const removeRow = (index: number) =>
    setRows((current) => current.filter((_, i) => i !== index));

  // Jour dont le sélecteur « Copier sur… » est ouvert, et jours cochés.
  const [copyFrom, setCopyFrom] = useState<number | null>(null);
  const [copyTargets, setCopyTargets] = useState<number[]>([]);

  // Recopie les plages d'un jour sur d'autres, en remplaçant les leurs : la
  // même semaine type se tapait cinq fois, plage par plage.
  const applyCopy = () => {
    if (copyFrom === null || copyTargets.length === 0) return;
    setRows((current) => {
      const source = current.filter((row) => row.weekday === copyFrom);
      const kept = current.filter((row) => !copyTargets.includes(row.weekday));
      const copies = copyTargets.flatMap((weekday) =>
        source.map((row) => ({ ...row, weekday }))
      );
      return [...kept, ...copies];
    });
    setCopyFrom(null);
    setCopyTargets([]);
  };

  const save = async () => {
    setIsSaving(true);
    setError(null);

    const slots: GridSlot[] = [];

    for (const [index, row] of rows.entries()) {
      const startMinute = parseTime(row.start);
      const endMinute = parseTime(row.end);

      if (startMinute === null || endMinute === null) {
        setError(
          localFailure(
            `Ligne ${index + 1} : horaire illisible, attendu au format 09:00.`
          )
        );
        setIsSaving(false);
        return;
      }

      if (startMinute >= endMinute) {
        setError(
          localFailure(`Ligne ${index + 1} : la fin doit suivre le début.`)
        );
        setIsSaving(false);
        return;
      }

      slots.push({ weekday: row.weekday, startMinute, endMinute });
    }

    try {
      const result = await postJson<{ slots: GridSlot[] }>(
        "/api/teacher/availability",
        { method: "PUT", body: JSON.stringify({ slots }) }
      );

      if (!result.ok) {
        setError(result.failure);
        return;
      }

      // Le serveur fusionne les plages qui se recouvrent : on réaffiche ce
      // qu'il a réellement retenu, pas ce qui a été tapé.
      setRows(
        result.data.slots.map((slot) => ({
          weekday: slot.weekday,
          start: formatTime(slot.startMinute),
          end: formatTime(slot.endMinute),
        }))
      );
      notifySuccess("Disponibilités enregistrées.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-5">
        <div>
          <SectionTitle>Semaine type</SectionTitle>
          <p className="mt-2 text-sm text-muted">
            Vos horaires habituels, exprimés dans votre fuseau ({timezone}).
            Ils se répètent chaque semaine et restent justes au changement
            d&apos;heure.
          </p>
        </div>
        <div className="flex flex-col gap-4">
          {/* Une grille vide n'est pas un état neutre : elle ne propose aucun
              créneau, donc la fiche est publiable mais jamais réservable. Sept
              lignes « Indisponible » ne le disaient pas. */}
          {rows.length === 0 ? (
            <p className="rounded-md bg-warning-soft px-3 py-2 text-sm">
              Aucune plage définie : aucun créneau n&apos;est proposé aux élèves,
              même une fois votre fiche publiée. Ajoutez au moins une plage.
            </p>
          ) : null}

          {[1, 2, 3, 4, 5, 6, 7].map((weekday) => {
            const dayRows = rows
              .map((row, index) => ({ row, index }))
              .filter(({ row }) => row.weekday === weekday);

            return (
              <div
                key={weekday}
                className="flex flex-col gap-2 border-b border-border pb-3 last:border-0 sm:flex-row sm:items-start"
              >
                <div className="w-28 pt-2 text-sm font-medium">
                  {WEEKDAY_LABELS[weekday]}
                </div>

                <div className="flex flex-1 flex-col gap-2">
                  {dayRows.length === 0 ? (
                    <p className="py-2 text-sm text-subtle">Indisponible</p>
                  ) : (
                    dayRows.map(({ row, index }) => (
                      <div key={index} className="flex items-center gap-2">
                        {/* `type="time"` comme le formulaire d'absences : le
                            texte libre attendait « 09:00 » et ne le disait
                            qu'à l'enregistrement. */}
                        <Input
                          type="time"
                          step={300}
                          aria-label={`Début, ${WEEKDAY_LABELS[weekday]}`}
                          className="w-32"
                          value={row.start}
                          onChange={(e) =>
                            updateRow(index, { start: e.target.value })
                          }
                        />
                        <span className="text-subtle">→</span>
                        <Input
                          type="time"
                          step={300}
                          aria-label={`Fin, ${WEEKDAY_LABELS[weekday]}`}
                          className="w-32"
                          value={row.end}
                          onChange={(e) =>
                            updateRow(index, { end: e.target.value })
                          }
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Supprimer cette plage"
                          onClick={() => removeRow(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}

                  <div className="flex flex-wrap items-center gap-4">
                    <button
                      type="button"
                      onClick={() => addRow(weekday)}
                      className="flex w-fit items-center gap-1 text-sm text-primary hover:underline"
                    >
                      <Plus className="h-3 w-3" />
                      Ajouter une plage
                    </button>
                    {dayRows.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setCopyFrom(copyFrom === weekday ? null : weekday);
                          setCopyTargets([]);
                        }}
                        aria-expanded={copyFrom === weekday}
                        className="flex w-fit items-center gap-1 text-sm text-muted hover:text-foreground hover:underline"
                      >
                        <Copy className="h-3 w-3" />
                        Copier sur…
                      </button>
                    ) : null}
                  </div>

                  {copyFrom === weekday ? (
                    <div className="flex flex-wrap items-center gap-3 rounded-md bg-surface px-3 py-2 text-sm">
                      {[1, 2, 3, 4, 5, 6, 7]
                        .filter((other) => other !== weekday)
                        .map((other) => (
                          <label
                            key={other}
                            className="flex cursor-pointer items-center gap-1.5"
                          >
                            <input
                              type="checkbox"
                              className="accent-primary h-4 w-4"
                              checked={copyTargets.includes(other)}
                              onChange={(e) =>
                                setCopyTargets((current) =>
                                  e.target.checked
                                    ? [...current, other]
                                    : current.filter((d) => d !== other)
                                )
                              }
                            />
                            {WEEKDAY_LABELS[other]}
                          </label>
                        ))}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={copyTargets.length === 0}
                        onClick={applyCopy}
                      >
                        Appliquer
                      </Button>
                      <span className="text-xs text-subtle">
                        Remplace les plages des jours cochés.
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          <FormFailure failure={error} onRetry={save} />

          <div className="flex justify-end">
            <Button disabled={isSaving} onClick={save}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Enregistrer la semaine
            </Button>
          </div>
        </div>
      </section>

      <ExceptionsCard exceptions={exceptions} onChange={setExceptions} />
    </div>
  );
}

function ExceptionsCard({
  exceptions,
  onChange,
}: {
  exceptions: ExceptionRow[];
  onChange: (rows: ExceptionRow[]) => void;
}) {
  const [date, setDate] = useState("");
  // Bloquer une plage horaire plutôt que la journée entière : sans bornes, le
  // moteur retire tout le jour ; avec bornes, seulement ce créneau.
  const [partial, setPartial] = useState(false);
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("11:00");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<Failure | null>(null);

  const addBlock = async () => {
    if (!date) return;

    setError(null);

    let startMinute: number | undefined;
    let endMinute: number | undefined;

    if (partial) {
      const s = parseTime(start);
      const e = parseTime(end);

      if (s === null || e === null) {
        setError(localFailure("Horaire illisible, attendu au format 10:00."));
        return;
      }
      if (s >= e) {
        setError(localFailure("L'heure de fin doit suivre l'heure de début."));
        return;
      }

      startMinute = s;
      endMinute = e;
    }

    setIsSaving(true);

    try {
      const result = await postJson<ExceptionRow>(
        "/api/teacher/availability/exceptions",
        {
          method: "POST",
          body: JSON.stringify(
            partial
              ? { date, type: "BLOCKED", startMinute, endMinute }
              : { date, type: "BLOCKED" }
          ),
        }
      );

      if (!result.ok) {
        setError(result.failure);
        return;
      }

      onChange([...exceptions, { ...result.data, date }]);
      setDate("");
      notifySuccess(partial ? "Plage bloquée." : "Journée bloquée.");
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (id: string) => {
    setError(null);

    const result = await postJson(
      `/api/teacher/availability/exceptions?id=${id}`,
      { method: "DELETE" }
    );

    // L'échec était silencieux : on cliquait sur la corbeille, la ligne
    // restait, et rien n'expliquait pourquoi. Une suppression qui ne dit pas
    // qu'elle a échoué laisse croire à un congé posé qui ne l'est pas.
    if (!result.ok) {
      setError(result.failure);
      return;
    }

    onChange(exceptions.filter((e) => e.id !== id));
    notifySuccess("Absence retirée.");
  };

  return (
    <section className="flex flex-col gap-5">
      <div>
        <SectionTitle>Congés et indisponibilités</SectionTitle>
        <p className="mt-2 text-sm text-muted">
          Retirez une journée entière, ou seulement une plage horaire, de votre
          semaine type. Les cours déjà réservés ne sont pas annulés pour autant.
        </p>
      </div>
      <div className="flex flex-col gap-4">
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            className="accent-primary h-4 w-4"
            checked={partial}
            onChange={(e) => setPartial(e.target.checked)}
          />
          Sur une plage horaire seulement (sinon, la journée entière)
        </label>

        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="exception-date">Date</Label>
            <Input
              id="exception-date"
              type="date"
              className="w-48"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {partial ? (
            <>
              <div className="space-y-1">
                <Label htmlFor="exception-start">De</Label>
                <Input
                  id="exception-start"
                  type="time"
                  className="w-32"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="exception-end">À</Label>
                <Input
                  id="exception-end"
                  type="time"
                  className="w-32"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
            </>
          ) : null}

          <Button variant="outline" disabled={!date || isSaving} onClick={addBlock}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Bloquer
          </Button>
        </div>

        <FormFailure failure={error} />

        {exceptions.length === 0 ? (
          <p className="text-sm text-subtle">Aucune absence enregistrée.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {exceptions.map((exception) => (
              <li
                key={exception.id}
                className="flex items-center justify-between rounded-md bg-surface px-3 py-2 text-sm"
              >
                <span>
                  {new Date(`${exception.date.slice(0, 10)}T00:00:00Z`).toLocaleDateString(
 "fr-FR",
                    { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }
                  )}
                  {exception.startMinute === null
                    ? " — journée entière"
                    : ` — ${formatTime(exception.startMinute)}–${formatTime(
                        exception.endMinute ?? exception.startMinute
                      )}`}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Retirer cette absence"
                  onClick={() => remove(exception.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
