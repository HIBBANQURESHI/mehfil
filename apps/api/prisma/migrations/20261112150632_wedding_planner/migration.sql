-- CreateEnum
CREATE TYPE "PlanningStatus" AS ENUM ('JUST_STARTED', 'ALREADY_PLANNING', 'URGENT');

-- CreateEnum
CREATE TYPE "AiStatus" AS ENUM ('NONE', 'PENDING', 'READY', 'FAILED');

-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'MAYUN';

-- AlterTable
ALTER TABLE "BudgetItem" ADD COLUMN     "serviceKey" TEXT;

-- AlterTable
ALTER TABLE "ChecklistItem" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'CUSTOM';

-- AlterTable
ALTER TABLE "Wedding" ADD COLUMN     "aiAllocation" JSONB,
ADD COLUMN     "aiAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "aiLockedUntil" TIMESTAMP(3),
ADD COLUMN     "aiNote" TEXT,
ADD COLUMN     "aiStatus" "AiStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "budgetBand" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "partnerOne" TEXT,
ADD COLUMN     "partnerTwo" TEXT,
ADD COLUMN     "planningStatus" "PlanningStatus",
ADD COLUMN     "services" TEXT[],
ADD COLUMN     "style" TEXT,
ADD COLUMN     "targetMonth" TEXT,
ADD COLUMN     "venuePreference" TEXT;

-- AlterTable
ALTER TABLE "WeddingEvent" ADD COLUMN     "areaId" TEXT,
ADD COLUMN     "cityId" TEXT,
ADD COLUMN     "venueStatus" TEXT;

-- CreateIndex
CREATE INDEX "Wedding_aiStatus_idx" ON "Wedding"("aiStatus");

-- AddForeignKey
ALTER TABLE "WeddingEvent" ADD CONSTRAINT "WeddingEvent_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeddingEvent" ADD CONSTRAINT "WeddingEvent_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;
