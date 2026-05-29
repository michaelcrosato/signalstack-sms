-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "consentCapturedAt" TIMESTAMP(3),
ADD COLUMN     "consentDisclosure" TEXT,
ADD COLUMN     "consentMethod" TEXT;
