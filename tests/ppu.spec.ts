import { describe, it, expect, beforeEach } from 'vitest'
import { PPU, SCREEN_WIDTH, SCREEN_HEIGHT } from '../src/emulator/ppu'

describe('PPU', () => {
  let ppu: PPU;

  beforeEach(() => {
    ppu = new PPU();
  })

  describe('renderFrame', () => {
    it('should return a buffer with the correct size', () => {
      const frameBuffer = ppu.renderFrame();
      const expectedSize = SCREEN_WIDTH * SCREEN_HEIGHT * 4;
      expect(frameBuffer.length).toBe(expectedSize);
    })

    it('should return a buffer filled with black pixels (RGBA 0,0,0,255)', () => {
      const frameBuffer = ppu.renderFrame();
      const bufferSize = SCREEN_WIDTH * SCREEN_HEIGHT * 4;

      for (let i = 0; i < bufferSize; i += 4) {
        const r = frameBuffer[i + 0];
        const g = frameBuffer[i + 1];
        const b = frameBuffer[i + 2];
        const a = frameBuffer[i + 3];

        expect(r, `Pixel at index ${i/4} should have R=0`).toBe(0);
        expect(g, `Pixel at index ${i/4} should have G=0`).toBe(0);
        expect(b, `Pixel at index ${i/4} should have B=0`).toBe(0);
        expect(a, `Pixel at index ${i/4} should have A=255`).toBe(255);
      }
    })
  })
}) 