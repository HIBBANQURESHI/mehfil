-- AlterTable
ALTER TABLE "Wedding" ALTER COLUMN "services" SET DEFAULT ARRAY[]::TEXT[];

-- Weddings created before this column existed.
UPDATE "Wedding" SET "services" = ARRAY[]::TEXT[] WHERE "services" IS NULL;
