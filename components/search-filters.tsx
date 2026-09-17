"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { FAMILY_STYLES } from "@/lib/instruments/family";
import type { SearchableInstrument } from "@/lib/search/teachers";
import { cn } from "@/lib/utils";

/**
 * Bornes du curseur de tarif, en euros par heure.
 *
 * `MAX` vaut « sans limite » et non « 120 € » : un curseur qui plafonne sans le
 * dire exclurait silencieusement les profs les plus chers, et l'élève n'aurait
 * aucun moyen de s'en apercevoir.
 */
const RATE_MIN = 10;
const RATE_MAX = 120;
const RATE_STEP = 5;

const MODES = [
  { value: null, label: "Tous" },
  { value: "online", label: "En visio" },
  { value: "in_person", label: "En présentiel" },
] as const;

/**
 * Filtres de recherche.
 *
 * Îlot client au sein d'une page serveur : **il ne détient aucun résultat**, il
 * ne fait que réécrire l'URL. C'est la page serveur qui interroge la base, ce
 * qui garde chaque recherche partageable, indexable, et fonctionnelle au retour
 * arrière du navigateur. Déplacer l'état des filtres dans React tuerait
 * silencieusement la raison d'être SEO de toute la page.
 *
 * En colonne à partir de `lg` ; en dessous, tout se replie derrière un bouton
 * « Filtres » — sur un téléphone, une colonne de filtres dépliée repousse les
 * résultats sous le pli, et c'est pour eux qu'on est venu.
 */
export function SearchFilters({
  instruments,
}: {
  instruments: SearchableInstrument[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  const paramCity = params.get("ville") ?? "";
  const paramRate = Number(params.get("prix"));

  const [city, setCity] = useState(paramCity);
  const [rate, setRate] = useState(
    Number.isFinite(paramRate) && paramRate > 0 ? paramRate : RATE_MAX
  );
  const [open, setOpen] = useState(false);

  // Les champs à état local doivent suivre l'URL : « Tout effacer », un retour
  // arrière ou une puce de filtre retirée changent les paramètres sans
  // remonter le composant, et un champ resté rempli mentirait sur la recherche
  // réellement en cours.
  useEffect(() => {
    setCity(paramCity);
  }, [paramCity]);

  useEffect(() => {
    setRate(Number.isFinite(paramRate) && paramRate > 0 ? paramRate : RATE_MAX);
  }, [paramRate]);

  const current = {
    instrument: params.get("instrument"),
    mode: params.get("mode"),
    essai: params.get("essai") === "1",
  };

  const navigate = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());

    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }

    // Tout changement de filtre ramène en page 1 : rester en page 4 d'un
    // résultat qui n'a plus que deux pages afficherait une liste vide.
    next.delete("page");

    const query = next.toString();
    router.push(query ? `/profs?${query}` : "/profs");
  };

  const activeCount = [...params.keys()].filter((key) => key !== "page").length;

  return (
    <div className="flex flex-col gap-4">
      {/* Repli sous `lg`. Le compte d'actifs est sur le bouton : replié, rien
          d'autre ne dit qu'une recherche est filtrée. */}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border bg-elevated px-4 text-sm font-medium text-foreground lg:hidden"
      >
        <span className="inline-flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-subtle" />
          Filtres
          {activeCount > 0 ? (
            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary">
              {activeCount}
            </span>
          ) : null}
        </span>
        <span className="text-subtle">{open ? "Masquer" : "Afficher"}</span>
      </button>

      <div className={cn("flex-col gap-8", open ? "flex" : "hidden lg:flex")}>
        {/* Instrument. Liste verticale plutôt qu'un nuage de pastilles : le
            compte de profs n'est lisible qu'aligné, et c'est lui qui dit à
            l'élève où l'offre se trouve. */}
        {instruments.length > 0 ? (
          <FilterGroup title="Instrument">
            <ul className="-mx-2 flex flex-col">
              <li>
                <FilterRow
                  active={current.instrument === null}
                  onClick={() => navigate({ instrument: null })}
                >
                  <span className="truncate">Tous les instruments</span>
                </FilterRow>
              </li>
              {instruments.map((instrument) => {
                const active = current.instrument === instrument.slug;

                return (
                  <li key={instrument.slug}>
                    <FilterRow
                      active={active}
                      onClick={() =>
                        navigate({ instrument: active ? null : instrument.slug })
                      }
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          FAMILY_STYLES[instrument.family].dot
                        )}
                      />
                      <span className="truncate">{instrument.name}</span>
                      <span className="ml-auto shrink-0 text-xs text-subtle">
                        {instrument.teacherCount}
                      </span>
                    </FilterRow>
                  </li>
                );
              })}
            </ul>
          </FilterGroup>
        ) : null}

        <FilterGroup title="Où">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              navigate({ ville: city });
            }}
            className="flex gap-2"
          >
            <label htmlFor="ville" className="sr-only">
              Ville
            </label>
            <Input
              id="ville"
              value={city}
              placeholder="Lyon, Paris…"
              onChange={(event) => setCity(event.target.value)}
            />
            <button
              type="submit"
              aria-label="Appliquer la ville"
              className="inline-flex min-h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-elevated text-muted transition-colors hover:border-primary hover:text-primary"
            >
              <Search className="h-4 w-4" />
            </button>
          </form>

          {/* Trois états exclusifs, parce que la recherche n'en connaît pas
              d'autres : `mode` vaut `online`, `in_person`, ou rien. Un
              interrupteur « inclure la visio » promettrait un quatrième
              comportement qui n'existe pas côté serveur. */}
          <div
            role="group"
            aria-label="Modalité"
            className="flex overflow-hidden rounded-[var(--radius-sm)] border border-border"
          >
            {MODES.map((mode) => {
              const active = (current.mode ?? null) === mode.value;

              return (
                <button
                  key={mode.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => navigate({ mode: mode.value })}
                  className={cn(
                    "min-h-11 flex-1 px-2 text-xs font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-elevated text-muted hover:text-foreground"
                  )}
                >
                  {mode.label}
                </button>
              );
            })}
          </div>
        </FilterGroup>

        <FilterGroup title="Tarif horaire">
          <label htmlFor="prix" className="flex items-baseline justify-between">
            <span className="text-sm text-muted">Jusqu’à</span>
            <span className="font-display text-lg font-semibold text-primary">
              {rate >= RATE_MAX ? "Sans limite" : `${rate} €`}
            </span>
          </label>
          <input
            id="prix"
            type="range"
            min={RATE_MIN}
            max={RATE_MAX}
            step={RATE_STEP}
            value={rate}
            onChange={(event) => setRate(Number(event.target.value))}
            // Le glissement met à jour l'étiquette en continu mais ne navigue
            // qu'au relâchement : une navigation par pixel parcouru
            // rechargerait les résultats des dizaines de fois par geste.
            onPointerUp={() => commitRate(rate, navigate)}
            onKeyUp={() => commitRate(rate, navigate)}
            className="h-11 w-full accent-primary"
          />
        </FilterGroup>

        <FilterGroup title="Options">
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-foreground">
            <input
              type="checkbox"
              checked={current.essai}
              onChange={() => navigate({ essai: current.essai ? null : "1" })}
              className="h-4 w-4 accent-primary"
            />
            Propose un cours d’essai
          </label>
        </FilterGroup>

        {activeCount > 0 ? (
          <button
            type="button"
            onClick={() => {
              setCity("");
              setRate(RATE_MAX);
              router.push("/profs");
            }}
            className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm text-muted hover:text-foreground hover:underline"
          >
            <X className="h-3.5 w-3.5" />
            Tout effacer
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** `RATE_MAX` veut dire « aucune borne » : on retire le paramètre. */
function commitRate(
  rate: number,
  navigate: (changes: Record<string, string | null>) => void
) {
  navigate({ prix: rate >= RATE_MAX ? null : String(rate) });
}

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-4">
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-subtle">
        {title}
      </h2>
      {children}
    </section>
  );
}

function FilterRow({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex min-h-11 w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2 text-left text-sm transition-colors",
        active
          ? "bg-surface font-medium text-foreground"
          : "text-muted hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
