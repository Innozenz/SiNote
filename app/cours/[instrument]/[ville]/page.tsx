import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { Eyebrow, PageHeader, SectionTitle } from "@/components/editorial";
import { FamilyIcon } from "@/components/family-icon";
import {
  LandingBreadcrumb,
  LandingFaqSection,
  LandingLinkCloud,
} from "@/components/landing-sections";
import { SiteHeader } from "@/components/site-header";
import { TeacherResultList } from "@/components/teacher-result-list";
import { Button } from "@/components/ui/button";
import prisma from "@/lib/prisma";
import { searchTeachers } from "@/lib/search/teachers";
import {
  getCityInstruments,
  getInstrumentCities,
  instrumentCityPath,
  instrumentPath,
  resolveCity,
} from "@/lib/seo/landing";
import {
  instrumentIntro,
  landingFaq,
  whyLearn,
  whyLearnTitle,
} from "@/lib/seo/landing-content";
import {
  breadcrumbSchema,
  faqSchema,
  itemListSchema,
  jsonLdHtml,
} from "@/lib/seo/structured-data";

/**
 * Page d'atterrissage SEO par instrument × ville (`/cours/[instrument]/[ville]`).
 *
 * Cible la requête géolocalisée (« cours de guitare à Lyon »), la plus
 * qualifiée. Même prudence que la page instrument : `noindex` quand la
 * combinaison est vide, pour ne pas peupler l'index de pages sans offre. Le
 * libellé de ville vient toujours de la base (résolution par slug), jamais d'une
 * reconstruction depuis l'URL — accents et casse seraient perdus.
 */

const loadLanding = cache(async (instrumentSlug: string, villeSlug: string) => {
  const [instrument, city] = await Promise.all([
    prisma.instrument.findUnique({
      where: { slug: instrumentSlug },
      select: { slug: true, name: true, family: true, aliases: true },
    }),
    resolveCity(villeSlug),
  ]);

  if (!instrument || !city) return null;

  const response = await searchTeachers({
    instrument: instrumentSlug,
    city: city.name,
    mode: null,
    maxRateCents: null,
    trialOnly: false,
    page: 1,
  });

  return { instrument, city, response };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ instrument: string; ville: string }>;
}): Promise<Metadata> {
  const { instrument: instrumentSlug, ville } = await params;
  const data = await loadLanding(instrumentSlug, ville);

  if (!data) {
    return { title: "Cours introuvable", robots: { index: false } };
  }

  const { instrument, city, response } = data;
  const title = `Cours de ${instrument.name} à ${city.name} — trouvez votre prof`;
  const description = `Cours de ${instrument.name} à ${city.name} : comparez les professeurs près de chez vous, consultez leurs disponibilités et réservez votre cours en ligne sur SiNote.`;

  return {
    title,
    description,
    alternates: { canonical: instrumentCityPath(instrumentSlug, city.slug) },
    robots: response.total > 0 ? undefined : { index: false },
    openGraph: { title, description, type: "website" },
  };
}

export default async function InstrumentCityCoursePage({
  params,
}: {
  params: Promise<{ instrument: string; ville: string }>;
}) {
  const { instrument: instrumentSlug, ville } = await params;
  const data = await loadLanding(instrumentSlug, ville);

  if (!data) notFound();

  const { instrument, city, response } = data;
  const { results, total } = response;

  const [otherCities, cityInstruments] = await Promise.all([
    getInstrumentCities(instrumentSlug),
    getCityInstruments(city.name),
  ]);

  const breadcrumb = [
    { name: "Accueil", path: "/" },
    { name: "Cours de musique", path: "/profs" },
    { name: `Cours de ${instrument.name}`, path: instrumentPath(instrumentSlug) },
    { name: city.name },
  ];

  const faq = landingFaq(instrument.name, city.name);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdHtml([
            breadcrumbSchema(
              breadcrumb.map((item) => ({
                name: item.name,
                path: item.path ?? instrumentCityPath(instrumentSlug, city.slug),
              }))
            ),
            faqSchema(faq),
            ...(results.length > 0
              ? [
                  itemListSchema(
                    results.map((teacher) => ({
                      name: teacher.name ?? "Professeur de musique",
                      path: `/profs/${teacher.slug}`,
                    }))
                  ),
                ]
              : []),
          ]),
        }}
      />

      <SiteHeader />
      <main className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-10 sm:py-14">
        <div className="flex flex-col gap-6">
          <LandingBreadcrumb items={breadcrumb} />

          <FamilyIcon family={instrument.family} className="h-14 w-14" />

          <PageHeader
            eyebrow={`Cours de musique à ${city.name}`}
            title={`Cours de ${instrument.name} à ${city.name}`}
            titleClassName="uppercase"
            meta={
              <p className="text-sm text-muted">
                {total > 0
                  ? `${total} prof${total > 1 ? "s" : ""} à ${city.name}`
                  : "Bientôt des profs"}
              </p>
            }
          />

          <p className="max-w-3xl text-lg text-muted">
            {instrumentIntro(instrument.name, instrument.family, city.name)}
          </p>

          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href={`/profs?instrument=${instrumentSlug}&ville=${encodeURIComponent(city.name)}`}>
                Voir tous les profs à {city.name}
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={instrumentPath(instrumentSlug)}>
                Cours de {instrument.name} partout
              </Link>
            </Button>
          </div>
        </div>

        {results.length > 0 ? (
          <section className="flex flex-col gap-5">
            <SectionTitle
              trailing={
                total > results.length ? (
                  <Link
                    href={`/profs?instrument=${instrumentSlug}&ville=${encodeURIComponent(city.name)}`}
                    className="text-sm text-muted hover:underline"
                  >
                    Voir les {total}
                  </Link>
                ) : undefined
              }
            >
              Professeurs de {instrument.name} à {city.name}
            </SectionTitle>
            <TeacherResultList results={results} />
          </section>
        ) : (
          <section className="flex flex-col items-start gap-4 border-y border-border py-10">
            <p className="text-muted">
              Aucun professeur de {instrument.name} à {city.name} pour le moment.
              Élargissez à toute la France, ou tentez la visio.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href={instrumentPath(instrumentSlug)}>
                  Cours de {instrument.name} partout
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/profs?instrument=${instrumentSlug}&mode=online`}>
                  Cours en visio
                </Link>
              </Button>
            </div>
          </section>
        )}

        <section className="flex max-w-3xl flex-col gap-4">
          <SectionTitle>{whyLearnTitle(instrument.name)}</SectionTitle>
          <p className="text-muted">{whyLearn(instrument.name, instrument.family)}</p>
        </section>

        {cityInstruments.length > 1 ? (
          <LandingLinkCloud
            title={`Autres cours à ${city.name}`}
            links={cityInstruments
              .filter((entry) => entry.slug !== instrumentSlug)
              .slice(0, 16)
              .map((entry) => ({
                label: `${entry.name} à ${city.name}`,
                href: instrumentCityPath(entry.slug, city.slug),
              }))}
          />
        ) : null}

        {otherCities.length > 1 ? (
          <LandingLinkCloud
            title={`Cours de ${instrument.name} dans d'autres villes`}
            links={otherCities
              .filter((entry) => entry.slug !== city.slug)
              .slice(0, 16)
              .map((entry) => ({
                label: `${instrument.name} à ${entry.name}`,
                href: instrumentCityPath(instrumentSlug, entry.slug),
                hint: `${entry.teacherCount}`,
              }))}
          />
        ) : null}

        <LandingFaqSection entries={faq} />

        <section className="flex flex-col items-start gap-4 border-t border-border pt-10">
          <Eyebrow>Vous enseignez à {city.name} ?</Eyebrow>
          <p className="max-w-2xl text-lg text-muted">
            Créez votre fiche, fixez vos tarifs et recevez des demandes de cours
            de {instrument.name} à {city.name}. Sans commission sur vos cours.
          </p>
          <Button asChild>
            <Link href="/enseigner">Devenir professeur</Link>
          </Button>
        </section>
      </main>
    </>
  );
}
