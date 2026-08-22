-- Un seul avis par couple (teacherId, studentId) : l'avis devient global au prof.
-- On déduplique d'abord les avis existants (per-booking) en gardant, pour chaque
-- couple, le plus récent (createdAt, puis id comme départage), avant de poser la
-- contrainte d'unicité — sinon la création de l'index échouerait sur les doublons.
DELETE FROM "review" a
USING "review" b
WHERE a."teacherId" = b."teacherId"
  AND a."studentId" = b."studentId"
  AND (
    a."createdAt" < b."createdAt"
    OR (a."createdAt" = b."createdAt" AND a."id" < b."id")
  );

-- CreateIndex
CREATE UNIQUE INDEX "review_teacherId_studentId_key" ON "review"("teacherId", "studentId");
