import { describe, it, expect, beforeEach } from 'vitest'
import { APU } from '../src/emulator/apu'

describe('APU', () => {
  let apu: APU;

  beforeEach(() => {
    apu = new APU();
  })

  it('should instantiate without errors', () => {
    expect(apu).toBeInstanceOf(APU);
  })

  it('should have initial register structures', () => {
    expect(apu.pulse1).toBeDefined();
    expect(apu.pulse2).toBeDefined();
    expect(apu.triangle).toBeDefined();
    expect(apu.noise).toBeDefined();
    expect(apu.dmc).toBeDefined();
    expect(apu.status).toBe(0);
    expect(apu.frameCounter).toBe(0);
  })

  it('step(0) should not throw and internal state should remain unchanged initially', () => {
    const initialPulse1 = { ...apu.pulse1 };
    const initialTriangle = { ...apu.triangle };
    const initialStatus = apu.status;

    expect(() => apu.step(0)).not.toThrow();

    // Verify registers haven't changed (as step is a stub)
    expect(apu.pulse1).toEqual(initialPulse1);
    expect(apu.triangle).toEqual(initialTriangle);
    expect(apu.status).toBe(initialStatus);
    // Note: We didn't check cycleCounter as that *is* expected to change.
  })

  it('step(10) should not throw', () => {
    // Check with non-zero cycles
    expect(() => apu.step(10)).not.toThrow();
  })
}) 