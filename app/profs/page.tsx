import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { X } from "lucide-react";

import { PageHeader } from "@/components/editorial";
import { SearchFilters } from "@/components/search-filters";
import { SiteFooter } from "@/components/site-footer";
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
  type SearchFilters as Filters,
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

/** Fenêtre des prochains créneaux affichés sur chaque résultat. */
const SLOT_WINDOW_DAYS = 14;

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

/**
 * Puce d'un filtre actif : le libellé, et une croix qui **retire ce filtre-là**.
 *
 * C'est un lien, pas un bouton : il reste donc dans la logique « un filtre = une
 * adresse » du reste de la page, il fonctionne sans JavaScript, et il s'ouvre
 * dans un nouvel onglet si l'élève le souhaite.
 */
function FilterChip({ label, href }: { label: string; href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-primary bg-primary-soft px-3 text-sm text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
    >
      {label}
      <X aria-hidden className="h-3.5 w-3.5" />
      <span className="sr-only">Retirer ce filtre</span>
    </Link>
  );
}

/** Les filtres actifs, chacun avec l'adresse qui l'enlève. */
function activeChips(
  filters: Filters,
  matchedInstrument: { slug: string; name: string } | null
) {
  const without = (changes: Partial<Filters>) =>
    `/profs${buildQueryString({ ...filters, ...changes, page: 1 })}`;

  return [
    filters.instrument
      ? {
          label: matchedInstrument?.name ?? filters.instrument,
          href: without({ instrument: null }),
        }
      : null,
    filters.city
      ? { label: filters.city, href: without({ city: null }) }
      : null,
    filters.mode
      ? {
          label: filters.mode === "online" ? "En visio" : "En présentiel",
          href: without({ mode: null }),
        }
      : null,
    filters.maxRateCents
      ? {
          label: `Jusqu’à ${Math.round(filters.maxRateCents / 100)} €`,
          href: without({ maxRateCents: null }),
        }
      : null,
    filters.trialOnly
      ? { label: "Cours d’essai", href: without({ trialOnly: false }) }
      : null,
  ].filter(Boolean) as { label: string; href: string }[];
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const filters = parseFilters(await searchParams);

  const [{ results, total, matchedInstrument }, instruments] = await Promise.all(
    [
      searchTeachers(filters, {
        withNextSlots: true,
        slotDays: SLOT_WINDOW_DAYS,
      }),
      getSearchableInstruments(),
    ]
  );

  const lastPage = Math.max(1, Math.ceil(total / SEARCH_PAGE_SIZE));
  const filtered = hasActiveFilters(filters);
  // Terme d'instrument saisi mais introuvable au catalogue : `searchTeachers`
  // rend alors une liste vide plutôt que d'ignorer le filtre, et l'élève doit
  // savoir que c'est le mot qui n'a pas été compris — pas l'offre qui manque.
  const unknownInstrument = filters.instrument !== null && matchedInstrument === null;

  const chips = activeChips(filters, matchedInstrument);

  /**
   * « Élargir » : les instruments voisins **de la même famille**, et seulement
   * ceux qu'un prof visible enseigne vraiment.
   *
   * Une famille est la seule proximité que le modèle connaisse — les
   * instruments sont plats (chercher « guitare » ne ramène pas la guitare
   * électrique), et proposer un voisin de famille est ce qui s'en rapproche le
   * plus sans inventer une parenté qui n'existe pas en base.
   */
  const matchedFamily = matchedInstrument
    ? instruments.find((item) => item.slug === matchedInstrument.slug)?.family
    : undefined;
  const neighbours = matchedFamily
    ? instruments
        .filter(
          (item) =>
            item.family === matchedFamily && item.slug !== matchedInstrument!.slug
        )
        .slice(0, 6)
    : [];

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
        <PageHeader
          eyebrow="Recherche"
          title={`${
            matchedInstrument
              ? `Cours de ${matchedInstrument.name}`
              : "Trouvez votre prof"
          }${filters.city ? ` à ${filters.city}` : ""}`}
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

        {chips.length > 0 ? (
          <div className="mt-6 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <FilterChip key={chip.label} label={chip.label} href={chip.href} />
            ))}
            <Link
              href="/profs"
              className="inline-flex min-h-9 items-center px-2 text-sm text-muted underline-offset-4 hover:text-foreground hover:underline"
            >
              Tout effacer
            </Link>
          </div>
        ) : null}

        <div className="mt-8 grid gap-8 lg:grid-cols-[264px_1fr] lg:items-start">
          <aside className="lg:sticky lg:top-6">
            <Suspense fallback={null}>
              <SearchFilters instruments={instruments} />
            </Suspense>
          </aside>

          <div className="min-w-0">
            {results.length === 0 ? (
              <div className="flex flex-col items-start gap-4 border-t border-border pt-10">
                {unknownInstrument ? (
                  <>
                    <p className="text-muted">
                      {`Nous ne connaissons pas « ${filters.instrument} » comme instrument.`}
                    </p>
                    {instruments.length > 0 ? (
                      <p className="text-sm text-subtle">
                        Choisissez-en un dans la liste des filtres.
                      </p>
                    ) : null}
                  </>
                ) : filtered ? (
                  <>
                    <p className="text-muted">
                      Essayez d&apos;élargir votre recherche : un autre
                      instrument, une autre ville, ou les cours en visio.
                    </p>
                    <Button variant="outline" asChild>
                      <Link href="/profs">Voir tous les profs</Link>
                    </Button>
                  </>
                ) : (
                  // Plateforme vide : rien à élargir. Le seul geste utile est
                  // de recruter, donc l'appel s'adresse aux profs.
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
              <>
                {/* Le tri est annoncé même s'il n'y en a qu'un : sans cette
                    ligne, l'ordre d'une liste de vingt profs passe pour
                    arbitraire. Il n'est pas réglable — la pertinence est une
                    moyenne bayésienne, pas une préférence. */}
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border pb-3">
                  <p className="text-sm text-muted">
                    {`${total} prof${total > 1 ? "s" : ""}`}
                  </p>
                  <p className="text-sm text-subtle">Triés par pertinence</p>
                </div>

                <TeacherResultList
                  results={results}
                  slotWindowDays={SLOT_WINDOW_DAYS}
                  className="border-t-0"
                />
              </>
            )}

            {neighbours.length > 0 ? (
              <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-sm text-subtle">Élargir :</span>
                {neighbours.map((instrument) => (
                  <Link
                    key={instrument.slug}
                    href={`/profs?instrument=${instrument.slug}`}
                    className="inline-flex min-h-9 items-center rounded-full border border-border px-3 text-sm text-muted transition-colors hover:border-primary hover:text-primary"
                  >
                    {instrument.name}
                  </Link>
                ))}
              </div>
            ) : null}

            {lastPage > 1 ? (
              <nav className="mt-10 flex items-center justify-between border-t border-border pt-6">
                {/* Rendu conditionnel plutôt qu'un bouton désactivé :
                    `disabled` sur un lien produit un <a> toujours cliquable. */}
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
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
