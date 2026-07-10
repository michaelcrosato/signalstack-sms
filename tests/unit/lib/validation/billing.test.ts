import { describe, it, expect } from 'vitest';
import { usageEventCreateSchema } from '@/lib/validation/billing';
import { UsageEventType } from '@prisma/client';

describe('usageEventCreateSchema', () => {
  it('should validate a valid payload with all fields', () => {
    const validPayload = {
      type: UsageEventType.MESSAGE_INBOUND,
      quantity: 10,
      metadata: { key: 'value' },
    };

    const result = usageEventCreateSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('should validate a valid payload with only required fields, and set default quantity', () => {
    const validPayload = {
      type: UsageEventType.AI_REQUEST,
    };

    const result = usageEventCreateSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.quantity).toBe(1);
    }
  });

  it('should reject a payload with an invalid type', () => {
    const invalidPayload = {
      type: 'INVALID_TYPE',
    };

    const result = usageEventCreateSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });

  it('should reject a payload with missing type', () => {
    const invalidPayload = {
      quantity: 1,
    };

    const result = usageEventCreateSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });

  it('should reject a payload with a non-positive quantity', () => {
    const invalidPayload = {
      type: UsageEventType.CONTACT_IMPORTED,
      quantity: 0,
    };

    const result = usageEventCreateSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });

  it('should reject a payload with a negative quantity', () => {
    const invalidPayload = {
      type: UsageEventType.CONTACT_IMPORTED,
      quantity: -5,
    };

    const result = usageEventCreateSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });

  it('should reject a payload with a float quantity', () => {
    const invalidPayload = {
      type: UsageEventType.CONTACT_IMPORTED,
      quantity: 1.5,
    };

    const result = usageEventCreateSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });

  it('should reject a payload with a quantity exceeding the max limit', () => {
    const invalidPayload = {
      type: UsageEventType.CAMPAIGN_SCHEDULED,
      quantity: 100_001,
    };

    const result = usageEventCreateSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });
});
