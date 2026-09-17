/**
 * Genres musicaux proposés à l'élève.
 *
 * `StudentProfile.preferredGenres` existait en base depuis le début sans aucun
 * écran pour l'alimenter : la colonne était stockée et jamais lue. Une liste
 * fermée plutôt qu'un champ libre, pour deux raisons — un prof compare des
 * étiquettes, pas des formulations ; et le jour où la recherche filtrera
 * là-dessus, « métal » et « metal » ne feront pas deux familles.
 *
 * Elle reste courte à dessein : dix entrées se parcourent d'un regard, trente
 * demandent de lire. Un élève qui ne s'y retrouve pas le dira dans « Mon
 * parcours », qui est là pour ça.
 *
 * La route accepte n'importe quelle chaîne de 40 caractères (`preferredGenres`
 * dans `/api/student/profile`) : cette liste habille l'écran, elle ne prétend
 * pas contraindre la base.
 */
export const PREFERRED_GENRES = [
  "Rock",
  "Pop",
  "Jazz",
  "Blues",
  "Classique",
  "Métal",
  "Folk",
  "Musiques du monde",
  "Électro",
  "Chanson",
] as const;
