import { describe, it, expect } from 'vitest'
import { NesConsole } from '../src/emulator/index'
import { createFakeNromRom } from './testUtils'

const PRG_BANK_SIZE = 16 * 1024;

describe('Integration Tests', () => {

  it('should run two NOP instructions and advance PC', () => {
    // Create a 16KB PRG bank filled with NOPs
    const prgBank = new Uint8Array(PRG_BANK_SIZE).fill(0xEA); // NOP

    // Create ROM with this bank, reset vector pointing to 0x8000
    const romData = createFakeNromRom({
      numPrgBanks: 1,
      prgData: [prgBank],
      resetVector: 0x8000
    });

    const console = new NesConsole(romData);

    // After reset, PC should be 0x8000 (from reset vector)
    expect(console.cpu.PC).toBe(0x8000);

    // Step 1: Execute first NOP (at 0x8000)
    console.cpu.step();
    expect(console.cpu.PC).toBe(0x8001);

    // Step 2: Execute second NOP (at 0x8001)
    console.cpu.step();
    expect(console.cpu.PC).toBe(0x8002);
  });

  it('should run LDA immediate and NOP, setting A register and advancing PC', () => {
    // Create a 16KB PRG bank
    const prgBank = new Uint8Array(PRG_BANK_SIZE).fill(0x00); // Fill with 0s initially

    // Place LDA #$05 (A9 05) at 0x8000 (offset 0 in bank)
    prgBank[0] = 0xA9; // LDA immediate opcode
    prgBank[1] = 0x05; // Immediate value
    // Place NOP (EA) at 0x8002 (offset 2 in bank)
    prgBank[2] = 0xEA; // NOP opcode

    // Create ROM with this bank, reset vector pointing to 0x8000
    const romData = createFakeNromRom({
      numPrgBanks: 1,
      prgData: [prgBank],
      resetVector: 0x8000
    });

    const console = new NesConsole(romData);

    // After reset, PC should be 0x8000
    expect(console.cpu.PC).toBe(0x8000);
    expect(console.cpu.A).toBe(0); // A should be 0 initially

    // Step 1: Execute LDA #$05 (at 0x8000)
    console.cpu.step();
    expect(console.cpu.A).toBe(0x05);        // A register should now be 5
    expect(console.cpu.zeroFlag).toBe(false);
    expect(console.cpu.negativeFlag).toBe(false);
    expect(console.cpu.PC).toBe(0x8002);      // PC should advance by 2

    // Step 2: Execute NOP (at 0x8002)
    console.cpu.step();
    expect(console.cpu.A).toBe(0x05);        // A register should still be 5
    expect(console.cpu.PC).toBe(0x8003);      // PC should advance by 1
  });

  it('should read reset vector from the end of a 32KB ROM', () => {
    // Create two 16KB PRG banks
    const prgBank0 = new Uint8Array(PRG_BANK_SIZE).fill(0xEA); // NOPs
    const prgBank1 = new Uint8Array(PRG_BANK_SIZE).fill(0xEA); // NOPs

    // Put a different instruction sequence at the reset target (0xC000)
    // LDA #$01 at 0xC000 (offset 0 in bank 1)
    prgBank1[0] = 0xA9;
    prgBank1[1] = 0x01;

    // Create ROM with 2 PRG banks, reset vector pointing to 0xC000
    // The helper places the vector bytes near the end of bank 1
    const romData = createFakeNromRom({
      numPrgBanks: 2,
      prgData: [prgBank0, prgBank1],
      resetVector: 0xC000
    });

    const console = new NesConsole(romData);

    // After reset, PC should be 0xC000 (read from 0xFFFC/D in bank 1)
    expect(console.cpu.PC).toBe(0xC000);

    // Step 1: Execute LDA #$01 (at 0xC000)
    console.cpu.step();
    expect(console.cpu.A).toBe(0x01);
    expect(console.cpu.PC).toBe(0xC002);
  });

}); 