import { describe, it, expect } from 'vitest';
import { assertDemoSafeDefaults, envDefaults } from '@/lib/env/defaults';

describe('assertDemoSafeDefaults', () => {
  it('should not throw if all defaults match', () => {
    expect(() => assertDemoSafeDefaults({ ...envDefaults })).not.toThrow();
  });

  it('should throw if a default does not match', () => {
    const invalidDefaults = { ...envDefaults, DEMO_MODE: 'false' };
    expect(() => assertDemoSafeDefaults(invalidDefaults)).toThrowError(
      'DEMO_MODE must default to true'
    );
  });

  it('should throw if a default is missing', () => {
    const missingDefaults: Record<string, string | undefined> = { ...envDefaults };
    missingDefaults.LIVE_MESSAGING_ENABLED = undefined;
    expect(() => assertDemoSafeDefaults(missingDefaults)).toThrowError(
      'LIVE_MESSAGING_ENABLED must default to false'
    );
  });

  it('should not throw if there are extra values as long as defaults match', () => {
    const extraDefaults = { ...envDefaults, EXTRA_KEY: 'extra_value' };
    expect(() => assertDemoSafeDefaults(extraDefaults)).not.toThrow();
  });
});
