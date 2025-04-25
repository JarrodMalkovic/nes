import { Cartridge, MirroringMode } from './cartridge';

export class Memory {
  private ram: Uint8Array;        // 2KB internal RAM
  private cartridge: Cartridge;   // Cartridge reference
  private ppuRegisters: Uint8Array; // PPU registers ($2000-$2007, mirrored)
  private apuRegisters: Uint8Array; // APU and I/O registers ($4000-$4017)

  constructor(cartridge: Cartridge) {
    this.ram = new Uint8Array(2048);        // 2KB internal RAM
    this.ppuRegisters = new Uint8Array(8);  // 8 PPU registers
    this.apuRegisters = new Uint8Array(24); // 24 APU/IO registers
    this.cartridge = cartridge;
  }

  read(address: number): number {
    address &= 0xFFFF; // Ensure 16-bit address

    // CPU Internal RAM ($0000-$1FFF)
    if (address < 0x2000) {
      return this.ram[address & 0x07FF]; // Mirror every 2KB
    }

    // PPU Registers ($2000-$3FFF)
    if (address < 0x4000) {
      return this.ppuRegisters[address & 0x0007]; // Mirror every 8 bytes
    }

    // APU and I/O registers ($4000-$4017)
    if (address < 0x4018) {
      return this.apuRegisters[address - 0x4000];
    }

    // APU and I/O functionality that is normally disabled ($4018-$401F)
    if (address < 0x4020) {
      return 0;
    }

    // Cartridge space ($4020-$FFFF)
    return this.cartridge.readPrg(address);
  }

  write(address: number, value: number): void {
    address &= 0xFFFF; // Ensure 16-bit address
    value &= 0xFF;     // Ensure 8-bit value

    // CPU Internal RAM ($0000-$1FFF)
    if (address < 0x2000) {
      this.ram[address & 0x07FF] = value; // Mirror every 2KB
      return;
    }

    // PPU Registers ($2000-$3FFF)
    if (address < 0x4000) {
      this.ppuRegisters[address & 0x0007] = value; // Mirror every 8 bytes
      return;
    }

    // APU and I/O registers ($4000-$4017)
    if (address < 0x4018) {
      this.apuRegisters[address - 0x4000] = value;
      return;
    }

    // APU and I/O functionality that is normally disabled ($4018-$401F)
    if (address < 0x4020) {
      return;
    }

    // Cartridge space ($4020-$FFFF)
    this.cartridge.writePrg(address, value);
  }

  // Get a reference to the cartridge
  getCartridge(): Cartridge {
    return this.cartridge;
  }

  // Map a PPU address to physical address based on mirroring mode
  mapPpuAddress(address: number): number {
    address &= 0x3FFF; // PPU can only address 14 bits

    // Pattern tables ($0000-$1FFF)
    if (address < 0x2000) {
      return address;
    }

    // Nametables ($2000-$2FFF)
    if (address < 0x3000) {
      const mirroringMode = this.cartridge.getMirroringMode();
      const nameTable = (address - 0x2000) >> 10; // Which nametable (0-3)
      const offset = address & 0x3FF; // Offset within nametable

      switch (mirroringMode) {
        case MirroringMode.Horizontal:
          // 0,1 => 0; 2,3 => 1
          return 0x2000 + (nameTable & 2 ? 0x800 : 0) + offset;
        case MirroringMode.Vertical:
          // 0,2 => 0; 1,3 => 1
          return 0x2000 + (nameTable & 1 ? 0x800 : 0) + offset;
        case MirroringMode.SingleScreenLow:
          return 0x2000 + offset;
        case MirroringMode.SingleScreenHigh:
          return 0x2800 + offset;
        case MirroringMode.FourScreen:
          return address;
      }
    }

    // Mirror of $2000-$2EFF ($3000-$3EFF)
    if (address < 0x3F00) {
      return this.mapPpuAddress(address - 0x1000);
    }

    // Palette RAM indexes ($3F00-$3FFF)
    return 0x3F00 + (address & 0x1F);
  }
} 