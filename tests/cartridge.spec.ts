import { describe, it, expect } from 'vitest'
import { Cartridge } from '../src/emulator/cartridge'

const PRG_BANK_SIZE = 16 * 1024;

// Helper to create a simple iNES ROM Uint8Array
function createFakeRom(numPrgBanks: number, hasTrainer = false): Uint8Array {
  const header = new Uint8Array(16).fill(0);
  header[0] = 0x4e; // N
  header[1] = 0x45; // E
  header[2] = 0x53; // S
  header[3] = 0x1a;
  header[4] = numPrgBanks;
  header[5] = 0; // CHR Banks (none for this test)
  header[6] = hasTrainer ? 0x04 : 0x00; // Flags 6 (set trainer bit if needed)

  const trainerData = hasTrainer ? new Uint8Array(512).fill(0x55) : new Uint8Array(0);
  const prgDataSize = numPrgBanks * PRG_BANK_SIZE;
  const prgData = new Uint8Array(prgDataSize);
  for (let i = 0; i < prgDataSize; i++) {
    prgData[i] = i & 0xff; // Fill PRG with predictable sequence
  }

  const romData = new Uint8Array(header.length + trainerData.length + prgData.length);
  romData.set(header, 0);
  romData.set(trainerData, header.length);
  romData.set(prgData, header.length + trainerData.length);

  return romData;
}

describe('Cartridge', () => {
  it('should throw error for invalid header signature', () => {
    const badHeader = new Uint8Array([0, 1, 2, 3]);
    expect(() => new Cartridge(badHeader)).toThrow('Invalid iNES header signature');
  })

  it('should correctly parse header and count PRG banks', () => {
    const romData = createFakeRom(2); // 2 PRG banks, no trainer
    const cartridge = new Cartridge(romData);
    expect(cartridge.prgBanks.length).toBe(2);
  })

  it('should correctly extract PRG bank data', () => {
    const numPrgBanks = 2;
    const romData = createFakeRom(numPrgBanks);
    const cartridge = new Cartridge(romData);

    expect(cartridge.prgBanks.length).toBe(numPrgBanks);

    // Verify content of each PRG bank
    for (let bankIndex = 0; bankIndex < numPrgBanks; bankIndex++) {
      expect(cartridge.prgBanks[bankIndex].length).toBe(PRG_BANK_SIZE);
      const expectedStartOffset = bankIndex * PRG_BANK_SIZE;
      for (let i = 0; i < PRG_BANK_SIZE; i++) {
        const expectedValue = (expectedStartOffset + i) & 0xff;
        expect(cartridge.prgBanks[bankIndex][i]).toBe(expectedValue);
      }
    }
  })

  it('should handle ROMs with a trainer correctly', () => {
    const numPrgBanks = 1;
    const romData = createFakeRom(numPrgBanks, true); // 1 PRG bank, with trainer
    const cartridge = new Cartridge(romData);

    expect(cartridge.prgBanks.length).toBe(numPrgBanks);
    expect(cartridge.prgBanks[0].length).toBe(PRG_BANK_SIZE);

    // Check that the PRG data (sequence 0, 1, 2...) starts after the header (16) and trainer (512)
    const expectedStartOffset = 0; // First byte of the actual PRG data sequence
    for (let i = 0; i < PRG_BANK_SIZE; i++) {
      const expectedValue = (expectedStartOffset + i) & 0xff;
      expect(cartridge.prgBanks[0][i]).toBe(expectedValue);
    }
  })

  it('should throw error if PRG data extends beyond file size', () => {
    const header = new Uint8Array(16).fill(0);
    header[0] = 0x4e; header[1] = 0x45; header[2] = 0x53; header[3] = 0x1a;
    header[4] = 1; // 1 PRG bank specified

    // Create ROM data that's too short (only header + 1 byte)
    const shortRomData = new Uint8Array(17);
    shortRomData.set(header, 0);
    shortRomData[16] = 0xff;

    expect(() => new Cartridge(shortRomData)).toThrow('PRG ROM bank data extends beyond file size');
  })
}) 