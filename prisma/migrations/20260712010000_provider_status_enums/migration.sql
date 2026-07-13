-- M4 provider ownership lifecycle values are committed before constraints and indexes use them.
ALTER TYPE "ProviderPhoneNumberStatus" ADD VALUE 'VERIFIED';

CREATE TYPE "ProviderAccountStatus" AS ENUM ('VERIFIED', 'DEGRADED', 'REVOKED');
CREATE TYPE "ProviderMessagingServiceStatus" AS ENUM ('VERIFIED', 'DISABLED');
