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
  getInstrumentCities,
  getLandingInstruments,
  instrumentCityPath,
  instrumentPath,
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
 * Page d'atterrissage SEO par instrument (`/cours/[instrument]`).
 *
 * Server Component rendu à la demande — la visibilité des profs dépend des
 * abonnements en cours, comme la fiche prof. Le contenu est unique par
 * instrument (amorce de famille, FAQ interpolée, liste de profs réelle) pour
 * éviter le contenu mince que trente-sept pages jumelles produiraient.
 *
 * Passe en `noindex` quand aucun prof visible n'enseigne l'instrument : une page
 * de cours sans offre n'a rien à proposer à un visiteur venu d'un moteur.
 */

const loadLanding = cache(async (slug: string) => {
  const instrument = await prisma.instrument.findUnique({
    where: { slug },
    select: { slug: true, name: true, family: true, aliases: true },
  });

  if (!instrument) return null;

  const [response, cities] = await Promise.all([
    searchTeachers({
      instrument: slug,
      city: null,
      mode: null,
      maxRateCents: null,
      trialOnly: false,
      page: 1,
    }),
    getInstrumentCities(slug),
  ]);

  return { instrument, response, cities };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ instrument: string }>;
}): Promise<Metadata> {
  const { instrument: slug } = await params;
  const data = await loadLanding(slug);

  if (!data) {
    return { title: "Cours introuvable", robots: { index: false } };
  }

  const { instrument, response } = data;
  const title = `Cours de ${instrument.name} — trouvez votre professeur`;
  const description = `Prenez des cours de ${instrument.name} avec un prof près de chez vous ou en ligne. Comparez les profs, consultez leurs disponibilités et réservez votre cours en ligne sur SiNote.`;

  return {
    title,
    description,
    alternates: { canonical: instrumentPath(slug) },
    // Pas de profs → rien à indexer, on évite une page vide dans l'index.
    robots: response.total > 0 ? undefined : { index: false },
    openGraph: { title, description, type: "website" },
  };
}

export default async function InstrumentCoursePage({
  params,
}: {
  params: Promise<{ instrument: string }>;
}) {
  const { instrument: slug } = await params;
  const data = await loadLanding(slug);

  if (!data) notFound();

  const { instrument, response, cities } = data;
  const { results, total } = response;

  const others = (await getLandingInstruments())
    .filter((entry) => entry.slug !== slug)
    .slice(0, 12);

  const breadcrumb = [
    { name: "Accueil", path: "/" },
    { name: "Cours de musique", path: "/profs" },
    { name: `Cours de ${instrument.name}` },
  ];

  const faq = landingFaq(instrument.name);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdHtml([
            breadcrumbSchema(
              breadcrumb.map((item) => ({
                name: item.name,
                path: item.path ?? instrumentPath(slug),
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
            eyebrow="Cours de musique"
            title={`Cours de ${instrument.name}`}
            titleClassName="uppercase"
            meta={
              <p className="text-sm text-muted">
                {total > 0
                  ? `${total} prof${total > 1 ? "s" : ""} de ${instrument.name}`
                  : "Bientôt des profs"}
              </p>
            }
          />

          <p className="max-w-3xl text-lg text-muted">
            {instrumentIntro(instrument.name, instrument.family)}
          </p>

          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href={`/profs?instrument=${slug}`}>
                Voir tous les profs de {instrument.name}
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/enseigner">Enseigner le {instrument.name}</Link>
            </Button>
          </div>
        </div>

        {results.length > 0 ? (
          <section className="flex flex-col gap-5">
            <SectionTitle
              trailing={
                total > results.length ? (
                  <Link
                    href={`/profs?instrument=${slug}`}
                    className="text-sm text-muted hover:underline"
                  >
                    Voir les {total}
                  </Link>
                ) : undefined
              }
            >
              Professeurs de {instrument.name}
            </SectionTitle>
            <TeacherResultList results={results} />
          </section>
        ) : (
          <section className="flex flex-col items-start gap-4 border-y border-border py-10">
            <p className="text-muted">
              Aucun professeur de {instrument.name} n&apos;est encore inscrit.
              Revenez bientôt — ou ouvrez votre fiche si vous enseignez.
            </p>
            <Button asChild>
              <Link href="/enseigner">Devenir prof sur SiNote</Link>
            </Button>
          </section>
        )}

        <section className="flex max-w-3xl flex-col gap-4">
          <SectionTitle>{whyLearnTitle(instrument.name)}</SectionTitle>
          <p className="text-muted">{whyLearn(instrument.name, instrument.family)}</p>
        </section>

        {cities.length > 0 ? (
          <LandingLinkCloud
            title={`Cours de ${instrument.name} par ville`}
            links={cities.map((city) => ({
              label: `${instrument.name} à ${city.name}`,
              href: instrumentCityPath(slug, city.slug),
              hint: `${city.teacherCount}`,
            }))}
          />
        ) : null}

        <LandingFaqSection entries={faq} />

        {others.length > 0 ? (
          <LandingLinkCloud
            title="Explorer d'autres cours"
            links={others.map((entry) => ({
              label: entry.name,
              href: instrumentPath(entry.slug),
            }))}
          />
        ) : null}

        <section className="flex flex-col items-start gap-4 border-t border-border pt-10">
          <Eyebrow>Vous enseignez ?</Eyebrow>
          <p className="max-w-2xl text-lg text-muted">
            Créez votre fiche, fixez vos tarifs et recevez des demandes de cours
            de {instrument.name}. Sans commission sur vos cours.
          </p>
          <Button asChild>
            <Link href="/enseigner">Devenir professeur</Link>
          </Button>
        </section>
      </main>
    </>
  );
}
