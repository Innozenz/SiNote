import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import type { InstrumentFamily } from "@prisma/client";
import { ChevronRight } from "lucide-react";

import { Row, RowList, SectionTitle } from "@/components/editorial";
import { HeroSearch } from "@/components/hero-search";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Spotlight } from "@/components/spotlight";
import { TeacherAvatar } from "@/components/teacher-result-list";
import prisma from "@/lib/prisma";
import {
  FAMILY_LABELS,
  FAMILY_ORDER,
  FAMILY_STYLES,
} from "@/lib/instruments/family";
import { buildScore } from "@/lib/instruments/score";
import { searchTeachers, type SearchResult } from "@/lib/search/teachers";
import {
  jsonLdHtml,
  organizationSchema,
  websiteSchema,
} from "@/lib/seo/structured-data";
import { formatSlotShort } from "@/lib/teacher/next-slots";
import { placeLine } from "@/lib/teacher/places";
import { visibleTeacherWhere } from "@/lib/teacher/visibility";
import { cn } from "@/lib/utils";

/**
 * Page d'accueil. Le titre et la description viennent du layout racine ; on ne
 * fixe ici que le canonical, pour que la home n'existe que sous une seule URL.
 */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/**
 * Page d'accueil.
 *
 * Server Component : c'est la porte d'entrée du trafic de recherche, elle doit
 * être lisible sans JavaScript. Les deux seuls îlots clients sont `HeroSearch`
 * (la barre de recherche) et `Spotlight` (aucune feuille de style ne sait où
 * se trouve le curseur) — tout le contenu reste rendu par le serveur.
 *
 * L'accroche est celle d'avant la refonte de septembre 2026, à la demande du
 * fondateur : barre de recherche à deux champs et médaillon animé (anneau
 * doré, sceau qui tourne, note qui bat la mesure — `globals.css`, section
 * « Mouvement »). Le reste de la page vient de la refonte : profs avec leur
 * prochain créneau, répertoire par famille, trois temps, bandeau prof.
 *
 * La couleur ne décore pas, elle **nomme une famille d'instruments** (voir
 * `lib/instruments/family.ts`). Les notes posées sur la portée sont exactement
 * les familles du répertoire plus bas : le lecteur apprend la correspondance en
 * descendant la page, sans légende.
 *
 * Les instruments, les villes et les profs affichés viennent de la base et ne
 * listent que ce qui existe réellement : des liens vers des recherches vides
 * feraient fuir autant les visiteurs que les moteurs.
 */

/**
 * Géométrie de la portée. L'interligne vaut `STAFF_GAP`, donc un demi-interligne
 * — le pas réel des hauteurs de notes — vaut la moitié.
 *
 * La hauteur est calculée pour rendre **exactement cinq lignes** : le dégradé se
 * répète tous les `STAFF_GAP` px, une boîte de `4 × GAP + 1` en montre donc cinq
 * et pas six.
 */
const STAFF_GAP = 14;
const STAFF_HEIGHT = STAFF_GAP * 4 + 1;
const STAFF_STEP = STAFF_GAP / 2;

/** Tête de note, hampe et ligature — les proportions de la gravure. */
const NOTE_WIDTH = 12;
const NOTE_HEIGHT = 9;
const STEM_OFFSET = NOTE_WIDTH / 2 - 1;
const BEAM_THICKNESS = 4;

/**
 * Durée d'un aller de la tête de lecture.
 *
 * Assez lent pour être une respiration et non un clignotant : au-delà d'une
 * poignée de secondes, l'œil cesse de suivre et l'effet devient un fond.
 */
const SEQUENCE_SECONDS = 7;

/** Battue du médaillon de l'accroche (voir `.m-beat` dans globals.css). */
const BEAT_SECONDS = 0.82;

/** Dégradés en style inline : en classe arbitraire, Tailwind découpe la valeur
    aux virgules et croit y voir des utilitaires. */
const staffLines = (color: string) =>
  `repeating-linear-gradient(to bottom, ${color} 0, ${color} 1px, transparent 1px, transparent ${STAFF_GAP}px)`;

/**
 * Les trois temps.
 *
 * Le troisième dit ce qui distingue SiNote et ce qu'aucune autre page ne dira à
 * un élève au bon moment : le cours se règle au prof, hors plateforme.
 */
const STEPS = [
  {
    title: "Choisissez un professeur",
    text: "Sa fiche, ses instruments, ses niveaux, ses avis. Rien n’est écrit par nous : les avis viennent d’élèves qui ont réellement suivi un cours.",
  },
  {
    title: "Réservez un créneau",
    text: "Ses disponibilités réelles, à la minute. Le professeur confirme, et vous recevez le lieu ou le lien visio.",
  },
  {
    title: "Réglez le prof, directement",
    text: "SiNote ne prend aucune commission sur vos cours. Le prix affiché est celui que vous payez à votre professeur, comme vous le souhaitez.",
  },
];

/** Profondeur de la fenêtre « disponible cette semaine ». */
const AVAILABLE_DAYS = 7;

/** Nombre de profs mis en avant — une liste, pas un annuaire. */
const AVAILABLE_COUNT = 6;

/** « 1 professeur », « 3 professeurs » — le pluriel se voit tout de suite. */
function count(n: number, singular: string, plural = `${singular}s`) {
  return `${n} ${n > 1 ? plural : singular}`;
}

/** Entrée décalée : les éléments arrivent dans l'ordre de lecture. */
const rise = (delay: number): CSSProperties => ({ animationDelay: `${delay}s` });

/**
 * Décalage d'apparition au défilement.
 *
 * Sur une ligne de temps `view()`, `animation-delay` ne veut plus rien dire —
 * l'avancement suit la position, pas l'horloge. Le décalage se fait donc en
 * repoussant la **plage**, ce qui est ce que lisent les variables déclarées
 * dans `globals.css`.
 */
const reveal = (index: number): CSSProperties =>
  ({
    "--reveal-from": `${index * 6}%`,
    "--reveal-to": `${60 + index * 6}%`,
  }) as CSSProperties;

export default async function HomePage() {
  const where = visibleTeacherWhere(new Date());

  const [instruments, catalogue, cities, teacherCount, teacherResp] =
    await Promise.all([
      // Instruments effectivement enseignés, les plus représentés d'abord. La
      // limite dépasse le catalogue : le compteur affiché serait faux si la
      // requête tronquait.
      prisma.instrument.findMany({
        where: { teachers: { some: { teacher: where } } },
        select: { slug: true, name: true, family: true },
        orderBy: { teachers: { _count: "desc" } },
        take: 60,
      }),
      // Le catalogue entier, pour le répertoire : chaque discipline a sa page
      // /cours/* (avec FAQ), qui doit rester atteignable même quand aucun prof
      // ne l'enseigne encore. Sans ça, une plateforme sans prof visible n'avait
      // plus un seul lien d'instrument sur sa page d'accueil.
      prisma.instrument.findMany({
        select: { slug: true, name: true, family: true },
        orderBy: { name: "asc" },
        take: 60,
      }),
      prisma.teacherProfile.groupBy({
        by: ["city"],
        where: { ...where, city: { not: null } },
        _count: { city: true },
        orderBy: { _count: { city: "desc" } },
        take: 12,
      }),
      prisma.teacherProfile.count({ where }),
      // Profs mis en avant. On réutilise la recherche pour ne pas dupliquer la
      // logique de visibilité et de note, et on lui demande le prochain créneau
      // de chacun — c'est lui qui décide ensuite de l'ordre.
      searchTeachers(
        {
          instrument: null,
          city: null,
          mode: null,
          maxRateCents: null,
          trialOnly: false,
          page: 1,
        },
        { withNextSlots: true, slotCount: 1, slotDays: AVAILABLE_DAYS }
      ),
    ]);

  /**
   * Ordre de la vitrine : **le prochain créneau d'abord**, le classement
   * ensuite.
   *
   * Un élève qui arrive sur l'accueil cherche un cours, pas un annuaire : un
   * prof libre jeudi vaut mieux qu'un prof mieux noté mais complet. Les profs
   * sans créneau dans la fenêtre ne sont donc pas triés au fond de la liste,
   * ils en sortent — et si personne n'est libre, la section change de titre
   * plutôt que d'annoncer une disponibilité qui n'existe pas.
   */
  const available = teacherResp.results
    .filter((teacher) => (teacher.nextSlots?.slots.length ?? 0) > 0)
    .sort(
      (a, b) =>
        a.nextSlots!.slots[0].startsAt.getTime() -
        b.nextSlots!.slots[0].startsAt.getTime()
    )
    .slice(0, AVAILABLE_COUNT);

  // Repli : personne de libre sous sept jours, mais des profs existent. On les
  // montre sans badge — annoncer « disponibles cette semaine » serait faux.
  const showcase =
    available.length > 0
      ? available
      : teacherResp.results.slice(0, AVAILABLE_COUNT);

  const tally = [
    teacherCount > 0 ? count(teacherCount, "professeur") : null,
    instruments.length > 0 ? count(instruments.length, "instrument") : null,
    cities.length > 0 ? count(cities.length, "ville") : null,
  ].filter(Boolean);

  // Répertoire crawlable : le catalogue groupé par famille, chaque discipline
  // pointant vers sa page de cours (`/cours/[slug]`). C'est le maillage interne
  // qui fait découvrir et remonter ces pages — sans lui, elles ne vivraient que
  // dans le sitemap. Les disciplines réellement enseignées sont marquées, les
  // autres restent listées : la page /cours/* existe et répond honnêtement.
  const taught = new Set(instruments.map((item) => item.slug));
  const repertoire = FAMILY_ORDER.map((family) => ({
    family,
    items: catalogue.filter((item) => item.family === family),
  })).filter((group) => group.items.length > 0);

  /**
   * La note du répertoire est sa légende : elle dit combien de disciplines la
   * liste couvre, et ce que le gras y signifie. Sans prof visible, le gras
   * n'apparaît nulle part — la seconde moitié de la phrase serait alors une
   * consigne de lecture pour quelque chose d'absent.
   */
  const repertoireNote = `${catalogue.length} disciplines${
    taught.size > 0 ? " · en gras, celles enseignées aujourd’hui" : ""
  }`;

  // Le sélecteur de l'accroche propose les disciplines enseignées ; à défaut,
  // le catalogue entier — un sélecteur vide n'est pas une page d'accueil.
  const searchable = instruments.length > 0 ? instruments : catalogue;

  return (
    <>
      {/* Données structurées de marque : identité (Organization) et site avec
          sa boîte de recherche (WebSite + SearchAction), pour les sitelinks. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdHtml([organizationSchema(), websiteSchema()]),
        }}
      />

      <SiteHeader />

      <main>
        {/* Accroche */}
        <section className="relative overflow-hidden">
          {/* Aurores.
              Elles ne nomment rien — c'est de la lumière, pas un code couleur.
              Elles restent donc sous le seuil où l'œil lit une teinte comme une
              information, sans quoi elles entreraient en concurrence avec les
              couleurs de familles, qui, elles, veulent dire quelque chose. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden"
          >
            <div
              className="m-drift-a absolute -left-40 -top-56 h-[38rem] w-[38rem] rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgb(18 53 81 / 0.26), transparent 68%)",
              }}
            />
            <div
              className="m-drift-b absolute -right-40 -top-24 h-[32rem] w-[32rem] rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgb(169 127 56 / 0.22), transparent 68%)",
              }}
            />
          </div>

          {/* Accroche en deux colonnes : le texte à gauche, le médaillon gravé
              à droite. Registre « conservatoire » — eyebrow doré, titre en
              Cormorant avec un mot en italique doré, filet or. */}
          <div className="relative mx-auto grid max-w-[82rem] items-center gap-10 px-4 sm:px-8 py-16 sm:py-24 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="m-rise" style={rise(0.05)}>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
                Cours de musique &amp; de chant
              </p>

              <h1
                className="mt-4 font-display font-semibold leading-[1.03]"
                style={{ fontSize: "clamp(2.6rem, 6.4vw, 4.6rem)" }}
              >
                Le professeur qui vous fait{" "}
                <em className="italic text-accent">progresser</em>
              </h1>

              <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
                L’exigence d’un conservatoire, la simplicité d’une réservation en
                ligne. Trouvez votre professeur, consultez ses disponibilités,
                réservez votre premier cours.
              </p>

              {/* Filet doré — la touche or, en emphase éditoriale. */}
              <div
                aria-hidden
                className="mt-7 h-px max-w-sm"
                style={{
                  background: "linear-gradient(90deg, var(--accent), transparent)",
                }}
              />

              <div className="mt-6">
                <HeroSearch
                  instruments={searchable.map((item) => ({
                    slug: item.slug,
                    name: item.name,
                  }))}
                />

                <p className="mt-3 text-sm text-muted">
                  Vous enseignez ?{" "}
                  <Link
                    href="/enseigner"
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Devenir prof →
                  </Link>
                </p>
              </div>

              {tally.length > 0 ? (
                <p className="mt-5 text-sm text-subtle">
                  <span className="text-accent">★</span> Des profs vérifiés ·{" "}
                  {tally.join(" · ")}
                </p>
              ) : null}
            </div>

            {/* Médaillon : un anneau doré (étoiles en orbite) autour d'un sceau
                bleu de Prusse gravé qui tourne lentement à contresens, note dorée
                au centre. La note reste droite et bat la mesure ; le disque résonne
                à chaque temps. Remplace la portée-séquenceur ; l'animation vit dans
                `globals.css`. */}
            <div aria-hidden className="relative hidden lg:block">
              <div
                className="relative mx-auto grid h-[340px] w-[340px] place-items-center"
                style={{ "--beat": `${BEAT_SECONDS}s` } as CSSProperties}
              >
                {/* Ondes de résonance : à chaque temps, un anneau doré s'échappe
                    du disque — le médaillon « sonne ». Deux anneaux décalés d'un
                    demi-temps pour une émanation continue. Décoratifs et
                    invisibles au repos (opacity 0), donc rien à l'écran sous
                    reduced-motion. */}
                <span
                  aria-hidden
                  className="m-pulse-ring absolute left-1/2 top-1/2 h-60 w-60 -translate-x-1/2 -translate-y-1/2 rounded-full border opacity-0"
                  style={{ borderColor: "var(--accent)" }}
                />
                <span
                  aria-hidden
                  className="m-pulse-ring absolute left-1/2 top-1/2 h-60 w-60 -translate-x-1/2 -translate-y-1/2 rounded-full border opacity-0"
                  style={{
                    borderColor: "var(--accent)",
                    animationDelay: `-${BEAT_SECONDS / 2}s`,
                  }}
                />

                <div
                  className="m-medallion-ring absolute inset-6 rounded-full border"
                  style={{ borderColor: "var(--accent-soft)" }}
                >
                  <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 text-sm text-accent">
                    ✦
                  </span>
                  <span className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 text-sm text-accent">
                    ✦
                  </span>
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 text-sm text-accent">
                    ✦
                  </span>
                  <span className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm text-accent">
                    ✦
                  </span>
                </div>

                {/* Enveloppe fixe : porte l'ombre portée, qui ne doit pas tourner
                    avec le sceau — une ombre décalée qui pivote donnerait une
                    source de lumière en orbite. */}
                <div
                  className="relative grid h-60 w-60 place-items-center rounded-full"
                  style={{ boxShadow: "0 24px 60px -26px rgb(18 53 81 / 0.55)" }}
                >
                  {/* Le sceau gravé, qui tourne. Le reflet décentré du dégradé et
                      le filet pointillé sont ses repères asymétriques : sans eux,
                      un disque circulaire tournerait sans que rien ne le montre. */}
                  <div
                    className="m-seal absolute inset-0 rounded-full"
                    style={{
                      background:
                        "radial-gradient(circle at 50% 38%, #1b4a6e, #123551 70%)",
                    }}
                  >
                    <div
                      className="absolute inset-3 rounded-full border"
                      style={{ borderColor: "var(--accent-soft)", opacity: 0.7 }}
                    />
                    <div
                      className="absolute inset-5 rounded-full border border-dashed"
                      style={{ borderColor: "var(--accent-soft)", opacity: 0.4 }}
                    />
                  </div>

                  {/* La note est posée sur le sceau, hors de sa rotation : elle
                      reste droite et lisible, et bat la mesure. `relative` la place
                      au-dessus du sceau opaque. */}
                  <span
                    className="m-beat relative font-display leading-none"
                    style={{ fontSize: "5rem", color: "#c6a260" }}
                  >
                    ♬
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Professeurs. Le prochain créneau est l'information qui décide, donc
            elle est dans la ligne et non derrière un clic. */}
        {showcase.length > 0 ? (
          <section className="border-t border-border">
            <div className="mx-auto max-w-[82rem] px-4 sm:px-8 py-16">
              <div className="m-reveal">
                <SectionTitle
                  trailing={
                    <Link
                      href="/profs"
                      className="shrink-0 text-sm font-normal normal-case tracking-normal text-muted underline-offset-4 hover:text-primary hover:underline"
                    >
                      Tous les profs →
                    </Link>
                  }
                >
                  {available.length > 0
                    ? "Professeurs disponibles cette semaine"
                    : "Nos professeurs"}
                </SectionTitle>
              </div>

              <RowList className="mt-8">
                {showcase.map((teacher) => (
                  <ShowcaseRow key={teacher.slug} teacher={teacher} />
                ))}
              </RowList>
            </div>
          </section>
        ) : null}

        {/* Répertoire : tout le catalogue, groupé par famille, chaque
            discipline liée à sa page de cours. Section crawlable — c'est elle
            qui fait circuler le référencement vers /cours/*, et le lecteur y
            apprend au passage la correspondance couleur → famille. */}
        {repertoire.length > 0 ? (
          <section className="border-t border-border">
            <div className="mx-auto max-w-[82rem] px-4 sm:px-8 py-16">
              <div className="m-reveal">
                <SectionTitle
                  trailing={
                    <span className="hidden shrink-0 text-sm font-normal normal-case tracking-normal text-muted md:inline">
                      {repertoireNote}
                    </span>
                  }
                >
                  Le répertoire
                </SectionTitle>
              </div>

              <div className="mt-8 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
                {repertoire.map((group, index) => (
                  <div
                    key={group.family}
                    className="m-reveal border-t border-border pt-4"
                    style={reveal(index)}
                  >
                    <p className="flex items-center gap-2.5">
                      <span
                        aria-hidden
                        className={cn(
                          "h-2.5 w-2.5 shrink-0 rounded-full",
                          FAMILY_STYLES[group.family].dot
                        )}
                      />
                      <span className="font-display text-2xl font-medium text-foreground">
                        {FAMILY_LABELS[group.family]}
                      </span>
                    </p>

                    <p className="mt-2.5 text-sm leading-[1.9]">
                      {group.items.map((item, position) => (
                        <span key={item.slug}>
                          {position > 0 ? (
                            <span aria-hidden className="text-subtle">
                              {" · "}
                            </span>
                          ) : null}
                          <Link
                            href={`/cours/${item.slug}`}
                            className={cn(
                              "underline-offset-4 transition-colors hover:text-primary hover:underline",
                              taught.has(item.slug)
                                ? "font-semibold text-foreground"
                                : "text-muted"
                            )}
                          >
                            {item.name}
                          </Link>
                        </span>
                      ))}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {/* Fonctionnement. Trois temps chiffrés en Cormorant italique doré :
            le filet au-dessus fait le travail d'une carte, sans la boîte. */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-[82rem] px-4 sm:px-8 py-16">
            <div className="m-reveal">
              <SectionTitle>Comment ça marche</SectionTitle>
            </div>

            <ol className="mt-8 grid gap-8 sm:grid-cols-3">
              {STEPS.map((step, index) => (
                <li
                  key={step.title}
                  className="m-reveal border-t border-border pt-5"
                  style={reveal(index)}
                >
                  <span
                    aria-hidden
                    className="block font-display text-[3.5rem] font-medium italic leading-none text-accent"
                  >
                    {index + 1}.
                  </span>
                  <h3 className="mt-2.5 font-display text-[1.625rem] font-medium leading-tight text-foreground">
                    {step.title}
                  </h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-muted">
                    {step.text}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Côté prof. Bandeau bleu posé sur le papier — un bloc arrondi dans la
            colonne, et non une bande pleine largeur : la page se referme sur un
            contraste franc sans changer de format. */}
        <section className="mx-auto max-w-[82rem] px-4 sm:px-8 pb-4 pt-20">
          <Spotlight className="relative overflow-hidden rounded-[20px] bg-sidebar text-sidebar-foreground">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 transition-opacity duration-500"
              style={{
                opacity: "var(--spot-opacity, 0)",
                background:
                  "radial-gradient(26rem 26rem at var(--spot-x, 50%) var(--spot-y, 50%), rgb(169 127 56 / 0.28), transparent 70%)",
              }}
            />

            <div aria-hidden className="absolute inset-x-0 top-0">
              <Staff
                line="rgb(255 255 255 / 0.18)"
                head="rgb(236 224 198 / 0.9)"
              />
            </div>

            <div className="relative flex flex-col gap-8 px-7 py-11 sm:px-12 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
              <div className="flex max-w-2xl flex-col gap-2.5">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent-soft">
                  Vous enseignez ?
                </p>

                <h2
                  className="font-display font-semibold leading-[1.05]"
                  style={{ fontSize: "clamp(1.875rem, 4.4vw, 2.75rem)" }}
                >
                  Une fiche, un agenda, des élèves qui vous trouvent.
                </h2>

                <p className="text-[0.9375rem] leading-relaxed text-sidebar-muted">
                  Abonnement mensuel unique, sans commission. Vos élèves vous
                  règlent directement.
                </p>
              </div>

              {/* Bouton en négatif écrit à la main : les variantes de `Button`
                  sont réglées pour un fond clair, aucune ne tient sur le bleu. */}
              <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3">
                <Link
                  href="/connexion"
                  className="inline-flex min-h-12 items-center rounded-[var(--radius-sm)] bg-background px-6 text-base font-medium text-foreground transition-all hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0"
                >
                  Créer ma fiche
                </Link>
                {/* `/enseigner` est la vitrine indexable de l'offre prof : elle
                    reste liée depuis l'accueil, en second rang. */}
                <Link
                  href="/enseigner"
                  className="inline-flex min-h-12 items-center text-sm font-medium text-sidebar-foreground/80 underline-offset-4 hover:text-sidebar-foreground hover:underline"
                >
                  Découvrir l’espace prof →
                </Link>
              </div>
            </div>
          </Spotlight>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

/**
 * Un prof de la vitrine, en ligne de filet.
 *
 * Toute la ligne est un seul lien : rien ici n'est cliquable séparément — le
 * badge de créneau annonce la disponibilité, il ne la réserve pas.
 *
 * La répartition suit la maquette : à gauche l'identité (photo, nom, où le
 * cours a lieu, les familles enseignées), à droite ce qui décide — le tarif et
 * le prochain créneau — puis le chevron qui dit que la ligne s'ouvre.
 */
function ShowcaseRow({ teacher }: { teacher: SearchResult }) {
  const name = teacher.name ?? "Prof de musique";
  const next = teacher.nextSlots?.slots[0] ?? null;
  const where = placeLine(teacher.city, teacher);

  return (
    <Row
      href={`/profs/${teacher.slug}`}
      main={
        <div className="flex items-start gap-4">
          <TeacherAvatar
            image={teacher.image}
            name={name}
            className="text-2xl"
          />

          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
              <p className="font-display text-[1.75rem] font-medium leading-tight text-foreground">
                {name}
              </p>
              {where ? (
                <span className="text-sm text-muted first-letter:uppercase">
                  {where}
                </span>
              ) : null}
            </div>

            {teacher.instruments.length > 0 ? (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {teacher.instruments.slice(0, 4).map((instrument) => (
                  <span
                    key={instrument.slug}
                    className={cn(
                      "inline-flex h-[26px] items-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
                      FAMILY_STYLES[instrument.family].chipStatic
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        FAMILY_STYLES[instrument.family].dot
                      )}
                    />
                    {instrument.name}
                  </span>
                ))}
              </div>
            ) : null}

            {/* Téléphone : prix et prochain créneau passent sous les pastilles ;
                la colonne de droite n'apparaît qu'à partir de `sm`. */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 sm:hidden">
              {teacher.hourlyRateCents !== null ? (
                <p className="font-display text-xl font-semibold leading-none text-foreground">
                  {`${Math.round(teacher.hourlyRateCents / 100)} €`}
                  <span className="font-sans text-sm font-medium text-muted">
                    {" / heure"}
                  </span>
                </p>
              ) : null}
              {next && teacher.nextSlots ? (
                <p className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />
                  {`Prochain créneau ${formatSlotShort(
                    next.startsAt,
                    teacher.nextSlots.timezone
                  )}`}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      }
      meta={
        <div className="hidden items-center gap-3 sm:flex">
          <div className="flex flex-col items-end gap-1.5">
            {teacher.hourlyRateCents !== null ? (
              <p className="font-display text-[1.625rem] font-semibold leading-none text-foreground">
                {`${Math.round(teacher.hourlyRateCents / 100)} €`}
                <span className="font-sans text-[0.9375rem] font-medium text-muted">
                  {" / heure"}
                </span>
              </p>
            ) : null}

            {next && teacher.nextSlots ? (
              <p className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />
                {`Prochain créneau ${formatSlotShort(
                  next.startsAt,
                  teacher.nextSlots.timezone
                )}`}
              </p>
            ) : null}
          </div>

          <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-subtle" />
        </div>
      }
    />
  );
}

/**
 * Une vraie portée : clef, chiffrage, quatre mesures de croches ligaturées,
 * barres de mesure — et une tête de lecture qui les joue.
 *
 * La gravure vient de `lib/instruments/score.ts`, qui rend des fractions et des
 * demi-interlignes ; ici on ne fait que les multiplier par la géométrie.
 *
 * **Les notes restent les familles réellement enseignées**, la phrase se
 * remplissant en les reprenant et en les transposant de mesure en mesure. La
 * couleur continue donc de nommer quelque chose, et le répertoire plus bas en
 * reste la légende.
 *
 * **La synchronisation est un décalage négatif, pas un minuteur.** La tête et
 * les notes partagent la durée `--sequence` ; chaque note démarre son cycle
 * comme s'il avait déjà tourné, de quoi placer sa frappe pile sous la tête.
 * Aucune horloge, aucun JavaScript, et rien qui puisse dériver : les deux
 * animations lisent la même variable.
 *
 * La tête de lecture vit dans la **zone de musique** et non sur toute la
 * largeur : elle lit les notes, pas la clef. C'est aussi ce qui garde les
 * fractions de `buildScore` et le balayage dans le même repère.
 *
 * Purement décorative, donc `aria-hidden` : le lecteur d'écran n'a que faire
 * d'une phrase qui ne dit rien de plus que le répertoire juste en dessous.
 */
function Staff({
  families = [],
  line = "var(--border-strong)",
  head = "var(--primary)",
  notation = "var(--muted)",
}: {
  families?: InstrumentFamily[];
  line?: string;
  head?: string;
  notation?: string;
}) {
  // Bornée à droite : une barre finale posée à 100 % tomberait pile sur le
  // bord et se ferait rogner.
  const score = buildScore(families, { from: 0, to: 0.985 });

  return (
    <div
      aria-hidden
      className="relative flex"
      style={
        {
          height: STAFF_HEIGHT,
          backgroundImage: staffLines(line),
          "--sequence": `${SEQUENCE_SECONDS}s`,
        } as CSSProperties
      }
    >
      {/* Clef et chiffrage n'existent que s'il y a quelque chose à jouer : une
          clef seule devant une portée vide annonce une phrase qui ne vient
          jamais. */}
      {score.notes.length > 0 ? (
        <div className="relative w-16 shrink-0 sm:w-20">
          <TrebleClef color={notation} />

          <div
            className="absolute inset-y-0 flex flex-col justify-center font-display text-[1.3rem] font-bold leading-[1.28]"
            style={{ left: 38, color: notation }}
          >
            <span>4</span>
            <span>4</span>
          </div>
        </div>
      ) : null}

      <div className="relative flex-1">
        {/* Le conteneur fait la largeur de la zone de musique : le translater
            de 100 % promène le trait d'un bout à l'autre sans jamais animer la
            mise en page ni avoir à connaître cette largeur. */}
        <div className="m-playhead pointer-events-none absolute inset-0">
          <span
            className="absolute -bottom-3 -top-3 left-0 w-px"
            style={{
              background: `linear-gradient(to bottom, transparent, ${head}, transparent)`,
              boxShadow: `0 0 12px 1px ${head}`,
            }}
          />
        </div>

        {score.barLines.map((at) => (
          <span
            key={`bar-${at}`}
            className="absolute top-0 w-px opacity-60"
            style={{
              left: `${at * 100}%`,
              height: STAFF_HEIGHT - 1,
              background: notation,
            }}
          />
        ))}

        {score.beams.map((beam) => (
          <span
            key={`beam-${beam.from}`}
            className="absolute"
            style={{
              left: `${beam.from * 100}%`,
              width: `${(beam.to - beam.from) * 100}%`,
              // La hampe part du flanc de la tête, pas de son centre.
              marginLeft: beam.stemUp ? STEM_OFFSET : -STEM_OFFSET - 1,
              top:
                beam.pitch * STAFF_STEP - (beam.stemUp ? 0 : BEAM_THICKNESS),
              height: BEAM_THICKNESS,
              background: notation,
            }}
          />
        ))}

        {score.notes.map((note, index) => {
          const noteY = note.pitch * STAFF_STEP;
          const beamY = score.beams[note.bar].pitch * STAFF_STEP;

          return (
            <span key={`note-${index}`}>
              <span
                className="absolute w-px"
                style={{
                  left: `${note.at * 100}%`,
                  marginLeft: note.stemUp ? STEM_OFFSET : -STEM_OFFSET - 1,
                  top: Math.min(noteY, beamY),
                  height: Math.abs(noteY - beamY),
                  background: notation,
                }}
              />

              <span
                className={cn(
                  "m-note absolute h-[9px] w-3 -rotate-[18deg] rounded-full",
                  FAMILY_STYLES[note.family].dot,
                  // La lueur de la frappe est un `box-shadow` en
                  // `currentColor` : sans la couleur de texte, elle serait
                  // noire.
                  FAMILY_STYLES[note.family].text
                )}
                style={{
                  left: `${note.at * 100}%`,
                  marginLeft: -NOTE_WIDTH / 2,
                  top: noteY - NOTE_HEIGHT / 2,
                  // La position de la note dans la mesure est aussi la fraction
                  // du cycle à laquelle la tête de lecture l'atteint.
                  animationDelay: `${-(1 - note.at) * SEQUENCE_SECONDS}s`,
                }}
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Clef de sol, tracée d'un trait d'épaisseur constante.
 *
 * Monolinéaire volontairement : une clef gravée a un plein et un délié, ce qui
 * demande une forme pleine et non un tracé. À cette taille le modelé ne se
 * verrait pas, et un trait régulier s'accorde au reste de la page — les filets
 * de la portée en sont un aussi.
 *
 * Le repère est celui de la portée : `y = 0` est la ligne du haut, `y = 42` la
 * ligne de sol, autour de laquelle s'enroule la spirale. C'est ce qui la pose
 * juste sans réglage à la main.
 */
function TrebleClef({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 -18 26 96"
      fill="none"
      stroke={color}
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="absolute"
      style={{ left: 6, top: -18, width: 26, height: 96 }}
    >
      <path
        d="M13 42C8 42 6 36 11 33C18 30 23 38 21 47C18 57 9 58 5 50C0 41 6 30 12 22C17 15 19 6 15 0C12 -4 8 0 8 7C8 16 12 28 14 42C16 56 16 66 11 70C6 73 2 69 4 64"
      />
    </svg>
  );
}
