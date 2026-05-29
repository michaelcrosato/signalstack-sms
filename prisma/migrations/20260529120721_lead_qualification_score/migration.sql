-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "leadQualifiedAt" TIMESTAMP(3),
ADD COLUMN     "leadScore" INTEGER,
ADD COLUMN     "leadStage" TEXT;
