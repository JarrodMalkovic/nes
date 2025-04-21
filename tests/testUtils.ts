const PRG_BANK_SIZE = 16 * 1024;
const CHR_BANK_SIZE = 8 * 1024;
const TRAINER_SIZE = 512;

interface RomOptions {
  numPrgBanks?: number;
  numChrBanks?: number;
  hasTrainer?: boolean;
  prgData?: Uint8Array[];  // Provide specific PRG bank data
  chrData?: Uint8Array[];  // Provide specific CHR bank data
  resetVector?: number;    // Address for PC after reset (0xFFFC/D)
}

/**
 * Creates a simple NROM (Mapper 0) iNES ROM Uint8Array for testing.
 * Supports optional PRG and CHR data banks.
 */
export function createFakeNromRom(options: RomOptions = {}): Uint8Array {
  const {
    numPrgBanks = 1,
    numChrBanks = 0,
    hasTrainer = false,
    prgData: providedPrgData,
    chrData: providedChrData,
    resetVector = 0x8000,
  } = options;

  // Validate bank counts
  if (numPrgBanks < 1 || numPrgBanks > 2) {
    throw new Error('NROM supports only 1 or 2 PRG banks');
  }
  if (providedPrgData && providedPrgData.length !== numPrgBanks) {
    throw new Error('Provided prgData length must match numPrgBanks');
  }
  if (providedChrData && providedChrData.length !== numChrBanks) {
    throw new Error('Provided chrData length must match numChrBanks');
  }

  // --- Build iNES header ---
  const header = new Uint8Array(16).fill(0);
  header[0] = 0x4e; // 'N'
  header[1] = 0x45; // 'E'
  header[2] = 0x53; // 'S'
  header[3] = 0x1a;
  header[4] = numPrgBanks;
  header[5] = numChrBanks;
  header[6] = hasTrainer ? 0x04 : 0x00;
  header[7] = 0x00;

  // --- Trainer block ---
  const trainerData = hasTrainer ? new Uint8Array(TRAINER_SIZE).fill(0x55) : new Uint8Array(0);

  // --- PRG ROM banks ---
  const totalPrgSize = numPrgBanks * PRG_BANK_SIZE;
  const combinedPrgData = new Uint8Array(totalPrgSize);

  if (providedPrgData) {
    let offset = 0;
    for (const bank of providedPrgData) {
      if (bank.length > PRG_BANK_SIZE) {
        throw new Error('Provided PRG bank exceeds max size');
      }
      combinedPrgData.set(bank, offset);
      offset += PRG_BANK_SIZE;
    }
  } else {
    // Default sequence if no data provided
    for (let i = 0; i < totalPrgSize; i++) {
      combinedPrgData[i] = i & 0xff;
    }
  }

  // --- Write reset vector in last PRG bank at 0xFFFC/D ---
  const resetOffset = totalPrgSize - (PRG_BANK_SIZE - 0x3FFC);
  combinedPrgData[resetOffset]     = resetVector & 0xff;
  combinedPrgData[resetOffset + 1] = (resetVector >> 8) & 0xff;

  // --- CHR ROM banks ---
  const totalChrSize = numChrBanks * CHR_BANK_SIZE;
  const combinedChrData = new Uint8Array(totalChrSize);

  if (providedChrData) {
    let offset = 0;
    for (const bank of providedChrData) {
      if (bank.length > CHR_BANK_SIZE) {
        throw new Error('Provided CHR bank exceeds max size');
      }
      combinedChrData.set(bank, offset);
      offset += CHR_BANK_SIZE;
    }
  }
  // If no chrData provided, leave banks zero-filled (blank pattern)

  // --- Concatenate all parts ---
  const romSize = header.length + trainerData.length + combinedPrgData.length + combinedChrData.length;
  const romData = new Uint8Array(romSize);
  let ptr = 0;
  romData.set(header, ptr); ptr += header.length;
  romData.set(trainerData, ptr); ptr += trainerData.length;
  romData.set(combinedPrgData, ptr); ptr += combinedPrgData.length;
  romData.set(combinedChrData, ptr);

  return romData;
}
