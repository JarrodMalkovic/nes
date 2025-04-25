import { Memory } from './memory';

export const SCREEN_WIDTH = 256;
export const SCREEN_HEIGHT = 240;

// PPU Memory Map Constants
const PATTERN_TABLE_0 = 0x0000;
const PATTERN_TABLE_1 = 0x1000;
const NAMETABLE_0 = 0x2000;
const NAMETABLE_1 = 0x2400;
const NAMETABLE_2 = 0x2800;
const NAMETABLE_3 = 0x2C00;
const PALETTE_RAM = 0x3F00;

// PPU Register Addresses (CPU Bus)
const PPUCTRL = 0x2000;   // $2000 Control
const PPUMASK = 0x2001;   // $2001 Mask
const PPUSTATUS = 0x2002; // $2002 Status
const OAMADDR = 0x2003;   // $2003 OAM Address
const OAMDATA = 0x2004;   // $2004 OAM Data
const PPUSCROLL = 0x2005; // $2005 Scroll
const PPUADDR = 0x2006;   // $2006 Address
const PPUDATA = 0x2007;   // $2007 Data

export class PPU {
  // Static palette data
  static readonly PALETTE: number[] = [
    0x7C7C7C, 0x0000FC, 0x0000BC, 0x4428BC, 0x940084, 0xA80020, 0xA81000, 0x881400,
    0x503000, 0x007800, 0x006800, 0x005800, 0x004058, 0x000000, 0x000000, 0x000000,
    0xBCBCBC, 0x0078F8, 0x0058F8, 0x6844FC, 0xD800CC, 0xE40058, 0xF83800, 0xE45C10,
    0xAC7C00, 0x00B800, 0x00A800, 0x00A844, 0x008888, 0x000000, 0x000000, 0x000000
  ];

  private memory: Memory;
  private vram: Uint8Array;
  private oam: Uint8Array;
  private frameBuffer: Uint8ClampedArray;
  private paletteRam: Uint8Array;  // 32 bytes of palette RAM
  private cycle = 0;
  private scanline = 0;
  private frame = 0;
  private nmiOccurred = 0;  // Using 0/1 instead of boolean for NES accuracy

  // PPU registers
  private ctrl = 0;     // Control register ($2000)
  private mask = 0;     // Mask register ($2001)
  private status = 0;   // Status register ($2002)
  private data = 0;     // Data register ($2007)
  private v = 0;        // Current VRAM address (15 bits)
  private t = 0;        // Temporary VRAM address (15 bits)
  private x = 0;        // Fine X scroll (3 bits)
  private w = 0;        // First or second write toggle (1 bit)
  private oamAddr = 0;  // OAM address register ($2003)
  private nmiOutput = 0;// NMI output level

  // Background shift registers and tile data
  private bgShiftRegLow = 0;
  private bgShiftRegHigh = 0;
  private bgAttrShiftLow = 0;
  private bgAttrShiftHigh = 0;
  private bgTileLow = 0;
  private bgTileHigh = 0;

  // Sprite evaluation state
  private spriteCount = 0;
  private spriteZeroHitPossible = 0;
  private spritePositions: number[] = new Array(8).fill(0);
  private spritePatterns: number[] = new Array(8).fill(0);
  private spriteAttributes: number[] = new Array(8).fill(0);
  private spriteIndexes: number[] = new Array(8).fill(0);

  // Background rendering state
  private bgAttributeLatch = 0;
  private bgNameTable = 0;
  private bgPatternTable = 0;

  // PPU registers and flags
  private nmiEnabled = 0;
  private masterSlave = 0;
  private spriteSize = 0;
  private bgPatternAddr = 0;
  private grayscale = 0;
  private showLeftBackground = 0;
  private showLeftSprites = 0;
  private showBackground = 0;
  private showSprites = 0;
  private spritePatternTable = 0;

  // OAM and sprite data
  private secondaryOam: number[] = new Array(32).fill(0);
  private oamMemory: number[] = new Array(256).fill(0);

  constructor(memory: Memory) {
    this.memory = memory;
    this.vram = new Uint8Array(2048);  // 2KB of VRAM
    this.oam = new Uint8Array(256);    // 256 bytes of Object Attribute Memory
    this.frameBuffer = new Uint8ClampedArray(256 * 240 * 4); // RGBA buffer
    this.paletteRam = new Uint8Array(32); // 32 bytes of palette RAM
    this.reset();
  }

  reset(): void {
    this.cycle = 0;
    this.scanline = 0;
    this.frame = 0;
    this.nmiOccurred = 0;
    this.ctrl = 0;
    this.mask = 0;
    this.status = 0;
    this.data = 0;
    this.v = 0;
    this.t = 0;
    this.x = 0;
    this.w = 0;
    this.oamAddr = 0;
    this.nmiOutput = 0;
    this.spriteCount = 0;
    this.spriteZeroHitPossible = 0;
    this.bgShiftRegLow = 0;
    this.bgShiftRegHigh = 0;
    this.bgAttrShiftLow = 0;
    this.bgAttrShiftHigh = 0;
    this.bgTileLow = 0;
    this.bgTileHigh = 0;
    this.spritePositions.fill(0);
    this.spritePatterns.fill(0);
    this.spriteAttributes.fill(0);
    this.spriteIndexes.fill(0);
    this.vram.fill(0);
    this.oam.fill(0);
    this.paletteRam.fill(0);
    this.frameBuffer.fill(0);
  }

  step(): void {
    // Pre-render scanline (-1 or 261)
    if (this.scanline === 261) {
      if (this.cycle === 1) {
        this.status &= ~0x80; // Clear VBlank
        this.status &= ~0x40; // Clear sprite 0 hit
        this.status &= ~0x20; // Clear sprite overflow
      }
    }
    
    // Visible scanlines (0-239)
    if (this.scanline < 240) {
      // Visible cycles (0-255)
      if (this.cycle >= 1 && this.cycle <= 256) {
        this.renderPixel();
        this.fetchBackgroundTile();
        this.updateShiftRegisters();
      }
      
      // Sprite evaluation for next line
      if (this.cycle === 257) {
        this.evaluateSprites();
      }
    }
    
    // Post-render scanline (240)
    // VBlank scanlines (241-260)
    if (this.scanline === 241 && this.cycle === 1) {
      this.status |= 0x80; // Set VBlank flag
      if (this.nmiEnabled) {
        this.nmiOccurred = 1;
      }
    }

    // Increment counters
    this.cycle++;
    if (this.cycle > 340) {
      this.cycle = 0;
      this.scanline++;
      if (this.scanline > 261) {
        this.scanline = 0;
        this.frame++;
      }
    }
  }

  checkNMI(): number {
    if (this.nmiOccurred === 1) {
      this.nmiOccurred = 0;
      return 1;
    }
    return 0;
  }

  renderFrame(): Uint8ClampedArray {
    // Only return the frame buffer when we're in VBlank
    if (this.scanline >= 241 && this.scanline <= 260) {
      return this.frameBuffer;
    }
    // If not in VBlank, return the previous frame
    return this.frameBuffer;
  }

  // Read from PPU registers (CPU perspective)
  readRegister(address: number): number {
    switch (address) {
      case PPUSTATUS: {
        // Read status register
        const result = (this.status & 0xE0) | (this.data & 0x1F);
        // Clear VBlank flag
        this.status &= 0x7F;
        // Reset address latch
        this.w = 0;
        return result;
      }
      case OAMDATA:
        return this.readOAM(this.oamAddr);
      case PPUDATA: {
        // Get data from internal buffer
        const result = this.data;
        // Read from current VRAM address
        this.data = this.readVRAM(this.v);
        // Increment address
        this.v += this.getVRAMIncrement();
        return result;
      }
      default:
        return 0;
    }
  }

  // Write to PPU registers (CPU perspective)
  writeRegister(address: number, value: number): void {
    switch (address) {
      case PPUCTRL:
        this.ctrl = value;
        this.updateControlRegister(value);
        this.nmiOutput = Number((value & 0x80) !== 0);
        this.t = (this.t & 0xF3FF) | ((value & 0x03) << 10);
        break;
      case PPUMASK:
        this.mask = value;
        this.updateMaskRegister(value);
        break;
      case OAMADDR:
        this.oamAddr = value;
        break;
      case OAMDATA:
        this.writeOAM(this.oamAddr, value);
        this.oamAddr = (this.oamAddr + 1) & 0xFF;
        break;
      case PPUSCROLL:
        if (!this.w) {
          // First write (X scroll)
          this.x = value & 0x07;
          this.t = (this.t & 0xFFE0) | (value >> 3);
        } else {
          // Second write (Y scroll)
          this.t = (this.t & 0x8FFF) | ((value & 0x07) << 12);
          this.t = (this.t & 0xFC1F) | ((value & 0xF8) << 2);
        }
        this.w = Number(!this.w);
        break;
      case PPUADDR:
        if (!this.w) {
          // First write (high byte)
          this.t = (this.t & 0x80FF) | ((value & 0x3F) << 8);
        } else {
          // Second write (low byte)
          this.t = (this.t & 0xFF00) | value;
          this.v = this.t;
        }
        this.w = Number(!this.w);
        break;
      case PPUDATA:
        this.writeVRAM(this.v, value);
        this.v += this.getVRAMIncrement();
        break;
    }
  }

  // Read from PPU memory (internal)
  private readVRAM(address: number): number {
    const mappedAddr = this.memory.mapPpuAddress(address);
    
    if (mappedAddr >= 0x3F00 && mappedAddr < 0x4000) {
      // Palette RAM
      return this.paletteRam[mappedAddr & 0x1F];
    }
    
    return this.vram[mappedAddr & 0x0FFF];
  }

  // Write to PPU memory (internal)
  private writeVRAM(address: number, value: number): void {
    const mappedAddr = this.memory.mapPpuAddress(address);
    
    if (mappedAddr >= 0x3F00 && mappedAddr < 0x4000) {
      // Palette RAM
      this.paletteRam[mappedAddr & 0x1F] = value;
    } else {
      this.vram[mappedAddr & 0x0FFF] = value;
    }
  }

  // Get VRAM address increment amount (controlled by PPUCTRL)
  private getVRAMIncrement(): number {
    return (this.ctrl & 0x04) ? 32 : 1;
  }

  // Render current pixel with background and sprites
  private renderPixel(): void {
    if (!(this.mask & 0x08) && !(this.mask & 0x10)) return; // Both rendering disabled

    const x = this.cycle - 1;
    const y = this.scanline;
    
    if (x < 0 || x >= SCREEN_WIDTH || y < 0 || y >= SCREEN_HEIGHT) return;

    let bgPixel = 0;
    let bgPalette = 0;

    // Get background pixel if enabled
    if (this.mask & 0x08) {
      bgPixel = this.getBackgroundPixel();
      bgPalette = this.getPaletteIndex(bgPixel);
    }

    let spritePixel = 0;
    let spritePalette = 0;
    let spritePriority = 0;

    // Get sprite pixel if enabled
    if (this.mask & 0x10) {
      for (let i = 0; i < this.spriteCount; i++) {
        const offset = x - this.spritePositions[i];
        if (offset < 0 || offset > 7) continue;

        // Get sprite pixel
        const pattern = this.spritePatterns[i * 2 + 1] << 8 | this.spritePatterns[i * 2];
        const attributes = this.spriteAttributes[i];
        const flipHorizontal = (attributes & 0x40) !== 0;
        const pixelBit = flipHorizontal ? offset : 7 - offset;
        const pixel = (pattern >> (pixelBit * 2)) & 0x03;

        if (pixel === 0) continue; // Transparent pixel

        // Check sprite zero hit
        if (this.spriteIndexes[i] === 0 && this.spriteZeroHitPossible && (this.mask & 0x18) === 0x18) {
          if (bgPixel !== 0 && x < 255) {
            this.status |= 0x40; // Set sprite zero hit flag
          }
        }

        spritePixel = pixel;
        spritePalette = ((attributes & 0x03) << 2) | pixel;
        spritePriority = (attributes & 0x20) !== 0 ? 1 : 0;
        break;
      }
    }

    // Determine final pixel color
    let paletteIndex: number;

    if (bgPixel === 0 && spritePixel === 0) {
      paletteIndex = 0;
    } else if (bgPixel === 0) {
      paletteIndex = 0x10 | spritePalette;
    } else if (spritePixel === 0) {
      paletteIndex = bgPalette;
    } else {
      if (spritePriority === 0) {
        paletteIndex = 0x10 | spritePalette;
      } else {
        paletteIndex = bgPalette;
      }
    }

    // Get color from palette and write to frame buffer
    const color = PPU.PALETTE[this.paletteRam[paletteIndex]];
    const index = (y * SCREEN_WIDTH + x) * 4;
    this.frameBuffer[index + 0] = (color >> 16) & 0xFF; // R
    this.frameBuffer[index + 1] = (color >> 8) & 0xFF;  // G
    this.frameBuffer[index + 2] = color & 0xFF;         // B
    this.frameBuffer[index + 3] = 255;                  // A
  }

  // Get background pixel from shift registers
  private getBackgroundPixel(): number {
    if (!(this.mask & 0x08)) return 0;

    // Get bit position in shift register
    const xFine = (7 - this.x);

    // Get background pixel bits
    const pixel = (
      ((this.bgShiftRegHigh >> xFine) & 1) << 1 |
      ((this.bgShiftRegLow >> xFine) & 1)
    );

    // Get attribute bits
    const attribute = (
      ((this.bgAttrShiftHigh >> xFine) & 1) << 1 |
      ((this.bgAttrShiftLow >> xFine) & 1)
    );

    return (attribute << 2) | pixel;
  }

  // Load background shift registers for next tile
  private loadBackgroundShifters(): void {
    // Load pattern table shift registers
    this.bgShiftRegLow = (this.bgShiftRegLow & 0xFF00) | this.bgTileLow;
    this.bgShiftRegHigh = (this.bgShiftRegHigh & 0xFF00) | this.bgTileHigh;

    // Load attribute shift registers
    const attributeBits = ((this.bgAttributeLatch >> ((this.v >> 4) & 4)) & 3) << 6;
    this.bgAttrShiftLow = (this.bgAttrShiftLow & 0xFF00) | ((attributeBits & 0x01) ? 0xFF : 0x00);
    this.bgAttrShiftHigh = (this.bgAttrShiftHigh & 0xFF00) | ((attributeBits & 0x02) ? 0xFF : 0x00);
  }

  // Update background shift registers
  private updateShiftRegisters(): void {
    if (!(this.mask & 0x08)) return;

    this.bgShiftRegLow <<= 1;
    this.bgShiftRegHigh <<= 1;
    this.bgAttrShiftLow <<= 1;
    this.bgAttrShiftHigh <<= 1;
  }

  // Fetch background tile data
  private fetchBackgroundTile(): void {
    switch (this.cycle % 8) {
      case 1: // Nametable byte
        {
          const addr = 0x2000 | (this.v & 0x0FFF);
          this.bgNameTable = this.readVRAM(addr);
        }
        break;

      case 3: // Attribute byte
        {
          const addr = 0x23C0 | (this.v & 0x0C00) | ((this.v >> 4) & 0x38) | ((this.v >> 2) & 0x07);
          this.bgAttributeLatch = this.readVRAM(addr);
        }
        break;

      case 5: // Background tile low byte
        {
          const fineY = (this.v >> 12) & 7;
          const addr = (this.bgPatternTable << 12) | (this.bgNameTable << 4) | fineY;
          this.bgTileLow = this.readVRAM(addr);
        }
        break;

      case 7: // Background tile high byte
        {
          const fineY = (this.v >> 12) & 7;
          const addr = (this.bgPatternTable << 12) | (this.bgNameTable << 4) | fineY | 8;
          this.bgTileHigh = this.readVRAM(addr);
          this.loadBackgroundShifters();
        }
        break;
    }
  }

  // Get final palette index for a pixel
  private getPaletteIndex(pixel: number): number {
    if (pixel === 0) return 0;
    return pixel;
  }

  // Evaluate sprites for next scanline
  private evaluateSprites(): void {
    if (!(this.mask & 0x10)) return;

    // Clear secondary OAM
    this.secondaryOam.fill(0xFF);
    this.spriteCount = 0;
    let spriteHeight = this.spriteSize ? 16 : 8;
    let n = 0;
    this.spriteZeroHitPossible = Number(false);

    // Evaluate each sprite
    for (let i = 0; i < 64 && n < 8; i++) {
      const y = this.oamMemory[i * 4 + 0];
      const tile = this.oamMemory[i * 4 + 1];
      const attributes = this.oamMemory[i * 4 + 2];
      const x = this.oamMemory[i * 4 + 3];

      const row = this.scanline - y;
      if (row < 0 || row >= spriteHeight) continue;

      // Add sprite to secondary OAM
      if (n < 8) {
        if (i === 0) {
          this.spriteZeroHitPossible = Number(true);
        }

        this.spriteIndexes[n] = i;
        this.spritePositions[n] = x;
        this.spriteAttributes[n] = attributes;
        
        // Calculate pattern address
        let patternAddr: number;
        if (!this.spriteSize) {
          // 8x8 sprite
          const table = this.spritePatternTable;
          const flipVertical = (attributes & 0x80) !== 0;
          const patternRow = flipVertical ? 7 - row : row;
          patternAddr = (table << 12) | (tile << 4) | patternRow;
        } else {
          // 8x16 sprite
          const table = tile & 0x01;
          const flipVertical = (attributes & 0x80) !== 0;
          let patternRow = flipVertical ? 15 - row : row;
          patternAddr = (table << 12) | ((tile & 0xFE) << 4) | ((patternRow & 0x08) << 1) | (patternRow & 0x07);
        }

        // Fetch pattern data
        this.spritePatterns[n * 2] = this.readVRAM(patternAddr);
        this.spritePatterns[n * 2 + 1] = this.readVRAM(patternAddr + 8);
        n++;
      }
    }

    // Set sprite overflow flag
    if (n > 8) {
      this.status |= 0x20;
      n = 8;
    }

    this.spriteCount = n;
  }

  // Update PPUCTRL ($2000) with sprite-specific flags
  private updateControlRegister(value: number): void {
    this.nmiEnabled = this.convertBoolToNum((value & 0x80) !== 0);
    this.masterSlave = this.convertBoolToNum((value & 0x40) !== 0);
    this.spriteSize = this.convertBoolToNum((value & 0x20) !== 0);
    this.bgPatternAddr = this.convertBoolToNum((value & 0x10) !== 0);
    this.spritePatternTable = this.convertBoolToNum((value & 0x08) !== 0);
  }

  private updateMaskRegister(value: number): void {
    this.grayscale = this.convertBoolToNum((value & 0x01) !== 0);
    this.showLeftBackground = this.convertBoolToNum((value & 0x02) !== 0);
    this.showLeftSprites = this.convertBoolToNum((value & 0x04) !== 0);
    this.showBackground = this.convertBoolToNum((value & 0x08) !== 0);
    this.showSprites = this.convertBoolToNum((value & 0x10) !== 0);
  }

  // Convert boolean to number where needed
  private convertBoolToNum(value: boolean): number {
    return value ? 1 : 0;
  }

  // Replace oamMemory with oam
  private readOAM(addr: number): number {
    return this.oam[addr];
  }

  private writeOAM(addr: number, value: number): void {
    this.oam[addr] = value;
  }
} 