import { describe, it, expect } from 'vitest';
import { scheduledCampaignIdempotencyKey, outboundCampaignMessageIdempotencyKey } from '@/lib/queue/idempotency';

describe('Idempotency Keys', () => {
  describe('scheduledCampaignIdempotencyKey', () => {
    it('should generate a correct idempotency key based on orgId, campaignId, and scheduledAt', () => {
      const orgId = 'org-123';
      const campaignId = 'camp-456';
      const date = new Date('2023-10-15T10:00:00.000Z');

      const key = scheduledCampaignIdempotencyKey(orgId, campaignId, date);

      expect(key).toBe('scheduled-campaign:org-123:camp-456:2023-10-15T10:00:00.000Z');
    });

    it('should generate distinct keys for different dates', () => {
      const orgId = 'org-123';
      const campaignId = 'camp-456';
      const date1 = new Date('2023-10-15T10:00:00.000Z');
      const date2 = new Date('2023-10-16T10:00:00.000Z');

      const key1 = scheduledCampaignIdempotencyKey(orgId, campaignId, date1);
      const key2 = scheduledCampaignIdempotencyKey(orgId, campaignId, date2);

      expect(key1).not.toBe(key2);
    });
  });

  describe('outboundCampaignMessageIdempotencyKey', () => {
    it('should generate a correct idempotency key based on orgId, queueJobId, and contactId', () => {
      const orgId = 'org-123';
      const queueJobId = 'job-789';
      const contactId = 'contact-012';

      const key = outboundCampaignMessageIdempotencyKey(orgId, queueJobId, contactId);

      expect(key).toBe('dummy-outbound:org-123:job-789:contact-012');
    });
  });
});
