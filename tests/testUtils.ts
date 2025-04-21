const PRG_BANK_SIZE = 16 * 1024;
const CHR_BANK_SIZE = 8 * 1024;
const TRAINER_SIZE = 512;

interface RomOptions {
  numPrgBanks?: number;
  numChrBanks?: number;
  hasTrainer?: boolean;
  prgData?: Uint8Array[]; // Allow providing specific PRG data
  resetVector?: number; // Address for PC after reset (0xFFFC/D)
}

/**
 * Creates a simple NROM (Mapper 0) iNES ROM Uint8Array for testing.
 */
export function createFakeNromRom(options: RomOptions = {}): Uint8Array {
  const {
    numPrgBanks = 1,
    numChrBanks = 0,
    hasTrainer = false,
    prgData: providedPrgData,
    resetVector = 0x8000, // Default reset points to start of PRG
  } = options;

  if (numPrgBanks < 1 || numPrgBanks > 2) {
    throw new Error('NROM supports only 1 or 2 PRG banks');
  }
  if (providedPrgData && providedPrgData.length !== numPrgBanks) {
    throw new Error('Provided prgData length must match numPrgBanks');
  }

  const header = new Uint8Array(16).fill(0);
  header[0] = 0x4e; // N
  header[1] = 0x45; // E
  header[2] = 0x53; // S
  header[3] = 0x1a;
  header[4] = numPrgBanks;
  header[5] = numChrBanks;
  header[6] = (hasTrainer ? 0x04 : 0x00) | 0x00; // Flags 6 (Mapper 0 low nibble)
  header[7] = 0x00; // Flags 7 (Mapper 0 high nibble)
  // Other header bytes (flags 8-15) are 0 for basic NROM

  const trainerData = hasTrainer ? new Uint8Array(TRAINER_SIZE).fill(0x55) : new Uint8Array(0);

  const totalPrgSize = numPrgBanks * PRG_BANK_SIZE;
  const combinedPrgData = new Uint8Array(totalPrgSize);

  if (providedPrgData) {
    let offset = 0;
    for (const bank of providedPrgData) {
      if (bank.length > PRG_BANK_SIZE) {
        throw new Error('Provided PRG bank exceeds max size');
      }
      // Copy provided data, padding with 0 if shorter than bank size
      combinedPrgData.set(bank, offset);
      offset += PRG_BANK_SIZE;
    }
  } else {
    // Fill with default predictable sequence if no data provided
    for (let i = 0; i < totalPrgSize; i++) {
      combinedPrgData[i] = i & 0xff;
    }
  }

  // Set the reset vector within the PRG data (relative to start of PRG)
  // The vector points to an absolute address (e.g., 0x8000)
  // It's stored at 0xFFFC/D relative to the *mapped* start (0x8000).
  // So, for NROM, it resides in the last 16KB bank (index numPrgBanks - 1).
  const resetVectorOffsetInPrg = totalPrgSize - (PRG_BANK_SIZE - 0x3FFC); // Offset of 0xFFFC within combined PRG
  if (resetVectorOffsetInPrg < 0 || resetVectorOffsetInPrg >= totalPrgSize) {
     throw new Error('Cannot place reset vector in specified PRG size');
  }
  combinedPrgData[resetVectorOffsetInPrg] = resetVector & 0xFF; // Low byte
  combinedPrgData[resetVectorOffsetInPrg + 1] = (resetVector >> 8) & 0xFF; // High byte

  const romData = new Uint8Array(header.length + trainerData.length + combinedPrgData.length);
  romData.set(header, 0);
  romData.set(trainerData, header.length);
  romData.set(combinedPrgData, header.length + trainerData.length);

  return romData;
} 