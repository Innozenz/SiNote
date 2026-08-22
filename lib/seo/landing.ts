import type { InstrumentFamily } from "@prisma/client";

import prisma from "@/lib/prisma";
import { normalizeTerm } from "@/lib/search/query";
import { visibleTeacherWhere } from "@/lib/teacher/visibility";

/**
 * Données des pages d'atterrissage SEO (`/cours/[instrument]` et
 * `/cours/[instrument]/[ville]`).
 *
 * Le principe : **on ne génère que des pages qui ont de la matière**. Une page
 * « cours de tuba à Brest » sans aucun prof est une page mince — mauvaise pour
 * le référencement et décevante pour le visiteur. Le sitemap n'y liste donc que
 * les combinaisons réellement peuplées, et les pages elles-mêmes passent en
 * `noindex` quand elles se vident (un prof peut disparaître entre deux crawls).
 *
 * Mutualisé avec le sitemap : la liste des URLs à indexer et le contenu des
 * pages doivent venir de la même source, sinon le sitemap promet des pages qui
 * répondent 404.
 */

/**
 * Slug d'une ville pour l'URL (`Saint-Étienne` → `saint-etienne`).
 *
 * Les villes sont du texte libre saisi par les profs. On ne peut pas
 * dé-sluggifier de façon fiable (les accents et la casse sont perdus), donc la
 * résolution inverse passe toujours par une comparaison de slugs sur les villes
 * réelles en base — jamais par reconstruction — voir `resolveCity`.
 */
export function citySlug(city: string): string {
  return normalizeTerm(city)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type LandingInstrument = {
  slug: string;
  name: string;
  family: InstrumentFamily;
  aliases: string[];
  teacherCount: number;
};

/** Instruments enseignés par au moins un prof visible, les plus fournis d'abord. */
export async function getLandingInstruments(): Promise<LandingInstrument[]> {
  const rows = await prisma.instrument.findMany({
    where: { teachers: { some: { teacher: visibleTeacherWhere(new Date()) } } },
    select: {
      slug: true,
      name: true,
      family: true,
      aliases: true,
      _count: { select: { teachers: true } },
    },
    orderBy: { teachers: { _count: "desc" } },
  });

  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    family: row.family,
    aliases: row.aliases,
    teacherCount: row._count.teachers,
  }));
}

export type LandingCity = {
  slug: string;
  name: string;
  teacherCount: number;
};

/**
 * Fusionne des lignes `(city, count)` sur le slug : deux libellés qui donnent le
 * même slug (« Lyon » et « lyon ») deviennent une seule ville, dont on garde le
 * libellé le plus fourni. Trié par nombre de profs décroissant.
 */
function fuseCities(
  rows: { city: string | null; _count: { city: number } }[]
): LandingCity[] {
  const bySlug = new Map<string, LandingCity>();
  for (const row of rows) {
    if (!row.city) continue;
    const slug = citySlug(row.city);
    if (!slug) continue;
    const existing = bySlug.get(slug);
    if (existing) {
      existing.teacherCount += row._count.city;
    } else {
      bySlug.set(slug, { slug, name: row.city, teacherCount: row._count.city });
    }
  }
  return [...bySlug.values()].sort((a, b) => b.teacherCount - a.teacherCount);
}

/** Villes distinctes où enseigne au moins un prof visible, avec le nombre de profs. */
export async function getLandingCities(): Promise<LandingCity[]> {
  const rows = await prisma.teacherProfile.groupBy({
    by: ["city"],
    where: { ...visibleTeacherWhere(new Date()), city: { not: null } },
    _count: { city: true },
    orderBy: { _count: { city: "desc" } },
  });
  return fuseCities(rows);
}

/** Villes où un instrument donné est enseigné par un prof visible. */
export async function getInstrumentCities(
  instrumentSlug: string
): Promise<LandingCity[]> {
  const rows = await prisma.teacherProfile.groupBy({
    by: ["city"],
    where: {
      ...visibleTeacherWhere(new Date()),
      city: { not: null },
      instruments: { some: { instrument: { slug: instrumentSlug } } },
    },
    _count: { city: true },
    orderBy: { _count: { city: "desc" } },
  });
  return fuseCities(rows);
}

/** Retrouve le libellé réel d'une ville à partir de son slug d'URL. */
export async function resolveCity(slug: string): Promise<LandingCity | null> {
  const cities = await getLandingCities();
  return cities.find((city) => city.slug === slug) ?? null;
}

/**
 * Instruments enseignés dans une ville par au moins un prof visible. Sert au
 * maillage interne de la page ville (« autres cours à Lyon »). Le filtre `city`
 * reprend le `contains insensitive` de la recherche, pour lister exactement ce
 * qu'un clic ramènerait. Le `teacherCount` renvoyé est le total de l'instrument,
 * pas le décompte en ville — la page ville ne l'affiche donc pas.
 */
export async function getCityInstruments(
  cityName: string
): Promise<LandingInstrument[]> {
  const rows = await prisma.instrument.findMany({
    where: {
      teachers: {
        some: {
          teacher: {
            ...visibleTeacherWhere(new Date()),
            city: { contains: cityName, mode: "insensitive" },
          },
        },
      },
    },
    select: {
      slug: true,
      name: true,
      family: true,
      aliases: true,
      _count: { select: { teachers: true } },
    },
    orderBy: { name: "asc" },
  });

  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    family: row.family,
    aliases: row.aliases,
    teacherCount: row._count.teachers,
  }));
}

export type InstrumentCityCombo = {
  instrumentSlug: string;
  citySlug: string;
};

/**
 * Toutes les paires (instrument, ville) réellement peuplées d'au moins un prof
 * visible. Sert au sitemap : seules ces combinaisons méritent une URL indexée.
 *
 * On charge les profs visibles (ville + instruments) et on agrège en mémoire —
 * un `groupBy` SQL sur une relation many-to-many n'est pas exprimable
 * simplement, et à l'échelle visée (quelques milliers de profs) le coût est
 * négligeable.
 */
export async function getInstrumentCityCombos(): Promise<InstrumentCityCombo[]> {
  const teachers = await prisma.teacherProfile.findMany({
    where: { ...visibleTeacherWhere(new Date()), city: { not: null } },
    select: {
      city: true,
      instruments: { select: { instrument: { select: { slug: true } } } },
    },
  });

  const seen = new Set<string>();
  const combos: InstrumentCityCombo[] = [];

  for (const teacher of teachers) {
    if (!teacher.city) continue;
    const city = citySlug(teacher.city);
    if (!city) continue;
    for (const { instrument } of teacher.instruments) {
      const key = `${instrument.slug}|${city}`;
      if (seen.has(key)) continue;
      seen.add(key);
      combos.push({ instrumentSlug: instrument.slug, citySlug: city });
    }
  }

  return combos;
}

/** Chemin racine d'une page instrument. */
export function instrumentPath(slug: string): string {
  return `/cours/${slug}`;
}

/** Chemin racine d'une page instrument × ville. */
export function instrumentCityPath(slug: string, city: string): string {
  return `/cours/${slug}/${city}`;
}
