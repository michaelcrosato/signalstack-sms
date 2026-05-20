export function scheduledCampaignIdempotencyKey(orgId: string, campaignId: string, scheduledAt: Date) {
  return `scheduled-campaign:${orgId}:${campaignId}:${scheduledAt.toISOString()}`;
}
