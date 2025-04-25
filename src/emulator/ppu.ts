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
  // PPU Memory
  private vram: Uint8Array;       // 16KB of VRAM
  private oamMemory: Uint8Array;  // 256 bytes of Object Attribute Memory
  private paletteRam: Uint8Array; // 32 bytes of Palette RAM

  // PPU Registers
  private ctrl: number;     // PPUCTRL   ($2000) write
  private mask: number;     // PPUMASK   ($2001) write
  private status: number;   // PPUSTATUS ($2002) read
  private oamAddr: number;  // OAMADDR   ($2003) write
  private scroll: number;   // PPUSCROLL ($2005) write x2
  private addr: number;     // PPUADDR   ($2006) write x2
  private data: number;     // PPUDATA   ($2007) read/write

  // Internal registers
  private v: number;  // Current VRAM address (15 bits)
  private t: number;  // Temporary VRAM address (15 bits)
  private x: number;  // Fine X scroll (3 bits)
  private w: boolean; // First or second write toggle

  // Rendering state
  private scanline: number;
  private cycle: number;
  private frame: number;
  private frameBuffer: Uint8ClampedArray;

  // NMI Flag
  private nmiOccurred: boolean;
  private nmiOutput: boolean;
  private nmiPrevious: boolean;
  private nmiDelay: number;

  // NES Color Palette (RGB values)
  private static readonly PALETTE = new Uint32Array([
    0xFF757575, 0xFF271B8F, 0xFF0000AB, 0xFF47009F, 0xFF8F0077, 0xFFAB0013, 0xFFA70000, 0xFF7F0B00,
    0xFF432F00, 0xFF004700, 0xFF005100, 0xFF003F17, 0xFF1B3F5F, 0xFF000000, 0xFF000000, 0xFF000000,
    0xFFBCBCBC, 0xFF0073EF, 0xFF233BEF, 0xFF8300F3, 0xFFBF00BF, 0xFFE7005B, 0xFFDB2B00, 0xFFCB4F0F,
    0xFF8B7300, 0xFF009700, 0xFF00AB00, 0xFF00933B, 0xFF00838B, 0xFF000000, 0xFF000000, 0xFF000000,
    0xFFFFFFFF, 0xFF3FBFFF, 0xFF5F97FF, 0xFFA78BFD, 0xFFF77BFF, 0xFFFF77B7, 0xFFFF7763, 0xFFFF9B3B,
    0xFFF3BF3F, 0xFF83D313, 0xFF4FDF4B, 0xFF58F898, 0xFF00EBDB, 0xFF000000, 0xFF000000, 0xFF000000,
    0xFFFFFFFF, 0xFFABE7FF, 0xFFC7D7FF, 0xFFD7CBFF, 0xFFFFC7FF, 0xFFFFC7DB, 0xFFFFBFB3, 0xFFFFDBAB,
    0xFFFFE7A3, 0xFFE3FFA3, 0xFFABF3BF, 0xFFB3FFCF, 0xFF9FFFF3, 0xFF000000, 0xFF000000, 0xFF000000
  ]);

  // Background rendering state
  private bgPatternTable: number;    // Pattern table selection for background (0 or 1)
  private bgNameTable: number;       // Base nametable address
  private bgTileLow: number;        // Low byte of background tile
  private bgTileHigh: number;       // High byte of background tile
  private bgAttributeLatch: number; // Current attribute byte
  private bgShiftRegLow: number;    // Low background shift register
  private bgShiftRegHigh: number;   // High background shift register
  private bgAttrShiftLow: number;   // Low attribute shift register
  private bgAttrShiftHigh: number;  // High attribute shift register

  // Sprite rendering state
  private spritePatternTable: number;   // Pattern table selection for sprites (0 or 1)
  private spriteSize: boolean;          // false = 8x8, true = 8x16
  private spriteCount: number;          // Number of sprites on current scanline
  private spriteZeroHitPossible: boolean;
  private spriteZeroBeingRendered: boolean;

  // Secondary OAM
  private secondaryOam: Uint8Array;     // 32 bytes for 8 sprites
  private spritePatterns: Uint8Array;   // Pattern data for current scanline sprites
  private spritePositions: Uint8Array;  // X positions for current scanline sprites
  private spriteAttributes: Uint8Array;  // Attributes for current scanline sprites
  private spriteIndexes: Uint8Array;    // Sprite indexes for sprite zero hit detection

  constructor() {
    // Initialize memory
    this.vram = new Uint8Array(0x4000);        // 16KB VRAM
    this.oamMemory = new Uint8Array(256);      // 256B OAM
    this.paletteRam = new Uint8Array(32);      // 32B Palette RAM
    this.frameBuffer = new Uint8ClampedArray(SCREEN_WIDTH * SCREEN_HEIGHT * 4);

    // Initialize registers
    this.ctrl = 0;
    this.mask = 0;
    this.status = 0;
    this.oamAddr = 0;
    this.scroll = 0;
    this.addr = 0;
    this.data = 0;

    // Initialize internal state
    this.v = 0;
    this.t = 0;
    this.x = 0;
    this.w = false;

    // Initialize rendering position
    this.scanline = 0;
    this.cycle = 0;
    this.frame = 0;

    // Initialize NMI flags
    this.nmiOccurred = false;
    this.nmiOutput = false;
    this.nmiPrevious = false;
    this.nmiDelay = 0;

    // Initialize background rendering state
    this.bgPatternTable = 0;
    this.bgNameTable = 0;
    this.bgTileLow = 0;
    this.bgTileHigh = 0;
    this.bgAttributeLatch = 0;
    this.bgShiftRegLow = 0;
    this.bgShiftRegHigh = 0;
    this.bgAttrShiftLow = 0;
    this.bgAttrShiftHigh = 0;

    // Initialize sprite rendering state
    this.spritePatternTable = 0;
    this.spriteSize = false;
    this.spriteCount = 0;
    this.spriteZeroHitPossible = false;
    this.spriteZeroBeingRendered = false;

    // Initialize secondary OAM
    this.secondaryOam = new Uint8Array(32);
    this.spritePatterns = new Uint8Array(8 * 2);  // 8 sprites, 2 bytes each
    this.spritePositions = new Uint8Array(8);
    this.spriteAttributes = new Uint8Array(8);
    this.spriteIndexes = new Uint8Array(8);
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
        this.w = false;
        return result;
      }
      case OAMDATA:
        return this.oamMemory[this.oamAddr];
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
        this.updatePPUCTRL(value);
        this.nmiOutput = (value & 0x80) !== 0;
        this.t = (this.t & 0xF3FF) | ((value & 0x03) << 10);
        break;
      case PPUMASK:
        this.mask = value;
        break;
      case OAMADDR:
        this.oamAddr = value;
        break;
      case OAMDATA:
        this.oamMemory[this.oamAddr] = value;
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
        this.w = !this.w;
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
        this.w = !this.w;
        break;
      case PPUDATA:
        this.writeVRAM(this.v, value);
        this.v += this.getVRAMIncrement();
        break;
    }
  }

  // Read from PPU memory (internal)
  private readVRAM(address: number): number {
    address &= 0x3FFF;
    
    if (address >= 0x3F00 && address < 0x4000) {
      // Palette RAM
      return this.paletteRam[address & 0x1F];
    }
    
    return this.vram[address];
  }

  // Write to PPU memory (internal)
  private writeVRAM(address: number, value: number): void {
    address &= 0x3FFF;
    
    if (address >= 0x3F00 && address < 0x4000) {
      // Palette RAM
      this.paletteRam[address & 0x1F] = value;
    } else {
      this.vram[address] = value;
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
    this.spriteZeroHitPossible = false;

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
          this.spriteZeroHitPossible = true;
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

  // Execute one PPU cycle with background and sprite rendering
  step(): void {
    if (this.scanline >= -1 && this.scanline < 240) {
      // Visible scanlines (and pre-render line)
      if (this.scanline === -1 && this.cycle === 1) {
        // Clear VBlank, sprite 0 hit, and sprite overflow flags
        this.status &= ~0xE0;
      }

      if ((this.cycle >= 1 && this.cycle <= 256) || (this.cycle >= 321 && this.cycle <= 336)) {
        this.updateShiftRegisters();
        this.fetchBackgroundTile();
      }

      if (this.cycle >= 1 && this.cycle <= 256) {
        this.renderPixel();
      }

      // Update vertical scroll
      if (this.cycle === 256) {
        this.incrementVerticalScroll();
      }

      // Update horizontal scroll
      if (this.cycle === 257) {
        this.copyHorizontalBits();
      }

      // Vertical scroll bits from t to v
      if (this.scanline === -1 && this.cycle >= 280 && this.cycle <= 304) {
        this.copyVerticalBits();
      }

      // Sprite evaluation (on cycle 257-320)
      if (this.cycle === 257) {
        this.evaluateSprites();
      }
    }

    if (this.scanline === 241 && this.cycle === 1) {
      // Start VBlank
      this.status |= 0x80;
      if (this.nmiOutput && !this.nmiOccurred) {
        this.nmiOccurred = true;
      }
    }

    // Advance cycle and scanline counters
    this.cycle++;
    if (this.cycle > 340) {
      this.cycle = 0;
      this.scanline++;
      if (this.scanline > 260) {
        this.scanline = -1;
        this.frame++;
      }
    }
  }

  // Increment vertical scroll
  private incrementVerticalScroll(): void {
    if (!(this.mask & 0x08)) return;

    // Increment fine Y
    let v = this.v;
    if ((v & 0x7000) !== 0x7000) {
      v += 0x1000;
    } else {
      v &= ~0x7000;
      let y = (v & 0x03E0) >> 5;
      if (y === 29) {
        y = 0;
        v ^= 0x0800;
      } else if (y === 31) {
        y = 0;
      } else {
        y++;
      }
      v = (v & ~0x03E0) | (y << 5);
    }
    this.v = v;
  }

  // Copy horizontal scroll bits from t to v
  private copyHorizontalBits(): void {
    if (!(this.mask & 0x08)) return;
    this.v = (this.v & ~0x041F) | (this.t & 0x041F);
  }

  // Copy vertical scroll bits from t to v
  private copyVerticalBits(): void {
    if (!(this.mask & 0x08)) return;
    this.v = (this.v & ~0x7BE0) | (this.t & 0x7BE0);
  }

  // Get the current frame buffer
  renderFrame(): Uint8ClampedArray {
    return this.frameBuffer;
  }

  // Check if NMI should be triggered
  checkNMI(): boolean {
    const nmi = this.nmiOccurred;
    this.nmiOccurred = false;
    return nmi;
  }

  // Update PPUCTRL ($2000) with sprite-specific flags
  private updatePPUCTRL(value: number): void {
    this.spritePatternTable = (value & 0x08) ? 1 : 0;
    this.spriteSize = (value & 0x20) !== 0;
  }
} 