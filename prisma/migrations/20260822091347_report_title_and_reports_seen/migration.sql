-- AlterTable
ALTER TABLE "lesson_report" ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "student_profile" ADD COLUMN     "reportsSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "teacher_profile" ADD COLUMN     "reportsSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
