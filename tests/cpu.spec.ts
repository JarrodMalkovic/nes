import { describe, it, expect, beforeEach } from 'vitest'
import { CPU } from '../src/emulator/cpu'
import { Memory } from '../src/emulator/memory'
import { Cartridge } from '../src/emulator/cartridge'
import { createFakeNromRom } from './testUtils' // Import test util

const PRG_BANK_SIZE = 16 * 1024;

describe('CPU', () => {
  // General setup for tests that can use a default NOP ROM
  let defaultMemory: Memory;
  let defaultCpu: CPU;

  beforeEach(() => {
    const prgBank = new Uint8Array(PRG_BANK_SIZE).fill(0xEA); // NOPs
    const romData = createFakeNromRom({
      numPrgBanks: 1,
      prgData: [prgBank],
      resetVector: 0x8000
    });
    const cartridge = new Cartridge(romData);
    defaultMemory = new Memory();
    defaultMemory.loadCartridge(cartridge);
    defaultCpu = new CPU(defaultMemory); // Reads reset vector (0x8000) on init
  })

  it('should set PC to reset vector after reset', () => {
    // Test with a specific reset vector, requires custom setup
    const specificResetVector = 0xC000;
    const prgBank = new Uint8Array(PRG_BANK_SIZE).fill(0xEA);
    const romData = createFakeNromRom({
      numPrgBanks: 1,
      prgData: [prgBank],
      resetVector: specificResetVector
    });
    const cartridge = new Cartridge(romData);
    const memory = new Memory();
    memory.loadCartridge(cartridge);
    const cpu = new CPU(memory); // Recreate CPU with new memory/cartridge

    expect(cpu.PC).toBe(specificResetVector);
  })

  it('should increment PC by 1 on NOP', () => {
    // Use the default setup from beforeEach
    expect(defaultCpu.PC).toBe(0x8000);
    expect(defaultMemory.read(0x8000)).toBe(0xEA); // Verify NOP is there

    defaultCpu.step();
    expect(defaultCpu.PC).toBe(0x8001);
  })

  it('should load immediate value into A and set flags correctly', () => {
    // --- Test-specific setup --- START ---
    const prgBank = new Uint8Array(PRG_BANK_SIZE).fill(0x00);
    const startAddress = 0x8000;

    // Place LDA #$12 at startAddress (offset 0)
    prgBank[0] = 0xA9; // LDA immediate opcode
    prgBank[1] = 0x12; // Immediate value
    // Place LDA #$00 at startAddress + 2 (offset 2)
    prgBank[2] = 0xA9;
    prgBank[3] = 0x00;
    // Place LDA #$FF at startAddress + 4 (offset 4)
    prgBank[4] = 0xA9;
    prgBank[5] = 0xFF;

    const romData = createFakeNromRom({
      numPrgBanks: 1,
      prgData: [prgBank],
      resetVector: startAddress // Ensure reset vector points to our code
    });
    const cartridge = new Cartridge(romData);
    const memory = new Memory();
    memory.loadCartridge(cartridge);
    const cpu = new CPU(memory); // Create CPU *after* ROM is set up
    // --- Test-specific setup --- END ---

    // Verify initial state (PC is set by reset vector)
    expect(cpu.PC).toBe(startAddress);

    // Test LDA #$12
    cpu.step();
    expect(cpu.A).toBe(0x12);
    expect(cpu.zeroFlag).toBe(false);
    expect(cpu.negativeFlag).toBe(false);
    expect(cpu.PC).toBe(startAddress + 2);

    // Test LDA #$00 (Zero flag)
    cpu.step();
    expect(cpu.A).toBe(0x00);
    expect(cpu.zeroFlag).toBe(true);
    expect(cpu.negativeFlag).toBe(false);
    expect(cpu.PC).toBe(startAddress + 4);

    // Test LDA #$FF (Negative flag)
    cpu.step();
    expect(cpu.A).toBe(0xFF);
    expect(cpu.zeroFlag).toBe(false);
    expect(cpu.negativeFlag).toBe(true);
    expect(cpu.PC).toBe(startAddress + 6);
  })
}) 