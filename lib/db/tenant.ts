export type TenantScopedRecord = {
  orgId: string;
};

export function assertSameOrg(record: TenantScopedRecord | null, orgId: string) {
  if (!record) {
    throw new Error("Record not found.");
  }

  if (record.orgId !== orgId) {
    throw new Error("Record does not belong to the current organization.");
  }

  return record;
}

export function orgWhere<T extends object>(orgId: string, where?: T) {
  return {
    ...where,
    orgId
  };
}

