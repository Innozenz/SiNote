import { Globe, MapPin } from "lucide-react";

import { Row, RowList } from "@/components/editorial";
import { RatingBadge } from "@/components/ui/stars";
import type { SearchResult } from "@/lib/search/teachers";

/**
 * Liste de profs en lignes hairline (le pattern « répertoire » de l'accueil).
 *
 * Extrait de `/profs` pour être partagé avec les pages de cours SEO : les deux
 * affichent le même objet `SearchResult` de la même façon, et dupliquer ce
 * markup garantirait qu'ils finissent par diverger. Server Component — la photo
 * est un `<img>` rendu côté serveur, avec repli sur l'initiale.
 */
export function TeacherResultList({
  results,
  className,
}: {
  results: SearchResult[];
  className?: string;
}) {
  return (
    <RowList className={className}>
      {results.map((teacher) => (
        <Row
          key={teacher.slug}
          href={`/profs/${teacher.slug}`}
          main={
            <div className="flex items-center gap-4">
              <span className="relative flex h-14 w-14 shrink-0 overflow-hidden rounded-full border border-border bg-surface-strong">
                {teacher.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={teacher.image}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center font-display text-lg text-muted">
                    {(teacher.name ?? "?").charAt(0).toUpperCase()}
                  </span>
                )}
              </span>

              <div className="min-w-0">
                <p className="font-display text-xl font-medium leading-tight text-foreground">
                  {teacher.name ?? "Prof de musique"}
                </p>
                <p className="mt-1.5 truncate text-sm text-muted">
                  {teacher.instruments
                    .slice(0, 4)
                    .map((instrument) => instrument.name)
                    .join(" · ")}
                  {teacher.trialLessonOffered ? " · Cours d’essai" : ""}
                </p>
                {teacher.headline ? (
                  <p className="mt-1 line-clamp-1 text-sm text-subtle">
                    {teacher.headline}
                  </p>
                ) : null}
              </div>
            </div>
          }
          meta={
            <>
              {teacher.hourlyRateCents !== null ? (
                <p className="font-medium text-foreground">
                  {`${(teacher.hourlyRateCents / 100).toFixed(0)} €`}
                  <span className="text-muted">/h</span>
                </p>
              ) : null}
              <div className="mt-1.5 flex items-center justify-end gap-3 text-xs text-muted">
                <RatingBadge
                  average={teacher.rating.average}
                  count={teacher.rating.count}
                />
                {teacher.city ? (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {teacher.city}
                  </span>
                ) : teacher.teachesOnline ? (
                  <span className="flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    Visio
                  </span>
                ) : null}
              </div>
            </>
          }
        />
      ))}
    </RowList>
  );
}
