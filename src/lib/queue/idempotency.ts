export function scheduledCampaignIdempotencyKey(orgId: string, campaignId: string, scheduledAt: Date) {
  return `scheduled-campaign:${orgId}:${campaignId}:${scheduledAt.toISOString()}`;
}

export function outboundCampaignMessageIdempotencyKey(orgId: string, queueJobId: string, contactId: string) {
  return `dummy-outbound:${orgId}:${queueJobId}:${contactId}`;
}
