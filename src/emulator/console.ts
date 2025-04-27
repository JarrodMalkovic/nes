import { CPU } from './cpu';
import { PPU } from './ppu';
import { Memory } from './memory';
import { Cartridge } from './cartridge';

export const SCREEN_WIDTH = 256;
export const SCREEN_HEIGHT = 240;

export class NesConsole {
  cpu: CPU;
  ppu: PPU;
  memory: Memory;
  cartridge: Cartridge;

  constructor(romData: Uint8Array) {
    // Initialize components in the correct order
    this.cartridge = new Cartridge(romData);
    this.memory = new Memory(this.cartridge);
    this.ppu = new PPU(this.memory);  // Pass memory to PPU for VRAM access
    this.memory.setPpu(this.ppu);     // Connect PPU to memory for register access
    this.cpu = new CPU(this.memory);
    
    // Initial reset
    this.reset();
  }

  loadRom(romData: Uint8Array): void {
    // Create new cartridge
    this.cartridge = new Cartridge(romData);
    // Update memory with new cartridge
    this.memory = new Memory(this.cartridge);
    // Update CPU and PPU with new memory
    this.ppu = new PPU(this.memory);
    this.memory.setPpu(this.ppu);     // Connect PPU to memory
    this.cpu = new CPU(this.memory);
    // Reset everything
    this.reset();
  }

  reset(): void {
    this.cpu.reset();
    this.ppu.reset();
    this.cartridge.reset();
  }

  // Run one frame of emulation
  runFrame(): Uint8ClampedArray {
    // Run CPU cycles until we complete a frame
    // A frame is 29780 cycles (341 * 262 / 3)
    // as the PPU runs at 3x the CPU clock
    for (let i = 0; i < 29780; i++) {
      this.cpu.step();
      
      // PPU runs at 3x CPU speed
      this.ppu.step();
      this.ppu.step();
      this.ppu.step();

      // Check for NMI
      if (this.ppu.checkNMI()) {
        this.cpu.triggerNMI();
      }
    }

    return this.ppu.renderFrame();
  }
} 
} 