"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";

/**
 * Barre de recherche de la page d'accueil.
 *
 * Îlot client au sein d'une page serveur : elle ne détient aucun résultat, elle
 * ne fait que composer l'URL de `/profs` et y naviguer — exactement les mêmes
 * paramètres que les filtres de recherche (`instrument`, `ville`), donc aucune
 * logique dupliquée. Le catalogue d'instruments vient du serveur (uniquement
 * ceux réellement enseignés).
 */
export function HeroSearch({
  instruments,
}: {
  instruments: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const [instrument, setInstrument] = useState("");
  const [ville, setVille] = useState("");

  // Ordre alphabétique pour la liste déroulante, plus facile à parcourir que
  // l'ordre « le plus enseigné d'abord » de la requête.
  const options = useMemo(
    () => [...instruments].sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [instruments]
  );

  const submit = () => {
    const params = new URLSearchParams();
    if (instrument) params.set("instrument", instrument);
    const city = ville.trim();
    if (city) params.set("ville", city);
    const qs = params.toString();
    router.push(qs ? `/profs?${qs}` : "/profs");
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex w-full max-w-xl flex-col overflow-hidden rounded-lg border border-border-strong bg-elevated shadow-sm sm:flex-row sm:items-stretch"
    >
      <label className="flex flex-1 flex-col justify-center gap-0.5 border-b border-border px-4 py-2.5 sm:border-b-0 sm:border-r">
        <span className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-subtle">
          Instrument
        </span>
        <div className="relative">
          <select
            value={instrument}
            onChange={(event) => setInstrument(event.target.value)}
            className="w-full appearance-none truncate bg-transparent pr-6 text-sm font-medium text-foreground focus:outline-none"
          >
            <option value="">Tous les instruments</option>
            {options.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
          />
        </div>
      </label>

      <label className="flex flex-[1.2] flex-col justify-center gap-0.5 px-4 py-2.5">
        <span className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-subtle">
          Ville
        </span>
        <input
          type="text"
          value={ville}
          onChange={(event) => setVille(event.target.value)}
          placeholder="Lyon, Paris… ou en visio"
          className="w-full bg-transparent text-sm font-medium text-foreground placeholder:font-normal placeholder:text-subtle focus:outline-none"
        />
      </label>

      <button
        type="submit"
        className="flex items-center justify-center gap-2 bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
      >
        <Search className="h-4 w-4" />
        Rechercher
      </button>
    </form>
  );
}
