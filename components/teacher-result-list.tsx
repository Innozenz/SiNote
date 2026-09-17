import Link from "next/link";
import { Globe, MapPin, Sparkles } from "lucide-react";

import { RowList } from "@/components/editorial";
import { RatingBadge } from "@/components/ui/stars";
import { FAMILY_STYLES } from "@/lib/instruments/family";
import type { SearchResult } from "@/lib/search/teachers";
import { formatSlotShort } from "@/lib/teacher/next-slots";
import { cn } from "@/lib/utils";

/**
 * Liste de profs en lignes hairline (le pattern « répertoire » de l'accueil).
 *
 * Extrait de `/profs` pour être partagé avec les pages de cours SEO : les deux
 * affichent le même objet `SearchResult` de la même façon, et dupliquer ce
 * markup garantirait qu'ils finissent par diverger. Server Component — la photo
 * est un `<img>` rendu côté serveur, avec repli sur l'initiale.
 *
 * **La ligne n'est plus un seul lien.** Les prochains créneaux sont des liens à
 * part entière, et un `<a>` ne peut pas en contenir un autre : la ligne pose
 * donc plusieurs liens vers la même fiche (photo, nom, créneaux) plutôt qu'un
 * grand bloc cliquable. Le survol lave quand même le fond, via `group/row`,
 * pour que la ligne reste lue comme une unité.
 *
 * La couleur des pastilles d'instrument vient de la **famille** et de nulle part
 * ailleurs (`FAMILY_STYLES`, classes écrites en toutes lettres — Tailwind lit
 * les sources au texte et ne générerait jamais une classe composée à
 * l'exécution).
 */
export function TeacherResultList({
  results,
  slotWindowDays = 14,
  className,
}: {
  results: SearchResult[];
  /** Profondeur de la fenêtre de créneaux, pour le libellé d'absence. */
  slotWindowDays?: number;
  className?: string;
}) {
  return (
    <RowList className={className}>
      {results.map((teacher) => (
        <TeacherRow
          key={teacher.slug}
          teacher={teacher}
          slotWindowDays={slotWindowDays}
        />
      ))}
    </RowList>
  );
}

function TeacherRow({
  teacher,
  slotWindowDays,
}: {
  teacher: SearchResult;
  slotWindowDays: number;
}) {
  const href = `/profs/${teacher.slug}`;
  const name = teacher.name ?? "Prof de musique";

  return (
    // Le retrait négatif est porté par le bloc intérieur, pas par le `<li>` :
    // sur le `<li>`, il déborderait les filets de `RowList` de part et d'autre.
    <li>
      <div className="group/row -mx-3 rounded-lg px-3 py-6 transition-colors hover:bg-surface">
      <div className="flex items-start justify-between gap-4 sm:gap-6">
        <div className="flex min-w-0 items-start gap-4">
          <Link href={href} tabIndex={-1} aria-hidden className="shrink-0">
            <TeacherAvatar image={teacher.image} name={name} />
          </Link>

          <div className="min-w-0">
            <h3 className="font-display text-xl font-medium leading-tight text-foreground">
              <Link
                href={href}
                className="underline-offset-4 outline-none group-hover/row:underline focus-visible:underline"
              >
                {name}
              </Link>
            </h3>

            {teacher.instruments.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {teacher.instruments.slice(0, 4).map((instrument) => (
                  <span
                    key={instrument.slug}
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-medium",
                      FAMILY_STYLES[instrument.family].chipStatic
                    )}
                  >
                    {instrument.name}
                  </span>
                ))}
              </div>
            ) : null}

            {teacher.headline ? (
              <p className="mt-2 line-clamp-2 text-sm text-muted">
                {teacher.headline}
              </p>
            ) : null}

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
              <RatingBadge
                average={teacher.rating.average}
                count={teacher.rating.count}
              />
              {teacher.rating.count === 0 ? (
                <span className="text-subtle">Nouveau</span>
              ) : null}

              {teacher.city ? (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {teacher.city}
                </span>
              ) : null}
              {teacher.teachesOnline ? (
                <span className="flex items-center gap-1">
                  <Globe className="h-3 w-3" />
                  Visio
                </span>
              ) : null}

              {teacher.trialLessonOffered ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 font-medium text-success">
                  <Sparkles className="h-3 w-3" />
                  Cours d&apos;essai
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {teacher.hourlyRateCents !== null ? (
          <p className="shrink-0 text-right font-display text-2xl font-semibold leading-none text-primary">
            {`${Math.round(teacher.hourlyRateCents / 100)} €`}
            <span className="block pt-1 font-sans text-xs font-normal text-muted">
              par heure
            </span>
          </p>
        ) : null}
      </div>

      <NextSlotsRow
        teacher={teacher}
        href={href}
        slotWindowDays={slotWindowDays}
      />
      </div>
    </li>
  );
}

/**
 * Prochains créneaux d'un prof, en pastilles cliquables.
 *
 * C'est le cœur de la refonte de cette liste : un élève choisit un prof
 * *disponible*, et le lui faire découvrir en ouvrant chaque fiche est
 * exactement ce que ce bandeau supprime.
 *
 * `nextSlots === null` veut dire « pas calculé » (les pages qui ne les
 * demandent pas) et ne rend rien ; un tableau vide, lui, dit franchement qu'il
 * n'y a rien dans la fenêtre — un silence laisserait croire à un oubli.
 */
function NextSlotsRow({
  teacher,
  href,
  slotWindowDays,
}: {
  teacher: SearchResult;
  href: string;
  slotWindowDays: number;
}) {
  const next = teacher.nextSlots;
  if (!next) return null;

  if (next.slots.length === 0) {
    return (
      <p className="mt-4 text-xs text-subtle">
        {`Aucun créneau sous ${slotWindowDays} jours`}
      </p>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-subtle">
        Prochains créneaux
      </span>
      <div className="flex flex-wrap gap-2">
        {next.slots.map((slot) => (
          <Link
            key={slot.startsAt.toISOString()}
            href={href}
            className="inline-flex min-h-9 items-center rounded-full border border-success/40 bg-success-soft px-3 text-xs font-medium text-success transition-colors hover:border-success"
          >
            {formatSlotShort(slot.startsAt, next.timezone)}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Photo du prof, ou son initiale gravée à défaut. */
export function TeacherAvatar({
  image,
  name,
  className,
}: {
  image: string | null;
  name: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative flex h-16 w-16 shrink-0 overflow-hidden rounded-full border border-border bg-surface-strong",
        className
      )}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center font-display text-xl text-muted">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  );
}
