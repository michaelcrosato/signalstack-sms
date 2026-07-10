import { escapeCsv } from "@/lib/csv/escape";

export type ProviderCredentialRotationExportRow = {
  id: string;
  provider: string;
  action: string;
  providerCredentialId: string | null;
  actorUserId: string | null;
  accountSidRedacted: string | null;
  accountSidLast4: string | null;
  fromNumberRedacted: string | null;
  fromNumberLast4: string | null;
  authTokenConfigured: boolean;
  previousAccountSidLast4: string | null;
  previousFromNumberLast4: string | null;
  previousAuthTokenConfigured: boolean;
  source: string;
  createdAt: Date;
};

const providerCredentialRotationCsvColumns = [
  "id",
  "provider",
  "action",
  "providerCredentialId",
  "actorUserId",
  "accountSidRedacted",
  "accountSidLast4",
  "fromNumberRedacted",
  "fromNumberLast4",
  "authTokenConfigured",
  "previousAccountSidLast4",
  "previousFromNumberLast4",
  "previousAuthTokenConfigured",
  "source",
  "createdAt"
];

export function serializeProviderCredentialRotationsCsv(rotations: ProviderCredentialRotationExportRow[]) {
  const rows = rotations.map((rotation) =>
    [
      rotation.id,
      rotation.provider,
      rotation.action,
      rotation.providerCredentialId,
      rotation.actorUserId,
      rotation.accountSidRedacted,
      rotation.accountSidLast4,
      rotation.fromNumberRedacted,
      rotation.fromNumberLast4,
      rotation.authTokenConfigured,
      rotation.previousAccountSidLast4,
      rotation.previousFromNumberLast4,
      rotation.previousAuthTokenConfigured,
      rotation.source,
      rotation.createdAt.toISOString()
    ]
      .map(escapeCsv)
      .join(",")
  );

  return [providerCredentialRotationCsvColumns.join(","), ...rows].join("\n");
}
