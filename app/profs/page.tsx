import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/editorial";
import { SearchFilters } from "@/components/search-filters";
import { SiteHeader } from "@/components/site-header";
import { TeacherResultList } from "@/components/teacher-result-list";
import { Button } from "@/components/ui/button";
import {
  buildQueryString,
  hasActiveFilters,
  isIndexableSearch,
  parseFilters,
  SEARCH_PAGE_SIZE,
  type RawParams,
} from "@/lib/search/query";
import {
  getSearchableInstruments,
  resolveInstrument,
  searchTeachers,
} from "@/lib/search/teachers";
import {
  citySlug,
  instrumentCityPath,
  instrumentPath,
} from "@/lib/seo/landing";

/**
 * Recherche de profs.
 *
 * Server Component : les résultats sont dans le HTML, donc explorables. Les
 * filtres ne sont qu'un îlot client qui réécrit l'URL — chaque combinaison est
 * ainsi une adresse partageable et indexable, ce dont vit une marketplace.
 *
 * Rendue à la demande, comme la fiche individuelle : les résultats dépendent
 * des abonnements en cours, qui expirent en continu.
 */

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}): Promise<Metadata> {
  const filters = parseFilters(await searchParams);

  const subject = filters.instrument ? `de ${filters.instrument}` : "de musique";
  const place = filters.city ? ` à ${filters.city}` : "";
  const title = `Cours ${subject}${place} — trouvez votre prof`;

  // Consolidation SEO : une recherche par instrument (« cours de guitare »)
  // vise exactement ce que couvrent les pages `/cours/*`, plus riches. Pour ne
  // pas se cannibaliser, le canonical d'une telle recherche pointe vers la page
  // de cours correspondante — l'instrument résolu en slug, la ville sluggée.
  // Une recherche par ville seule (sans page /cours équivalente) reste
  // canonique sur elle-même.
  const matched = filters.instrument
    ? await resolveInstrument(filters.instrument)
    : null;

  let canonical = `/profs${buildQueryString(filters)}`;
  if (matched && isIndexableSearch(filters)) {
    canonical = filters.city
      ? instrumentCityPath(matched.slug, citySlug(filters.city))
      : instrumentPath(matched.slug);
  }

  // Un terme d'instrument non reconnu ne ramène rien : on ne l'indexe pas.
  const indexable =
    isIndexableSearch(filters) && !(filters.instrument !== null && !matched);

  return {
    title,
    description: `Parcourez les profs ${subject}${place} sur SiNote et réservez votre premier cours.`,
    alternates: { canonical },
    // Instrument et ville sont indexés — ce sont les requêtes qui amènent des
    // élèves. Prix, modalité, essai et pagination ne le sont pas : ils
    // multiplient des pages quasi identiques.
    robots: indexable ? undefined : { index: false },
  };
}

function PageLink({
  href,
  enabled,
  children,
}: {
  href: string;
  enabled: boolean;
  children: React.ReactNode;
}) {
  if (!enabled) {
    return (
      <span className="cursor-not-allowed rounded-md border border-border px-3 py-1.5 text-sm text-subtle">
        {children}
      </span>
    );
  }

  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={href}>{children}</Link>
    </Button>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const filters = parseFilters(await searchParams);

  const [{ results, total, matchedInstrument }, instruments] = await Promise.all(
    [searchTeachers(filters), getSearchableInstruments()]
  );

  const lastPage = Math.max(1, Math.ceil(total / SEARCH_PAGE_SIZE));
  const filtered = hasActiveFilters(filters);
  // Terme d'instrument saisi mais introuvable au catalogue : `searchTeachers`
  // rend alors une liste vide plutôt que d'ignorer le filtre, et l'élève doit
  // savoir que c'est le mot qui n'a pas été compris — pas l'offre qui manque.
  const unknownInstrument = filters.instrument !== null && matchedInstrument === null;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
      <PageHeader
        title={`${
          matchedInstrument
            ? `Cours de ${matchedInstrument.name}`
            : "Trouvez votre prof"
        }${filters.city ? ` à ${filters.city}` : ""}`}
        titleClassName="uppercase"
        meta={
          <p className="text-sm text-muted">
            {total > 0
              ? `${total} prof${total > 1 ? "s" : ""} disponible${total > 1 ? "s" : ""}`
              : filtered
                ? "Aucun résultat"
                : "Personne pour l’instant"}
          </p>
        }
      />

      <div className="mt-8">
        <Suspense fallback={null}>
          <SearchFilters instruments={instruments} />
        </Suspense>
      </div>

      {results.length === 0 ? (
        <div className="mt-10 flex flex-col items-start gap-4 border-t border-border pt-12">
          {unknownInstrument ? (
            <>
              <p className="text-muted">
                {`Nous ne connaissons pas « ${filters.instrument} » comme instrument.`}
              </p>
              {instruments.length > 0 ? (
                <p className="text-sm text-subtle">
                  Choisissez-en un dans la liste ci-dessus.
                </p>
              ) : null}
            </>
          ) : filtered ? (
            <>
              <p className="text-muted">
                Essayez d&apos;élargir votre recherche : un autre instrument,
                une autre ville, ou les cours en visio.
              </p>
              <Button variant="outline" asChild>
                <Link href="/profs">Voir tous les profs</Link>
              </Button>
            </>
          ) : (
            // Plateforme vide : rien à élargir. Le seul geste utile est de
            // recruter, donc l'appel s'adresse aux profs.
            <>
              <p className="text-muted">
                Les premiers professeurs arrivent. Revenez bientôt — ou
                ouvrez votre propre fiche si vous enseignez.
              </p>
              <Button asChild>
                <Link href="/connexion">Je suis professeur</Link>
              </Button>
            </>
          )}
        </div>
      ) : (
        <TeacherResultList results={results} className="mt-10" />
      )}

      {lastPage > 1 ? (
        <nav className="mt-10 flex items-center justify-between border-t border-border pt-6">
          {/* Rendu conditionnel plutôt qu'un bouton désactivé : `disabled` sur
              un lien produit un <a> toujours cliquable. */}
          <PageLink
            href={`/profs${buildQueryString({ ...filters, page: filters.page - 1 })}`}
            enabled={filters.page > 1}
          >
            Précédent
          </PageLink>
          <span className="text-sm text-muted">
            Page {filters.page} sur {lastPage}
          </span>
          <PageLink
            href={`/profs${buildQueryString({ ...filters, page: filters.page + 1 })}`}
            enabled={filters.page < lastPage}
          >
            Suivant
          </PageLink>
        </nav>
      ) : null}
      </main>
    </>
  );
}
