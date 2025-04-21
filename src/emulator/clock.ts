import { CPU } from './cpu';
import { PPU } from './ppu';

// NTSC master clock cycles per frame (approx. 1,789,773 Hz / 60 Hz)
// CPU runs at Master Clock / 12
// PPU runs at Master Clock / 4
// CPU cycles per frame = 1,789,773 / 12 / 60 ~= 29830 (often rounded to 29781 or similar)
// For simplicity, we'll use the user-specified value for now.
const CPU_CYCLES_PER_FRAME = 29780; // User specified value

export class Clock {
  private cpu: CPU;
  private ppu: PPU;

  constructor(cpu: CPU, ppu: PPU) {
    this.cpu = cpu;
    this.ppu = ppu;
  }

  /**
   * Executes enough CPU cycles to render one full frame and renders it.
   * NOTE: This implementation currently assumes each cpu.step() takes 1 cycle,
   * which is incorrect. A real implementation needs to track cycles per instruction.
   * @returns The rendered frame buffer.
   */
  stepFrame(): Uint8ClampedArray {
    // TODO: Implement proper cycle counting based on cpu.step() return value
    for (let i = 0; i < CPU_CYCLES_PER_FRAME; i++) {
      this.cpu.step();
      // TODO: Step other components (PPU, APU) based on cycle timing
    }

    // Render the frame after the CPU cycles are done
    const frameBuffer = this.ppu.renderFrame();
    return frameBuffer;
  }
} 