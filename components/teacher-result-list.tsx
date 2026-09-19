import Link from "next/link";
import { Star } from "lucide-react";

import { RowList } from "@/components/editorial";
import { FAMILY_STYLES } from "@/lib/instruments/family";
import type { SearchResult } from "@/lib/search/teachers";
import { formatSlotShort } from "@/lib/teacher/next-slots";
import { placeLine } from "@/lib/teacher/places";
import { cn } from "@/lib/utils";

/**
 * Liste de profs en lignes hairline (le pattern « répertoire » de l'accueil).
 *
 * Extrait de `/profs` pour être partagé avec les pages de cours SEO : les deux
 * affichent le même objet `SearchResult` de la même façon, et dupliquer ce
 * markup garantirait qu'ils finissent par diverger. Server Component — la photo
 * est un `<img>` rendu côté serveur, avec repli sur l'initiale.
 *
 * **Trois colonnes, comme la maquette** : la photo, l'identité (nom, où, note,
 * accroche, familles enseignées), puis la colonne de décision — le tarif en
 * haut, les prochains créneaux en bas. Le créneau est ce qui départage deux
 * profs, il tient donc la même colonne que le prix et non une ligne à part.
 *
 * **La ligne n'est pas un seul lien.** Les prochains créneaux sont des liens à
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
  const where = placeLine(teacher.city, teacher);

  return (
    // Le retrait négatif est porté par le bloc intérieur, pas par le `<li>` :
    // sur le `<li>`, il déborderait les filets de `RowList` de part et d'autre.
    <li>
      <div className="group/row -mx-3 grid gap-x-6 gap-y-4 rounded-lg px-3 py-6 transition-colors hover:bg-surface sm:grid-cols-[88px_minmax(0,1fr)] lg:grid-cols-[88px_minmax(0,1fr)_220px]">
        <Link href={href} tabIndex={-1} aria-hidden className="shrink-0">
          <TeacherAvatar
            image={teacher.image}
            name={name}
            className="h-[88px] w-[88px] text-4xl"
          />
        </Link>

        <div className="flex min-w-0 flex-col gap-2.5">
          <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
            <h3 className="font-display text-[2rem] font-medium leading-none text-foreground">
              <Link
                href={href}
                className="underline-offset-4 outline-none group-hover/row:underline focus-visible:underline"
              >
                {name}
              </Link>
            </h3>

            {where ? (
              <span className="text-sm text-muted first-letter:uppercase">
                {where}
              </span>
            ) : null}

            <Rating
              average={teacher.rating.average}
              count={teacher.rating.count}
            />
          </div>

          {teacher.headline ? (
            <p className="line-clamp-2 max-w-xl text-sm leading-relaxed text-muted">
              {teacher.headline}
            </p>
          ) : null}

          {teacher.instruments.length > 0 || teacher.trialLessonOffered ? (
            <div className="flex flex-wrap items-center gap-1.5">
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

              {teacher.trialLessonOffered ? (
                <span className="inline-flex h-[26px] items-center rounded-full bg-accent-soft px-2.5 text-xs font-medium text-accent">
                  Cours d&apos;essai
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Colonne de décision : le tarif en haut, la disponibilité en bas.
            Sous `lg` elle repasse sous l'identité, alignée à gauche — une
            colonne de 220 px ne tient pas sur un téléphone. */}
        <div className="flex flex-col justify-between gap-3 sm:col-start-2 lg:col-start-3 lg:items-end lg:text-right">
          {teacher.hourlyRateCents !== null ? (
            <p className="font-display text-[1.875rem] font-semibold leading-none text-foreground">
              {`${Math.round(teacher.hourlyRateCents / 100)} €`}
              <span className="font-sans text-sm font-medium text-muted">
                {" / heure"}
              </span>
            </p>
          ) : (
            <span />
          )}

          <NextSlots
            teacher={teacher}
            href={href}
            slotWindowDays={slotWindowDays}
          />
        </div>
      </div>
    </li>
  );
}

/**
 * Note du prof, forme compacte de la maquette : une étoile dorée, la moyenne et
 * le volume. Un prof sans avis n'affiche pas « 0 » — une absence d'avis n'est
 * pas une mauvaise note — mais « Nouveau », qui dit la même chose sans la
 * teinter en négatif.
 */
function Rating({
  average,
  count,
}: {
  average: number | null;
  count: number;
}) {
  const isNew = average === null || count === 0;

  return (
    <span className="inline-flex items-center gap-1 text-sm text-foreground">
      <Star aria-hidden className="h-3.5 w-3.5 fill-accent text-accent" />
      {isNew
        ? "Nouveau"
        : `${average.toFixed(1).replace(".", ",")} · ${count} avis`}
    </span>
  );
}

/**
 * Prochains créneaux d'un prof, en pastilles cliquables.
 *
 * C'est le cœur de la refonte de cette liste : un élève choisit un prof
 * *disponible*, et le lui faire découvrir en ouvrant chaque fiche est
 * exactement ce que ce bandeau supprime. Le premier créneau porte la teinte
 * primaire — c'est le plus tôt, donc celui que l'œil doit trouver en premier ;
 * les suivants restent neutres.
 *
 * `nextSlots === null` veut dire « pas calculé » (les pages qui ne les
 * demandent pas) et ne rend rien ; un tableau vide, lui, dit franchement qu'il
 * n'y a rien dans la fenêtre — un silence laisserait croire à un oubli.
 */
function NextSlots({
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
      <p className="text-xs text-subtle">
        {`Aucun créneau sous ${slotWindowDays} jours`}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 lg:items-end">
      <span className="text-xs text-subtle">Prochains créneaux</span>
      <div className="flex flex-wrap gap-1.5 lg:justify-end">
        {next.slots.map((slot, index) => (
          <Link
            key={slot.startsAt.toISOString()}
            href={href}
            className={cn(
              "inline-flex h-7 items-center rounded-full border px-2.5 text-xs transition-colors",
              index === 0
                ? "border-primary text-primary"
                : "border-border text-muted hover:border-primary hover:text-primary"
            )}
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
        // La taille de l'initiale est posée ici, sur le conteneur : l'appelant
        // qui agrandit la pastille (88 px en recherche, 64 px ailleurs) doit
        // pouvoir agrandir la lettre du même geste.
        "relative flex h-16 w-16 shrink-0 overflow-hidden rounded-full border border-border bg-surface-strong text-xl",
        className
      )}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center font-display text-muted">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  );
}
