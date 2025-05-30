// iNES file format header structure
const INES_HEADER_SIZE = 16;
const PRG_BANK_SIZE = 16384; // 16 KB
const CHR_BANK_SIZE = 8192;  // 8 KB

export enum MirroringMode {
  Horizontal,
  Vertical,
  FourScreen,
  SingleScreenLow,
  SingleScreenHigh,
}

export class Cartridge {
  // ROM data
  prgBanks: Uint8Array[];  // Program ROM banks (16KB each)
  chrBanks: Uint8Array[];  // Character ROM banks (8KB each)
  
  // Cartridge configuration
  mapper: number;          // Mapper number
  mirroring: MirroringMode;
  hasBatteryBackedRam: boolean;
  hasTrainer: boolean;
  
  // Memory
  prgRam: Uint8Array;     // PRG RAM (8KB)
  chrRam: Uint8Array;     // CHR RAM (8KB, used when no CHR ROM present)
  
  // Bank switching state
  prgBankMode: number;    // Current PRG bank mode
  chrBankMode: number;    // Current CHR bank mode
  selectedPrgBank: number;
  selectedChrBank: number;

  constructor(romData: Uint8Array) {
    console.log('Initializing cartridge with ROM size:', romData.length);
    
    // Parse iNES header
    if (romData.length < INES_HEADER_SIZE) {
      throw new Error('Invalid ROM: File too small');
    }

    // Check for iNES magic number
    if (romData[0] !== 0x4E || romData[1] !== 0x45 || 
        romData[2] !== 0x53 || romData[3] !== 0x1A) {
      throw new Error('Invalid ROM: Not an iNES file');
    }

    // Parse header
    const prgRomSize = romData[4] * PRG_BANK_SIZE;
    const chrRomSize = romData[5] * CHR_BANK_SIZE;
    const flags6 = romData[6];
    const flags7 = romData[7];

    console.log('ROM Header:', {
      prgBanks: romData[4],
      chrBanks: romData[5],
      prgRomSize,
      chrRomSize,
      flags6: flags6.toString(16),
      flags7: flags7.toString(16)
    });

    // Get mapper number
    this.mapper = (flags7 & 0xF0) | (flags6 >> 4);

    // Get mirroring mode
    if (flags6 & 0x08) {
      this.mirroring = MirroringMode.FourScreen;
    } else {
      this.mirroring = flags6 & 0x01 ? MirroringMode.Vertical : MirroringMode.Horizontal;
    }

    // Check for battery-backed RAM
    this.hasBatteryBackedRam = (flags6 & 0x02) !== 0;

    // Check for trainer
    this.hasTrainer = (flags6 & 0x04) !== 0;

    // Calculate offsets
    let offset = INES_HEADER_SIZE;
    if (this.hasTrainer) {
      offset += 512;
    }

    // Initialize memory
    this.prgRam = new Uint8Array(8192);  // 8KB PRG RAM
    this.chrRam = new Uint8Array(8192);  // 8KB CHR RAM

    // Load PRG ROM banks
    this.prgBanks = [];
    for (let i = 0; i < romData[4]; i++) {
      const bank = new Uint8Array(PRG_BANK_SIZE);
      bank.set(romData.slice(offset + i * PRG_BANK_SIZE, offset + (i + 1) * PRG_BANK_SIZE));
      this.prgBanks.push(bank);
    }

    // Load CHR ROM banks or initialize CHR RAM
    offset += prgRomSize;
    this.chrBanks = [];
    if (chrRomSize > 0) {
      for (let i = 0; i < romData[5]; i++) {
        const bank = new Uint8Array(CHR_BANK_SIZE);
        bank.set(romData.slice(offset + i * CHR_BANK_SIZE, offset + (i + 1) * CHR_BANK_SIZE));
        this.chrBanks.push(bank);
      }
    }

    console.log('Cartridge initialized:', {
      mapper: this.mapper,
      mirroring: this.mirroring,
      hasBatteryBackedRam: this.hasBatteryBackedRam,
      hasTrainer: this.hasTrainer,
      prgBanks: this.prgBanks.length,
      chrBanks: this.chrBanks.length,
      chrRomSize,
      offset
    });

    // Initialize bank switching state
    this.prgBankMode = 0;
    this.chrBankMode = 0;
    this.selectedPrgBank = 0;
    this.selectedChrBank = 0;
  }

  // Reset the cartridge
  reset(): void {
    this.prgBankMode = 0;
    this.chrBankMode = 0;
    this.selectedPrgBank = 0;
    this.selectedChrBank = 0;
  }

  // Read from PRG memory
  readPrg(address: number): number {
    // Handle different mappers
    switch (this.mapper) {
      case 0: // NROM
        if (address >= 0x8000) {
          const bankSize = this.prgBanks.length === 1 ? 0x3FFF : 0x7FFF;
          const bank = this.prgBanks[Math.floor((address - 0x8000) / 0x4000)];
          return bank[(address - 0x8000) & bankSize];
        }
        break;

      // Add more mappers here...
    }

    // Default: return 0 for unmapped memory
    return 0;
  }

  // Write to PRG memory
  writePrg(address: number, value: number): void {
    // Handle different mappers
    switch (this.mapper) {
      case 0: // NROM
        if (address >= 0x6000 && address < 0x8000) {
          // PRG RAM
          this.prgRam[address - 0x6000] = value;
        }
        break;

      // Add more mappers here...
    }
  }

  // Read from CHR memory
  readChr(address: number): number {
    if (address >= 0x2000) {
      throw new Error('Invalid CHR read address');
    }

    // Handle different mappers
    switch (this.mapper) {
      case 0: // NROM
        if (this.chrBanks.length > 0) {
          console.log('Reading CHR ROM:', {
            address: address.toString(16),
            value: this.chrBanks[0][address].toString(16),
            chrBanksLength: this.chrBanks.length
          });
          return this.chrBanks[0][address];
        } else {
          console.log('Reading CHR RAM:', {
            address: address.toString(16),
            value: this.chrRam[address].toString(16)
          });
          return this.chrRam[address];
        }

      // Add more mappers here...
    }

    return 0;
  }

  // Write to CHR memory
  writeChr(address: number, value: number): void {
    if (address >= 0x2000) {
      throw new Error('Invalid CHR write address');
    }

    // Handle different mappers
    switch (this.mapper) {
      case 0: // NROM
        if (this.chrBanks.length === 0) {
          // Only write if using CHR RAM
          this.chrRam[address] = value;
        }
        break;

      // Add more mappers here...
    }
  }

  // Get the current mirroring mode for nametable mapping
  getMirroringMode(): MirroringMode {
    return this.mirroring;
  }

  // Mirror VRAM address according to current mirroring mode
  mirrorVramAddress(address: number): number {
    // Ensure address is in VRAM range (0x2000-0x3EFF)
    address = (address - 0x2000) & 0x0FFF;

    // The NES has 2KB of VRAM, arranged as 4 1KB nametables
    // Only the first 2 nametables are physical, the other 2 are mirrors
    switch (this.mirroring) {
      case MirroringMode.Horizontal:
        // 0: A, 1: A, 2: B, 3: B
        if (address >= 0x0800 && address < 0x1000) {
          address -= 0x0800;
        }
        break;
      case MirroringMode.Vertical:
        // 0: A, 1: B, 2: A, 3: B
        if (address >= 0x0800) {
          address -= 0x0800;
        }
        break;
      case MirroringMode.SingleScreenLow:
        // All nametables mirror the first one
        address &= 0x03FF;
        break;
      case MirroringMode.SingleScreenHigh:
        // All nametables mirror the second one
        address = (address & 0x03FF) + 0x0400;
        break;
      case MirroringMode.FourScreen:
        // No mirroring
        break;
    }

    return address + 0x2000;
  }
} 