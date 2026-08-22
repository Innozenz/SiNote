import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BadgeCheck,
  ChevronLeft,
  Globe,
  Home,
  MapPin,
  Music,
  Sparkles,
} from "lucide-react";

import { BookingWidget } from "@/components/booking-widget";
import { Eyebrow, PageTitle, SectionTitle } from "@/components/editorial";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SiteHeader } from "@/components/site-header";
import { TeacherReviews } from "@/components/teacher-reviews";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { RatingBadge } from "@/components/ui/stars";
import {
  getPublicReviews,
  getRatingCounts,
} from "@/lib/reviews/queries";
import { summarizeFromCounts } from "@/lib/reviews/summary";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getPublicTeacher } from "@/lib/teacher/public-profile";
import { ageOn } from "@/lib/user/age";

/**
 * Fiche prof publique.
 *
 * Server Component : c'est la page qui porte l'enjeu de référencement, elle
 * doit donc être rendue côté serveur, complète, sans dépendre du JavaScript.
 * Seul le sélecteur de créneaux est un îlot client — les disponibilités
 * changent à chaque réservation et ne peuvent pas être rendues à l'avance.
 *
 * Rendue à la demande, sans cache, et c'est délibéré : la visibilité dépend de
 * l'échéance d'abonnement, donc une fiche mise en cache resterait en ligne
 * après l'expiration. La recalculer à chaque requête est la seule façon qu'une
 * fiche disparaisse à la seconde où elle le doit.
 *
 * Passer en ISR demanderait un `generateStaticParams` — une route dynamique
 * sans lui reste servie à la demande, `revalidate` ou pas. Ce serait alors au
 * prix d'une fenêtre de péremption sur la visibilité, à traiter par
 * invalidation explicite depuis les routes de publication et d'abonnement.
 */

const MODE_ICONS = {
  online: Globe,
  teacher: Home,
  student: MapPin,
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const teacher = await getPublicTeacher((await params).slug);

  if (!teacher) {
    return { title: "Prof introuvable", robots: { index: false } };
  }

  const name = teacher.user.name ?? "Prof de musique";
  const subjects = teacher.instruments.map((i) => i.instrument.name).join(", ");
  const place = teacher.city ? ` à ${teacher.city}` : "";

  const title = `${name} — cours de ${subjects}${place}`;
  const description =
    teacher.headline ??
    `Réservez un cours de ${subjects}${place} avec ${name} sur SiNote.`;

  return {
    title,
    description,
    alternates: { canonical: `/profs/${teacher.slug}` },
    openGraph: {
      title,
      description,
      type: "profile",
      images: teacher.user.image ? [teacher.user.image] : undefined,
    },
  };
}

export default async function TeacherPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const teacher = await getPublicTeacher((await params).slug);

  // Fiche inexistante, en brouillon ou sans abonnement : indiscernables de
  // l'extérieur, et c'est voulu.
  if (!teacher) notFound();

  const [counts, reviews] = await Promise.all([
    getRatingCounts(teacher.id),
    getPublicReviews(teacher.id),
  ]);
  const summary = summarizeFromCounts(counts);

  // État du visiteur pour le widget : il détermine l'appel à l'action avant même
  // le clic. Réserver exige un profil élève (la route répond 403 sinon), d'où
  // les trois cas — invité, connecté sans profil élève, élève prêt à réserver.
  // La page est déjà rendue à la demande (sans cache), donc lire la session ici
  // ne coûte pas de mise en cache, et un invité obtient une page complète et
  // indexable avec le bouton « Se connecter pour réserver ».
  const session = await auth.api.getSession({ headers: await headers() });
  let viewer: "guest" | "incomplete" | "student" = "guest";
  if (session?.user) {
    const studentProfile = await prisma.studentProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });
    viewer = studentProfile ? "student" : "incomplete";
  }

  const name = teacher.user.name ?? "Prof de musique";
  const instruments = teacher.instruments.map((i) => i.instrument);
  // Âge affiché seulement si le prof l'a explicitement choisi (showAge).
  const age =
    teacher.showAge && teacher.birthDate
      ? ageOn(teacher.birthDate, new Date())
      : null;
  const rate =
    teacher.hourlyRateCents === null
      ? null
      : (teacher.hourlyRateCents / 100).toFixed(0);

  const modes = [
    teacher.teachesOnline && { icon: MODE_ICONS.online, label: "En visio" },
    teacher.teachesInPerson && {
      icon: MODE_ICONS.teacher,
      label: `Chez le prof${teacher.city ? ` — ${teacher.city}` : ""}`,
    },
    teacher.teachesAtHome && {
      icon: MODE_ICONS.student,
      label: "Se déplace chez l'élève",
    },
  ].filter(Boolean) as { icon: typeof Globe; label: string }[];

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-10">
      {/* Données structurées : ce qui permet aux moteurs de comprendre qu'il
          s'agit d'un service de cours, et non d'une page quelconque. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
 "@context": "https://schema.org",
 "@type": "Service",
            serviceType: `Cours de ${instruments.map((i) => i.name).join(", ")}`,
            provider: {
 "@type": "Person",
              name,
              ...(teacher.city
                ? {
                    address: {
 "@type": "PostalAddress",
                      addressLocality: teacher.city,
                      addressCountry: teacher.country,
                    },
                  }
                : {}),
            },
            ...(rate
              ? {
                  offers: {
 "@type": "Offer",
                    price: rate,
                    priceCurrency: "EUR",
                  },
                }
              : {}),
            // Les étoiles affichées par les moteurs dans leurs résultats
            // viennent de là. Ne l'émettre qu'avec de vrais avis : un
            // aggregateRating sans avis est un motif de pénalité, pas un
            // détail cosmétique.
            ...(summary.average !== null && summary.count > 0
              ? {
                  aggregateRating: {
 "@type": "AggregateRating",
                    ratingValue: summary.average,
                    reviewCount: summary.count,
                    bestRating: 5,
                    worstRating: 1,
                  },
                }
              : {}),
          }),
        }}
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-6">
          <Link
            href="/profs"
            className="flex w-fit items-center gap-1 text-sm text-muted hover:underline"
          >
            <ChevronLeft className="h-3 w-3" />
            Tous les profs
          </Link>

          <header className="flex flex-col gap-4 border-b border-border pb-8">
            {teacher.user.image ? (
              <Avatar className="h-24 w-24 border border-border">
                <AvatarImage src={teacher.user.image} alt={name} />
                <AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
            ) : null}
            <Eyebrow>{teacher.city ?? "Professeur"}</Eyebrow>
            <div className="flex flex-wrap items-center gap-3">
              <PageTitle>{name}</PageTitle>
              {teacher.trialLessonOffered ? (
                <Badge variant="success">
                  <Sparkles className="mr-1 h-3 w-3" />
                  Cours d&apos;essai
                </Badge>
              ) : null}
            </div>

            {/* La note juste sous le nom : c'est le premier élément que
                cherche un élève qui hésite entre deux fiches. */}
            <RatingBadge
              average={summary.average}
              count={summary.count}
              size="md"
            />

            {age !== null ? (
              <p className="text-sm text-muted">{age} ans</p>
            ) : null}

            {teacher.headline ? (
              <p className="text-lg text-muted">
                {teacher.headline}
              </p>
            ) : null}

            {/* Badges cliquables vers la page de cours de l'instrument : c'est
                du maillage interne (chaque fiche prof pointe vers les hubs
                /cours/*) autant qu'un raccourci pour l'élève. */}
            <div className="flex flex-wrap gap-2">
              {instruments.map((instrument) => (
                <Link key={instrument.slug} href={`/cours/${instrument.slug}`}>
                  <Badge
                    variant="secondary"
                    className="transition-colors hover:bg-primary hover:text-white"
                  >
                    <Music className="mr-1 h-3 w-3" />
                    {instrument.name}
                  </Badge>
                </Link>
              ))}
            </div>
          </header>

          {teacher.bio ? (
            <section className="flex flex-col gap-4">
              <SectionTitle>À propos</SectionTitle>
              <p className="whitespace-pre-line text-muted">
                {teacher.bio}
              </p>
            </section>
          ) : null}

          <section className="flex flex-col gap-4">
            <SectionTitle>Modalités</SectionTitle>
            <ul className="flex flex-col gap-2 text-sm text-muted">
              {modes.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-subtle" />
                  {label}
                </li>
              ))}
              <li className="flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-subtle" />
                Cours de {teacher.defaultDurationMin} minutes
              </li>
            </ul>
          </section>

          <Separator />

          <TeacherReviews
            reviews={reviews}
            average={summary.average}
            count={summary.count}
            counts={counts}
            timezone={teacher.user.timezone}
          />
        </div>

        {/* Colonne de réservation */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
          {rate ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-2xl">
                  {`${rate} €`}
                  <span className="text-base font-normal text-muted">
                    {" / heure"}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted">
                  Réglé directement au prof, hors plateforme.
                </p>
              </CardContent>
            </Card>
          ) : null}

          <BookingWidget
            teacherSlug={teacher.slug}
            instruments={instruments.map((i) => ({
              slug: i.slug,
              name: i.name,
            }))}
            timezone={teacher.user.timezone}
            trialOffered={teacher.trialLessonOffered}
            viewer={viewer}
          />
        </aside>
      </div>
      </main>
    </>
  );
}
