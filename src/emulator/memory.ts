import { Cartridge, MirroringMode } from './cartridge';
import { PPU } from './ppu';

export class Memory {
  private ram: Uint8Array;        // 2KB internal RAM
  private cartridge: Cartridge;   // Cartridge reference
  private ppu: PPU | null = null; // PPU reference
  private apuRegisters: Uint8Array; // APU and I/O registers ($4000-$4017)

  // PPU Register addresses
  private static readonly PPUCTRL = 0x2000;
  private static readonly PPUMASK = 0x2001;
  private static readonly PPUSTATUS = 0x2002;
  private static readonly OAMADDR = 0x2003;
  private static readonly OAMDATA = 0x2004;
  private static readonly PPUSCROLL = 0x2005;
  private static readonly PPUADDR = 0x2006;
  private static readonly PPUDATA = 0x2007;

  constructor(cartridge: Cartridge) {
    this.ram = new Uint8Array(2048);        // 2KB internal RAM
    this.apuRegisters = new Uint8Array(24); // 24 APU/IO registers
    this.cartridge = cartridge;
  }

  // Set PPU reference after construction (to avoid circular dependency)
  setPpu(ppu: PPU): void {
    this.ppu = ppu;
  }

  public read(address: number): number {
    address &= 0xFFFF;  // Ensure 16-bit address

    // CPU RAM and mirrors (0x0000-0x1FFF)
    if (address < 0x2000) {
      return this.ram[address & 0x07FF];
    }
    
    // PPU Registers ($2000-$2007, mirrored through $3FFF)
    if (address >= 0x2000 && address <= 0x3FFF) {
      const register = 0x2000 + (address & 0x7);
      if (!this.ppu) return 0;

      switch (register) {
        case 0x2000: // PPUCTRL
          return this.ppu.control;
        case 0x2001: // PPUMASK
          return this.ppu.maskRegister;
        case 0x2002: // PPUSTATUS
          return this.ppu.readStatus();
        case 0x2003: // OAMADDR
          return this.ppu.oamAddress;
        case 0x2004: // OAMDATA
          return this.ppu.readOAMData();
        case 0x2007: // PPUDATA
          return this.ppu.readData();
        default:
          return 0;
      }
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
    if (address >= 0x4020) {
      if (!this.cartridge) return 0;
      return this.cartridge.readPrg(address);
    }

    return 0;
  }

  public write(address: number, value: number): void {
    address &= 0xFFFF;  // Ensure 16-bit address
    value &= 0xFF;      // Ensure 8-bit value

    // CPU RAM and mirrors (0x0000-0x1FFF)
    if (address < 0x2000) {
      this.ram[address & 0x07FF] = value;
      return;
    }

    // PPU Registers ($2000-$2007, mirrored through $3FFF)
    if (address >= 0x2000 && address <= 0x3FFF) {
      const register = 0x2000 + (address & 0x7);
      if (!this.ppu) return;

      switch (register) {
        case 0x2000: // PPUCTRL
          this.ppu.writeControl(value);
          break;
        case 0x2001: // PPUMASK
          this.ppu.writeMask(value);
          break;
        case 0x2003: // OAMADDR
          this.ppu.writeOAMAddress(value);
          break;
        case 0x2004: // OAMDATA
          this.ppu.writeOAMData(value);
          break;
        case 0x2005: // PPUSCROLL
          this.ppu.writeScroll(value);
          break;
        case 0x2006: // PPUADDR
          this.ppu.writeAddress(value);
          break;
        case 0x2007: // PPUDATA
          this.ppu.writeData(value);
          break;
      }
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
    if (address >= 0x4020) {
      if (!this.cartridge) return;
      this.cartridge.writePrg(address, value);
    }
  }

  // Get a reference to the cartridge
  getCartridge(): Cartridge {
    return this.cartridge;
  }

  // Map PPU addresses according to mirroring rules
  mapPpuAddress(address: number): number {
    address &= 0x3FFF;  // Mirror down 0x3FFF

    // Pattern tables (0x0000-0x1FFF)
    if (address < 0x2000) {
      return address;  // Direct mapping to CHR ROM/RAM
    }

    // Nametables (0x2000-0x2FFF)
    if (address < 0x3000) {
      // Apply nametable mirroring based on cartridge's mirroring mode
      const mirroredAddr = this.cartridge.mirrorVramAddress(address);
      return mirroredAddr;
    }

    // Mirrors of 0x2000-0x2FFF (0x3000-0x3EFF)
    if (address < 0x3F00) {
      return this.mapPpuAddress(address - 0x1000);
    }

    // Palette RAM indexes (0x3F00-0x3FFF)
    return 0x3F00 | (address & 0x1F);
  }
} 