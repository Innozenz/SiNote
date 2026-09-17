import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  Globe,
  GraduationCap,
  Home,
  MapPin,
  Music,
  Sparkles,
  Timer,
} from "lucide-react";

import { BookingWidget, type InitialNextSlot } from "@/components/booking-widget";
import { Eyebrow, PageTitle, SectionTitle } from "@/components/editorial";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TeacherReviews } from "@/components/teacher-reviews";
import { RatingBadge } from "@/components/ui/stars";
import { FAMILY_STYLES } from "@/lib/instruments/family";
import {
  getPublicReviews,
  getRatingCounts,
} from "@/lib/reviews/queries";
import { summarizeFromCounts } from "@/lib/reviews/summary";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { citySlug, instrumentCityPath, instrumentPath } from "@/lib/seo/landing";
import { getNextSlotsForTeachers } from "@/lib/teacher/next-slots";
import { summarizeOpenings } from "@/lib/teacher/openings-summary";
import { getPublicTeacher } from "@/lib/teacher/public-profile";
import { formatSlotLong } from "@/lib/teacher/slot-label";
import { ageOn } from "@/lib/user/age";
import { cn } from "@/lib/utils";

/**
 * Fiche prof publique.
 *
 * Server Component : c'est la page qui porte l'enjeu de référencement, elle
 * doit donc être rendue côté serveur, complète, sans dépendre du JavaScript.
 * Seul le sélecteur de créneaux est un îlot client — les disponibilités
 * changent à chaque réservation et ne peuvent pas être rendues à l'avance.
 * Son **prochain créneau**, lui, est calculé ici et passé au widget : la
 * disponibilité est ce que la fiche a de plus vivant à dire, elle doit être
 * dans le HTML et pas seulement après hydratation.
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

const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: "Débutant",
  INTERMEDIATE: "Intermédiaire",
  ADVANCED: "Avancé",
  PROFESSIONAL: "Professionnel",
};

/** Ordre pédagogique, pas alphabétique. */
const LEVEL_ORDER = [
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED",
  "PROFESSIONAL",
] as const;

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

  const [counts, reviews, nextSlots] = await Promise.all([
    getRatingCounts(teacher.id),
    getPublicReviews(teacher.id),
    // Un seul prof, mais la même fonction que les listes : ce que la fiche
    // annonce et ce que la recherche annonce ne peuvent donc pas diverger.
    getNextSlotsForTeachers([teacher.id], { count: 1, days: 62 }),
  ]);
  const summary = summarizeFromCounts(counts);

  const firstSlot = nextSlots.get(teacher.id)?.slots[0] ?? null;
  const initialNextSlot: InitialNextSlot | null = firstSlot
    ? {
        startsAt: firstSlot.startsAt.toISOString(),
        // Mise en forme côté serveur : le widget affiche la chaîne telle
        // quelle, ce qui exclut tout écart d'hydratation entre le formatage de
        // Node et celui du navigateur.
        label: formatSlotLong(firstSlot.startsAt, teacher.user.timezone),
      }
    : null;

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

  const lessonsGiven = teacher._count.bookings;
  const openings = summarizeOpenings(teacher.rules);

  // Niveaux enseignés, tous instruments confondus, dans l'ordre pédagogique.
  const levels = LEVEL_ORDER.filter((level) =>
    teacher.instruments.some((entry) =>
      entry.levelsTaught.includes(level)
    )
  ).map((level) => LEVEL_LABELS[level]);

  /**
   * La ligne de faits.
   *
   * Seules les cellules qui ont une valeur sont rendues — « 0 cours donnés »
   * n'inspire rien et « Niveaux : — » est du bruit. En dessous de deux, la
   * ligne n'est pas une ligne : elle n'est pas rendue du tout.
   */
  const facts = [
    age !== null ? { label: "Âge", value: `${age} ans` } : null,
    lessonsGiven > 0
      ? {
          label: "Cours donnés",
          value: String(lessonsGiven),
        }
      : null,
    { label: "Durée du cours", value: `${teacher.defaultDurationMin} min` },
    levels.length > 0 ? { label: "Niveaux", value: levels.join(" · ") } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const modes = [
    teacher.teachesInPerson && {
      icon: Home,
      label: `Chez le prof${teacher.city ? ` — ${teacher.city}` : ""}`,
    },
    teacher.teachesAtHome && {
      icon: MapPin,
      label: "Se déplace chez l'élève",
    },
    teacher.teachesOnline && { icon: Globe, label: "Cours en visio" },
    {
      icon: Timer,
      label: `Cours de ${teacher.defaultDurationMin} minutes`,
    },
    teacher.trialLessonOffered
      ? {
          icon: Sparkles,
          label: teacher.trialLessonMinutes
            ? `Cours d'essai de ${teacher.trialLessonMinutes} minutes`
            : "Cours d'essai proposé",
        }
      : null,
    levels.length > 0
      ? { icon: GraduationCap, label: `Niveaux : ${levels.join(", ")}` }
      : null,
    openings
      ? { icon: CalendarDays, label: `Disponible : ${openings}` }
      : null,
  ].filter(Boolean) as { icon: typeof Globe; label: string }[];

  /**
   * L'eyebrow dit d'un trait où le cours a lieu — « Toulouse · chez le prof,
   * chez vous ou en visio ». Composé depuis les trois booléens, donc jamais une
   * modalité que le prof n'a pas cochée.
   */
  const places = [
    teacher.teachesInPerson ? "chez le prof" : null,
    teacher.teachesAtHome ? "chez vous" : null,
    teacher.teachesOnline ? "en visio" : null,
  ].filter(Boolean) as string[];
  const eyebrow = [
    teacher.city,
    places.length > 0 ? joinWithOr(places) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Retour vers la page de cours correspondante plutôt que vers `/profs` : le
  // hub `/cours/*` est plus riche, et le lien fait aussi du maillage interne.
  // Ce prof y est visible par construction, la page ne sera donc pas vide.
  const back = instruments[0]
    ? {
        href: teacher.city
          ? instrumentCityPath(instruments[0].slug, citySlug(teacher.city))
          : instrumentPath(instruments[0].slug),
        label: `Cours de ${instruments[0].name}${teacher.city ? ` à ${teacher.city}` : ""}`,
      }
    : { href: "/profs", label: "Tous les profs" };

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

        {/* Trois blocs, placés explicitement en grille sur desktop ; sur mobile
            l'ordre du DOM règne — en-tête, puis réservation, puis le corps (bio,
            modalités, avis). Sinon une bio longue repoussait le widget tout en
            bas de page et l'élève devait scroller pour trouver comment réserver. */}
        <div className="grid gap-x-8 gap-y-8 lg:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-6 lg:col-start-1 lg:row-start-1">
            <Link
              href={back.href}
              className="flex w-fit items-center gap-1 text-sm text-muted hover:underline"
            >
              <ChevronLeft className="h-3 w-3" />
              {back.label}
            </Link>

            <header className="flex flex-col gap-4 border-b border-border pb-8">
              {teacher.user.image ? (
                <Avatar className="h-32 w-32 border border-border">
                  <AvatarImage src={teacher.user.image} alt={name} />
                  <AvatarFallback className="font-display text-3xl">
                    {name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              ) : null}

              {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}

              {/* Titre démesuré, mais en classes : `PageTitle size="display"`
                  pose sa propre taille en style inline, qu'aucune classe ne
                  peut alors dépasser. `size="page"` n'en pose pas, et
                  tailwind-merge laisse gagner celles écrites ici. */}
              <PageTitle
                size="page"
                className="text-[2.75rem] leading-[0.92] sm:text-6xl lg:text-7xl"
              >
                {name}
              </PageTitle>

              {teacher.headline ? (
                <p className="max-w-2xl font-display text-xl italic leading-snug text-muted sm:text-2xl">
                  {teacher.headline}
                </p>
              ) : null}

              {/* La note juste sous le nom : c'est le premier élément que
                  cherche un élève qui hésite entre deux fiches. */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <RatingBadge
                  average={summary.average}
                  count={summary.count}
                  size="md"
                />
                {summary.count === 0 ? (
                  <span className="text-sm text-subtle">
                    Pas encore d’avis
                  </span>
                ) : null}
              </div>

              {/* Pastilles cliquables vers la page de cours de l'instrument :
                  du maillage interne (chaque fiche pointe vers les hubs
                  /cours/*) autant qu'un raccourci pour l'élève. La couleur
                  nomme la famille, et rien d'autre. */}
              <div className="flex flex-wrap gap-2">
                {teacher.instruments.map(({ instrument }) => (
                  <Link
                    key={instrument.slug}
                    href={`/cours/${instrument.slug}`}
                    className={cn(
                      "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors",
                      FAMILY_STYLES[instrument.family].chip
                    )}
                  >
                    <Music className="h-3.5 w-3.5" />
                    {instrument.name}
                  </Link>
                ))}
              </div>
            </header>

            {/* La ligne de faits : ce que la base sait déjà et que la fiche
                taisait, en cellules séparées par des filets. */}
            {facts.length >= 2 ? (
              <dl
                className={cn(
                  "grid divide-y divide-border border-y border-border sm:divide-x sm:divide-y-0",
                  facts.length === 2 && "sm:grid-cols-2",
                  facts.length === 3 && "sm:grid-cols-3",
                  facts.length >= 4 && "sm:grid-cols-4"
                )}
              >
                {facts.map((fact) => (
                  <div key={fact.label} className="px-0 py-4 sm:px-5 sm:first:pl-0">
                    <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-subtle">
                      {fact.label}
                    </dt>
                    <dd className="mt-1.5 font-display text-lg font-medium text-foreground">
                      {fact.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>

          {/* Colonne de réservation — sur mobile elle remonte juste sous
              l'en-tête grâce à l'ordre du DOM ; sur desktop elle occupe la
              colonne droite sur toute la hauteur (row-span-2) et reste sticky.
              Sa hauteur est plafonnée à la fenêtre avec défilement interne :
              sinon un widget plus haut que l'écran (une semaine de créneaux +
              le formulaire) débordait sous le pli, épinglé par le haut, et ne
              laissait voir ses derniers créneaux qu'une fois arrivé au bas
              d'une fiche à la bio longue. Court, il n'affiche aucune barre. */}
          <aside className="flex flex-col gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto">
            {rate ? (
              <div className="border-y border-border py-4">
                <p className="font-display text-4xl font-semibold leading-none text-primary">
                  {`${rate} €`}
                  <span className="font-sans text-base font-normal text-muted">
                    {" / heure"}
                  </span>
                </p>
                <p className="mt-2 text-sm text-muted">
                  Réglé directement au prof, hors plateforme.
                </p>
              </div>
            ) : null}

            <BookingWidget
              teacherSlug={teacher.slug}
              instruments={instruments.map((i) => ({
                slug: i.slug,
                name: i.name,
              }))}
              timezone={teacher.user.timezone}
              granularityMin={teacher.slotGranularityMin}
              trialOffered={teacher.trialLessonOffered}
              viewer={viewer}
              initialNextSlot={initialNextSlot}
            />

            {/* Pas de bouton « poser une question » : la messagerie n'ouvre un
                fil qu'entre un prof et un élève **qui ont déjà un cours
                ensemble** (`/api/student/teachers/[id]/messages` répond 404
                sinon). Un bouton mènerait donc à une porte fermée. Le champ
                libre de la demande est le canal qui existe vraiment, et cette
                phrase est là pour le dire avant que l'élève ne le cherche. */}
            <p className="text-sm text-muted">
              Une question avant de réserver ? Ajoutez-la à votre demande : le
              prof la lit et vous répond avant de confirmer le cours.
            </p>
          </aside>

          {/* Colonne gauche — corps de la fiche */}
          <div className="flex flex-col gap-10 lg:col-start-1 lg:row-start-2">
            {teacher.bio ? (
              <section className="flex flex-col gap-4">
                <SectionTitle>À propos</SectionTitle>
                <div className="flex max-w-2xl flex-col gap-4 leading-relaxed text-muted">
                  {teacher.bio
                    .split(/\n{2,}/)
                    .map((paragraph) => paragraph.trim())
                    .filter(Boolean)
                    .map((paragraph, index) => (
                      <p key={index} className="whitespace-pre-line">
                        {paragraph}
                      </p>
                    ))}
                </div>
              </section>
            ) : null}

            <section className="flex flex-col gap-4">
              <SectionTitle>Modalités</SectionTitle>
              <ul className="grid gap-x-8 border-t border-border sm:grid-cols-2">
                {modes.map(({ icon: Icon, label }) => (
                  <li
                    key={label}
                    className="flex items-start gap-2.5 border-b border-border py-3 text-sm text-muted"
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
                    <span>{label}</span>
                  </li>
                ))}
              </ul>
            </section>

            <TeacherReviews
              reviews={reviews}
              average={summary.average}
              count={summary.count}
              counts={counts}
              timezone={teacher.user.timezone}
            />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

/** « chez le prof, chez vous ou en visio » — la dernière modalité prend « ou ». */
function joinWithOr(items: string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} ou ${items[items.length - 1]}`;
}
