import { CPU } from './cpu';
import { Memory } from './memory';
import { Cartridge } from './cartridge';
import { PPU, SCREEN_WIDTH, SCREEN_HEIGHT } from './ppu';
import { Clock } from './clock';
// Import Controller if needed later for input handling
// import { Controller } from './controller';

// Re-export constants needed by the UI
export { SCREEN_WIDTH, SCREEN_HEIGHT };

export class NesConsole {
  public readonly cpu: CPU;
  public readonly ppu: PPU;
  public readonly memory: Memory;
  public readonly cartridge: Cartridge;
  public readonly clock: Clock;
  // public readonly controller1: Controller;

  constructor(romData: Uint8Array) {
    this.cartridge = new Cartridge(romData);
    this.memory = new Memory(this.cartridge);
    this.cpu = new CPU(this.memory);
    this.ppu = new PPU(this.memory); // Instantiate PPU
    this.clock = new Clock(this.cpu, this.ppu); // Instantiate Clock
    // this.controller1 = new Controller(); // Instantiate Controller later

    // CPU reset is called in its constructor, which reads the reset vector
    // via the memory/cartridge system.
  }

  /**
   * Runs the emulator for one frame and returns the video buffer.
   */
  runFrame(): Uint8ClampedArray {
    return this.clock.stepFrame();
  }

  // TODO: Add methods for controller input
  // pressButton(button: NesButton): void { this.controller1.press(button); }
  // releaseButton(button: NesButton): void { this.controller1.release(button); }
} 