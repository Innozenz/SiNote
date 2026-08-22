-- CreateEnum
CREATE TYPE "SubscriptionReminderKind" AS ENUM ('EXPIRY_J5', 'EXPIRY_J1');

-- CreateTable
CREATE TABLE "subscription_reminder" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "kind" "SubscriptionReminderKind" NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_reminder_teacherId_kind_periodEnd_key" ON "subscription_reminder"("teacherId", "kind", "periodEnd");

-- AddForeignKey
ALTER TABLE "subscription_reminder" ADD CONSTRAINT "subscription_reminder_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teacher_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
