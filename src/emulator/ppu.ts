export const SCREEN_WIDTH = 256;
export const SCREEN_HEIGHT = 240;

export class PPU {
  // TODO: Add PPU registers, VRAM, OAM, etc.

  constructor() {
    // TODO: Initialize PPU state
  }

  step(): void {
    // TODO: Implement PPU cycle emulation
  }

  /**
   * Renders the current PPU output into a single frame buffer.
   * For now, it just returns a black screen.
   * @returns A Uint8ClampedArray representing the frame in RGBA format.
   */
  renderFrame(): Uint8ClampedArray {
    const bufferSize = SCREEN_WIDTH * SCREEN_HEIGHT * 4; // 4 bytes per pixel (RGBA)
    const frameBuffer = new Uint8ClampedArray(bufferSize);

    for (let i = 0; i < bufferSize; i += 4) {
      frameBuffer[i + 0] = 0;   // R
      frameBuffer[i + 1] = 0;   // G
      frameBuffer[i + 2] = 0;   // B
      frameBuffer[i + 3] = 255; // A (Opaque)
    }

    return frameBuffer;
  }
} 