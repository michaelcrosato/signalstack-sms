import { describe, it, expect } from 'vitest';
import { assertDemoSafeDefaults, envDefaults } from '@/lib/env/defaults';

describe('assertDemoSafeDefaults', () => {
  it('should not throw if values match defaults', () => {
    expect(() => assertDemoSafeDefaults(envDefaults)).not.toThrow();
  });

  it('should throw if a value does not match the default', () => {
    const invalidDefaults = {
      ...envDefaults,
      DEMO_MODE: 'false',
    };
    expect(() => assertDemoSafeDefaults(invalidDefaults)).toThrow('DEMO_MODE must default to true');
  });

  it('should throw if a value is missing', () => {
    const missingDefaults: Record<string, string | undefined> = {
      ...envDefaults,
    };
    delete missingDefaults.DEMO_MODE;
    expect(() => assertDemoSafeDefaults(missingDefaults)).toThrow('DEMO_MODE must default to true');
  });
});
