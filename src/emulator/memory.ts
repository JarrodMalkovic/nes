import { Cartridge } from './cartridge';

export class Memory {
  private ram: Uint8Array;
  private cartridge: Cartridge | null = null;

  constructor() {
    // 2KB of internal RAM
    this.ram = new Uint8Array(0x0800);
  }

  loadCartridge(cartridge: Cartridge): void {
    this.cartridge = cartridge;
  }

  read(address: number): number {
    const addr = address & 0xFFFF;

    if (addr < 0x2000) {
      // RAM range (0x0000-0x1FFF), mirrored every 0x800 bytes
      return this.ram[addr % 0x0800];
    } else if (addr >= 0x2000 && addr < 0x4000) {
      // PPU registers (0x2000-0x2007), mirrored every 8 bytes
      return 0;
    } else if (addr >= 0x8000) {
      // Cartridge PRG ROM space (0x8000-0xFFFF)
      if (!this.cartridge) {
        // console.warn(`Read from cartridge space (0x${addr.toString(16)}) with no cartridge loaded`);
        return 0;
      }
      // Simple NROM mapping (Mapper 0)
      const numPrgBanks = this.cartridge.prgBanks.length;
      if (numPrgBanks === 1) {
        // 16KB PRG ROM, mirrored at 0xC000
        const prgAddress = (addr - 0x8000) % 0x4000; // Map 0x8000-0xFFFF -> 0x0000-0x3FFF
        return this.cartridge.prgBanks[0][prgAddress];
      } else if (numPrgBanks === 2) {
        // 32KB PRG ROM
        const prgAddress = addr - 0x8000; // Map 0x8000-0xFFFF -> 0x0000-0x7FFF
        const bankIndex = Math.floor(prgAddress / (16 * 1024));
        const offsetInBank = prgAddress % (16 * 1024);
        return this.cartridge.prgBanks[bankIndex][offsetInBank];
      } else {
        // console.warn(`Unsupported number of PRG banks (${numPrgBanks}) for NROM mapping`);
        return 0;
      }
    } else {
      // Unhandled reads (e.g., APU/IO 0x4000-0x401F, Expansion ROM 0x4020-0x5FFF, SRAM 0x6000-0x7FFF)
      // console.log(`Read from unhandled address 0x${addr.toString(16)}`);
      return 0;
    }
  }

  write(address: number, value: number): void {
    const addr = address & 0xFFFF;
    const val = value & 0xFF;

    if (addr < 0x2000) {
      // RAM range (0x0000-0x1FFF), mirrored every 0x800 bytes
      this.ram[addr % 0x0800] = val;
    } else if (addr >= 0x2000 && addr < 0x4000) {
      // PPU registers (0x2000-0x2007), mirrored every 8 bytes
      return;
    } else if (addr >= 0x8000) {
      // Attempted write to PRG ROM space - typically ignored for NROM
      // console.warn(`Write to PRG ROM space ignored: 0x${addr.toString(16)} = 0x${val.toString(16)}`);
    } else {
      // Unhandled writes (e.g., APU/IO, SRAM)
      // console.log(`Write to unhandled address 0x${addr.toString(16)} value 0x${val.toString(16)}`);
    }
  }
} 