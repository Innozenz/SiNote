import type { InstrumentFamily, Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";
import { getRatingSummaries, getSiteMeanRating } from "@/lib/reviews/queries";
import { rankTeachers } from "@/lib/reviews/ranking";
import { EMPTY_SUMMARY, type RatingSummary } from "@/lib/reviews/summary";
import {
  getNextSlotsForTeachers,
  type NextSlots,
} from "@/lib/teacher/next-slots";
import { visibleTeacherWhere } from "@/lib/teacher/visibility";
import {
  normalizeTerm,
  pageOffset,
  SEARCH_PAGE_SIZE,
  type SearchFilters,
} from "./query";

/**
 * Recherche de profs.
 *
 * Le filtre de visibilité vient de `visibleTeacherWhere` : une recherche qui
 * remonterait des fiches ensuite refusées en 404 serait pire que pas de
 * recherche.
 */

export type SearchResult = {
  /** Id du profil prof — clé des créneaux, jamais affichée. */
  id: string;
  slug: string;
  name: string | null;
  image: string | null;
  headline: string | null;
  city: string | null;
  hourlyRateCents: number | null;
  teachesOnline: boolean;
  teachesInPerson: boolean;
  teachesAtHome: boolean;
  trialLessonOffered: boolean;
  /** La famille voyage avec l'instrument : c'est elle qui porte la couleur. */
  instruments: { slug: string; name: string; family: InstrumentFamily }[];
  rating: RatingSummary;
  /**
   * Prochains créneaux libres, uniquement si l'appelant les a demandés
   * (`withNextSlots`). `null` veut dire « pas calculé », pas « aucun » — un
   * tableau vide, lui, dit bien qu'il n'y a rien dans la fenêtre.
   */
  nextSlots: NextSlots | null;
};

/**
 * Options de recherche.
 *
 * `withNextSlots` fait suivre les prochains créneaux de la page rendue. Il vit
 * ici plutôt que dans chaque page pour que `/profs` et les deux pages
 * `/cours/*` — qui affichent la même liste — les obtiennent de la même façon,
 * en une seule passe pour tout le lot.
 */
export type SearchOptions = {
  withNextSlots?: boolean;
  /** Nombre de créneaux conservés par prof. */
  slotCount?: number;
  /** Profondeur de la fenêtre, en jours. */
  slotDays?: number;
  now?: Date;
};

export type SearchResponse = {
  results: SearchResult[];
  total: number;
  /** Instrument reconnu à partir du terme saisi, s'il y en a un. */
  matchedInstrument: { slug: string; name: string } | null;
};

/**
 * Résout un terme libre en instrument : d'abord par slug, puis par nom, puis
 * par alias. C'est ce qui fait que « coaching vocal » ramène le chant.
 */
export async function resolveInstrument(term: string) {
  const normalized = normalizeTerm(term);

  const bySlug = await prisma.instrument.findUnique({
    where: { slug: normalized },
    select: { id: true, slug: true, name: true },
  });

  if (bySlug) return bySlug;

  const candidates = await prisma.instrument.findMany({
    select: { id: true, slug: true, name: true, aliases: true },
  });

  return (
    candidates.find(
      (instrument) =>
        normalizeTerm(instrument.name) === normalized ||
        instrument.aliases.some((alias) => normalizeTerm(alias) === normalized)
    ) ??
    // À défaut d'égalité, une correspondance partielle : « guitare » doit
    // ramener quelque chose même si l'élève ne connaît pas le nom exact.
    candidates.find(
      (instrument) =>
        normalizeTerm(instrument.name).includes(normalized) ||
        instrument.aliases.some((alias) => normalizeTerm(alias).includes(normalized))
    ) ??
    null
  );
}

export async function searchTeachers(
  filters: SearchFilters,
  options: SearchOptions = {}
): Promise<SearchResponse> {
  const matched = filters.instrument
    ? await resolveInstrument(filters.instrument)
    : null;

  // Terme d'instrument saisi mais introuvable : on rend une liste vide plutôt
  // que d'ignorer le filtre et de noyer l'élève sous des profs hors sujet.
  if (filters.instrument && !matched) {
    return { results: [], total: 0, matchedInstrument: null };
  }

  const where: Prisma.TeacherProfileWhereInput = {
    ...visibleTeacherWhere(new Date()),
    ...(matched
      ? { instruments: { some: { instrumentId: matched.id } } }
      : {}),
    ...(filters.city
      ? { city: { contains: filters.city, mode: "insensitive" } }
      : {}),
    ...(filters.mode === "online" ? { teachesOnline: true } : {}),
    ...(filters.mode === "in_person"
      ? { OR: [{ teachesInPerson: true }, { teachesAtHome: true }] }
      : {}),
    ...(filters.maxRateCents
      ? { hourlyRateCents: { lte: filters.maxRateCents, not: null } }
      : {}),
    ...(filters.trialOnly ? { trialLessonOffered: true } : {}),
  };

  /**
   * Le classement est bayésien (cf. lib/reviews/ranking.ts), donc il dépend
   * d'un agrégat que SQL ne calcule pas ici. Il doit s'appliquer à **tout**
   * l'ensemble de résultats avant d'être découpé en pages : classer seulement
   * la page courante donnerait un ordre différent selon la page consultée.
   *
   * On charge donc les identifiants de tous les profs correspondants — une
   * projection à deux colonnes — puis on classe et on pagine en mémoire, avant
   * d'aller chercher les lignes complètes de la seule page demandée.
   *
   * La contrepartie est assumée : ce chargement croît avec le nombre de profs
   * *visibles et correspondants*. À quelques milliers c'est négligeable ; au-delà
   * il faudra un classement en SQL, au prix de dupliquer les filtres qui vivent
   * aujourd'hui dans `where` — et donc du risque de dérive que cette
   * implémentation unique évite.
   */
  const candidates = await prisma.teacherProfile.findMany({
    where,
    select: { id: true, publishedAt: true },
  });

  const total = candidates.length;

  if (total === 0) {
    return {
      results: [],
      total: 0,
      matchedInstrument: matched
        ? { slug: matched.slug, name: matched.name }
        : null,
    };
  }

  const [ratings, siteMean] = await Promise.all([
    getRatingSummaries(candidates.map((c) => c.id)),
    getSiteMeanRating(),
  ]);

  const offset = pageOffset(filters.page);
  const pageIds = rankTeachers(candidates, ratings, siteMean)
    .slice(offset, offset + SEARCH_PAGE_SIZE)
    .map((c) => c.id);

  const page = await prisma.teacherProfile.findMany({
    where: { id: { in: pageIds } },
    select: {
      id: true,
      slug: true,
      headline: true,
      city: true,
      hourlyRateCents: true,
      teachesOnline: true,
      teachesInPerson: true,
      teachesAtHome: true,
      trialLessonOffered: true,
      user: { select: { name: true, image: true } },
      instruments: {
        select: {
          instrument: { select: { slug: true, name: true, family: true } },
        },
      },
    },
  });

  // `IN` ne préserve aucun ordre : on réapplique celui du classement.
  const byId = new Map(page.map((row) => [row.id, row]));
  const rows = pageIds
    .map((id) => byId.get(id))
    .filter((row): row is (typeof page)[number] => row !== undefined);

  // Une seule passe pour toute la page : `getNextSlotsForTeachers` fait ses
  // trois requêtes pour le lot entier, là où un appel par prof en ferait
  // soixante sur une page de vingt.
  const slotsByTeacher = options.withNextSlots
    ? await getNextSlotsForTeachers(
        rows.map((row) => row.id),
        {
          count: options.slotCount ?? 3,
          days: options.slotDays ?? 14,
          now: options.now ?? new Date(),
        }
      )
    : null;

  return {
    total,
    matchedInstrument: matched
      ? { slug: matched.slug, name: matched.name }
      : null,
    results: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.user.name,
      image: row.user.image,
      headline: row.headline,
      city: row.city,
      hourlyRateCents: row.hourlyRateCents,
      teachesOnline: row.teachesOnline,
      teachesInPerson: row.teachesInPerson,
      teachesAtHome: row.teachesAtHome,
      trialLessonOffered: row.trialLessonOffered,
      instruments: row.instruments.map((i) => i.instrument),
      rating: ratings.get(row.id) ?? EMPTY_SUMMARY,
      nextSlots: slotsByTeacher?.get(row.id) ?? null,
    })),
  };
}

export type SearchableInstrument = {
  slug: string;
  name: string;
  family: InstrumentFamily;
  /** Nombre de profs **visibles** qui l'enseignent. */
  teacherCount: number;
};

/**
 * Instruments réellement enseignés par au moins un prof visible, avec le
 * nombre de profs par instrument.
 *
 * Le compte passe par un `groupBy` sur la table de liaison filtrée par
 * `visibleTeacherWhere`, et non par un `_count` de la relation : celui-ci
 * compterait aussi les brouillons et les abonnements échus, et annoncerait donc
 * plus de profs que la recherche n'en rendra — le pire décompte possible dans
 * un filtre.
 */
export async function getSearchableInstruments(): Promise<
  SearchableInstrument[]
> {
  const where = visibleTeacherWhere(new Date());

  const [instruments, counts] = await Promise.all([
    prisma.instrument.findMany({
      where: { teachers: { some: { teacher: where } } },
      select: { id: true, slug: true, name: true, family: true },
      orderBy: { name: "asc" },
    }),
    prisma.teacherInstrument.groupBy({
      by: ["instrumentId"],
      where: { teacher: where },
      _count: { teacherId: true },
    }),
  ]);

  const byId = new Map(
    counts.map((row) => [row.instrumentId, row._count.teacherId])
  );

  return instruments.map((instrument) => ({
    slug: instrument.slug,
    name: instrument.name,
    family: instrument.family,
    teacherCount: byId.get(instrument.id) ?? 0,
  }));
}
