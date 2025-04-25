import { CPU } from './cpu';
import { PPU } from './ppu';

// NTSC timing constants
const MASTER_CLOCK_HZ = 21477272; // ~21.48 MHz (NTSC)
const CPU_DIVIDER = 12;           // CPU clock = Master / 12
const PPU_DIVIDER = 4;            // PPU clock = Master / 4

// Derived constants
const CPU_CLOCK_HZ = MASTER_CLOCK_HZ / CPU_DIVIDER;  // ~1.79 MHz
const PPU_CLOCK_HZ = MASTER_CLOCK_HZ / PPU_DIVIDER;  // ~5.37 MHz
const FPS = 60;

// Cycles per frame
const MASTER_CYCLES_PER_FRAME = Math.floor(MASTER_CLOCK_HZ / FPS);
const CPU_CYCLES_PER_FRAME = Math.floor(CPU_CLOCK_HZ / FPS);    // ~29780
const PPU_CYCLES_PER_FRAME = Math.floor(PPU_CLOCK_HZ / FPS);    // ~89341

export class Clock {
  private cpu: CPU;
  private ppu: PPU;
  
  // Cycle counters
  private masterCycles = 0;
  private cpuCycles = 0;
  private ppuCycles = 0;

  constructor(cpu: CPU, ppu: PPU) {
    this.cpu = cpu;
    this.ppu = ppu;
  }

  /**
   * Executes enough CPU cycles to render one full frame.
   * Properly synchronizes CPU and PPU cycles based on the master clock.
   * @returns The rendered frame buffer.
   */
  stepFrame(): Uint8ClampedArray {
    // Reset cycle counters for this frame
    this.masterCycles = 0;
    this.cpuCycles = 0;
    this.ppuCycles = 0;

    // Run until we've completed a frame
    while (this.cpuCycles < CPU_CYCLES_PER_FRAME) {
      // Execute one CPU instruction and get its cycle count
      const cpuInstructionCycles = this.cpu.step();
      this.cpuCycles += cpuInstructionCycles;

      // Calculate how many master cycles this CPU instruction took
      const masterCyclesForCPU = cpuInstructionCycles * CPU_DIVIDER;
      this.masterCycles += masterCyclesForCPU;

      // Calculate how many PPU cycles should run
      const ppuCyclesToRun = Math.floor(masterCyclesForCPU / PPU_DIVIDER);
      
      // Run the PPU for the appropriate number of cycles
      for (let i = 0; i < ppuCyclesToRun; i++) {
        this.ppu.step();
        this.ppuCycles++;
      }
    }

    // Render the frame after all cycles are complete
    return this.ppu.renderFrame();
  }

  /**
   * Returns the current cycle counts for debugging/testing
   */
  getCycleCounts() {
    return {
      master: this.masterCycles,
      cpu: this.cpuCycles,
      ppu: this.ppuCycles
    };
  }
} 