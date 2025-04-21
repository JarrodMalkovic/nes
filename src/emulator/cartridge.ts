const PRG_BANK_SIZE = 16 * 1024; // 16KB
const CHR_BANK_SIZE = 8 * 1024;  // 8KB
const TRAINER_SIZE = 512;

export class Cartridge {
  prgBanks: Uint8Array[] = [];
  // chrBanks: Uint8Array[] = []; // Placeholder for CHR ROM
  // mapperId: number;
  // hasTrainer: boolean;

  constructor(romData: Uint8Array) {
    // Verify header signature "NES\x1a"
    if (
      romData[0] !== 0x4e || // N
      romData[1] !== 0x45 || // E
      romData[2] !== 0x53 || // S
      romData[3] !== 0x1a
    ) {
      throw new Error('Invalid iNES header signature');
    }

    const numPrgBanks = romData[4];
    const numChrBanks = romData[5]; // Needed for offset calculation
    const flags6 = romData[6];
    // const flags7 = romData[7];
    // const flags8 = romData[8]; // PRG RAM size
    // const flags9 = romData[9];
    // const flags10 = romData[10];

    const hasTrainer = (flags6 & 0x04) !== 0;

    // this.mapperId = ((flags7 >> 4) << 4) | (flags6 >> 4);
    // this.hasTrainer = hasTrainer;

    let prgOffset = 16; // Start after 16-byte header
    if (hasTrainer) {
      prgOffset += TRAINER_SIZE;
    }

    // Extract PRG ROM banks
    for (let i = 0; i < numPrgBanks; i++) {
      const start = prgOffset + i * PRG_BANK_SIZE;
      const end = start + PRG_BANK_SIZE;
      if (end > romData.length) {
        throw new Error('PRG ROM bank data extends beyond file size');
      }
      this.prgBanks.push(romData.slice(start, end));
    }

    // Calculate CHR ROM offset (after PRG ROM)
    // const chrOffset = prgOffset + numPrgBanks * PRG_BANK_SIZE;

    // Extract CHR ROM banks (if needed later)
    // for (let i = 0; i < numChrBanks; i++) {
    //   const start = chrOffset + i * CHR_BANK_SIZE;
    //   const end = start + CHR_BANK_SIZE;
    //   if (end > romData.length) {
    //     throw new Error('CHR ROM bank data extends beyond file size');
    //   }
    //   this.chrBanks.push(romData.slice(start, end));
    // }

    // TODO: Handle PRG RAM, different mapper types etc.
  }
} 