import { describe, it, expect, beforeEach } from 'vitest'
import { CPU, CpuFlags } from '../src/emulator/cpu'
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

  describe('Branch Instructions', () => {
    let memory: Memory;
    let cpu: CPU;

    beforeEach(() => {
      // Create a custom program for branch testing
      const program = new Uint8Array(PRG_BANK_SIZE);
      program[0] = 0xA9; // LDA #$80 (Set negative flag)
      program[1] = 0x80;
      program[2] = 0xF0; // BEQ +5 (shouldn't branch, Z=0)
      program[3] = 0x05;
      program[4] = 0x30; // BMI +10 (should branch, N=1)
      program[5] = 0x0A;
      // More instructions at target locations...

      const romData = createFakeNromRom({
        numPrgBanks: 1,
        prgData: [program],
        resetVector: 0x8000
      });
      const cartridge = new Cartridge(romData);
      memory = new Memory();
      memory.loadCartridge(cartridge);
      cpu = new CPU(memory);
    });

    it('should correctly handle BEQ when Zero flag is set', () => {
      cpu.setFlag(CpuFlags.Zero, true);
      cpu.PC = 0x8000;
      memory.write(0x8000, 0xF0); // BEQ
      memory.write(0x8001, 0x05); // +5 offset

      cpu.step();
      expect(cpu.PC).toBe(0x8007); // 0x8000 + 2 + 5
      expect(cpu.cycles).toBe(3); // Base 2 + 1 for taken branch
    });

    it('should correctly handle BNE when Zero flag is clear', () => {
      cpu.setFlag(CpuFlags.Zero, false);
      cpu.PC = 0x8000;
      memory.write(0x8000, 0xD0); // BNE
      memory.write(0x8001, 0x05); // +5 offset

      cpu.step();
      expect(cpu.PC).toBe(0x8007);
      expect(cpu.cycles).toBe(3);
    });

    it('should correctly handle BMI when Negative flag is set', () => {
      cpu.setFlag(CpuFlags.Negative, true);
      cpu.PC = 0x8000;
      memory.write(0x8000, 0x30); // BMI
      memory.write(0x8001, 0x05); // +5 offset

      cpu.step();
      expect(cpu.PC).toBe(0x8007);
      expect(cpu.cycles).toBe(3);
    });

    it('should correctly handle BPL when Negative flag is clear', () => {
      cpu.setFlag(CpuFlags.Negative, false);
      cpu.PC = 0x8000;
      memory.write(0x8000, 0x10); // BPL
      memory.write(0x8001, 0x05); // +5 offset

      cpu.step();
      expect(cpu.PC).toBe(0x8007);
      expect(cpu.cycles).toBe(3);
    });

    it('should correctly handle BCS when Carry flag is set', () => {
      cpu.setFlag(CpuFlags.Carry, true);
      cpu.PC = 0x8000;
      memory.write(0x8000, 0xB0); // BCS
      memory.write(0x8001, 0x05); // +5 offset

      cpu.step();
      expect(cpu.PC).toBe(0x8007);
      expect(cpu.cycles).toBe(3);
    });

    it('should correctly handle BCC when Carry flag is clear', () => {
      cpu.setFlag(CpuFlags.Carry, false);
      cpu.PC = 0x8000;
      memory.write(0x8000, 0x90); // BCC
      memory.write(0x8001, 0x05); // +5 offset

      cpu.step();
      expect(cpu.PC).toBe(0x8007);
      expect(cpu.cycles).toBe(3);
    });

    it('should correctly handle BVS when Overflow flag is set', () => {
      cpu.setFlag(CpuFlags.Overflow, true);
      cpu.PC = 0x8000;
      memory.write(0x8000, 0x70); // BVS
      memory.write(0x8001, 0x05); // +5 offset

      cpu.step();
      expect(cpu.PC).toBe(0x8007);
      expect(cpu.cycles).toBe(3);
    });

    it('should correctly handle BVC when Overflow flag is clear', () => {
      cpu.setFlag(CpuFlags.Overflow, false);
      cpu.PC = 0x8000;
      memory.write(0x8000, 0x50); // BVC
      memory.write(0x8001, 0x05); // +5 offset

      cpu.step();
      expect(cpu.PC).toBe(0x8007);
      expect(cpu.cycles).toBe(3);
    });

    it('should add extra cycle when crossing page boundary', () => {
      cpu.setFlag(CpuFlags.Zero, true);
      cpu.PC = 0x80F0;
      memory.write(0x80F0, 0xF0); // BEQ
      memory.write(0x80F1, 0x20); // +32 offset (crosses page boundary)

      cpu.step();
      expect(cpu.PC).toBe(0x8112); // 0x80F0 + 2 + 32 = 0x8112
      expect(cpu.cycles).toBe(4); // Base 2 + 1 for taken + 1 for page cross
    });

    it('should handle negative branch offsets', () => {
      cpu.setFlag(CpuFlags.Zero, true);
      cpu.PC = 0x8020;
      memory.write(0x8020, 0xF0); // BEQ
      memory.write(0x8021, 0xFB); // -5 offset (0xFB = -5 in two's complement)

      cpu.step();
      expect(cpu.PC).toBe(0x801D); // 0x8020 + 2 - 5 = 0x801D
      expect(cpu.cycles).toBe(3);
    });
  });

  describe('Cycle Counting', () => {
    let memory: Memory;
    let cpu: CPU;

    beforeEach(() => {
      const program = new Uint8Array(PRG_BANK_SIZE);
      // Set up a sequence of instructions with known cycle counts
      program[0] = 0xEA; // NOP (2 cycles)
      program[1] = 0xA9; // LDA #$42 (2 cycles)
      program[2] = 0x42;
      program[3] = 0xF0; // BEQ +5 (2 cycles base, +1 if taken, +1 if page cross)
      program[4] = 0x05;

      const romData = createFakeNromRom({
        numPrgBanks: 1,
        prgData: [program],
        resetVector: 0x8000
      });
      const cartridge = new Cartridge(romData);
      memory = new Memory();
      memory.loadCartridge(cartridge);
      cpu = new CPU(memory);
    });

    it('should return correct cycles for NOP', () => {
      cpu.PC = 0x8000;
      const cycles = cpu.step();
      expect(cycles).toBe(2);
    });

    it('should return correct cycles for LDA immediate', () => {
      cpu.PC = 0x8001;
      const cycles = cpu.step();
      expect(cycles).toBe(2);
    });

    it('should return correct cycles for untaken branch', () => {
      cpu.PC = 0x8003;
      cpu.setFlag(CpuFlags.Zero, false); // Ensure branch not taken
      const cycles = cpu.step();
      expect(cycles).toBe(2);
    });

    it('should return correct cycles for taken branch', () => {
      cpu.PC = 0x8003;
      cpu.setFlag(CpuFlags.Zero, true); // Ensure branch taken
      const cycles = cpu.step();
      expect(cycles).toBe(3); // Base 2 + 1 for branch taken
    });

    it('should return correct cycles for taken branch with page cross', () => {
      cpu.PC = 0x80F0;
      cpu.setFlag(CpuFlags.Zero, true);
      memory.write(0x80F0, 0xF0); // BEQ
      memory.write(0x80F1, 0x20); // Branch forward 32 bytes (crosses page)
      const cycles = cpu.step();
      expect(cycles).toBe(4); // Base 2 + 1 for taken + 1 for page cross
    });

    it('should accumulate cycles across multiple instructions', () => {
      cpu.PC = 0x8000;
      let totalCycles = 0;

      // Execute NOP
      totalCycles += cpu.step();
      expect(totalCycles).toBe(2);

      // Execute LDA #$42
      totalCycles += cpu.step();
      expect(totalCycles).toBe(4);

      // Execute BEQ (not taken)
      cpu.setFlag(CpuFlags.Zero, false);
      totalCycles += cpu.step();
      expect(totalCycles).toBe(6);
    });
  });

  describe('Interrupt Handling', () => {
    let memory: Memory;
    let cpu: CPU;

    beforeEach(() => {
      const program = new Uint8Array(PRG_BANK_SIZE);
      // Main program at 0x8000
      program[0] = 0xEA; // NOP
      program[1] = 0xEA; // NOP
      program[2] = 0xEA; // NOP

      // NMI handler at 0x9000
      const nmiHandler = 0x9000;
      program[nmiHandler - 0x8000] = 0x40; // RTI

      // IRQ handler at 0xA000
      const irqHandler = 0xA000;
      program[irqHandler - 0x8000] = 0x40; // RTI

      const romData = createFakeNromRom({
        numPrgBanks: 1,
        prgData: [program],
        resetVector: 0x8000
      });
      const cartridge = new Cartridge(romData);
      memory = new Memory();
      memory.loadCartridge(cartridge);
      cpu = new CPU(memory);

      // Set up interrupt vectors
      memory.write(0xFFFA, nmiHandler & 0xFF);
      memory.write(0xFFFB, nmiHandler >> 8);
      memory.write(0xFFFE, irqHandler & 0xFF);
      memory.write(0xFFFF, irqHandler >> 8);
    });

    it('should handle NMI correctly', () => {
      cpu.PC = 0x8000;
      const originalSR = cpu.SR;

      // Trigger NMI
      cpu.triggerNMI();

      // Step should handle NMI
      const cycles = cpu.step();
      expect(cycles).toBe(7);
      expect(cpu.PC).toBe(0x9000); // Should jump to NMI handler
      expect(cpu.getFlag(CpuFlags.InterruptDisable)).toBe(true);

      // Stack should contain return address and status
      const stackedPC = memory.read(0x0100 | ((cpu.SP + 1) & 0xFF)) |
                       (memory.read(0x0100 | ((cpu.SP + 2) & 0xFF)) << 8);
      const stackedStatus = memory.read(0x0100 | ((cpu.SP + 3) & 0xFF));
      expect(stackedPC).toBe(0x8000);
      expect(stackedStatus & CpuFlags.Break).toBe(0); // Break flag should be clear
      expect(stackedStatus & CpuFlags.Unused).toBe(CpuFlags.Unused);

      // Execute RTI
      cpu.step();
      expect(cpu.PC).toBe(0x8000);
      expect(cpu.SR).toBe(originalSR);
    });

    it('should handle IRQ correctly when interrupts are enabled', () => {
      cpu.PC = 0x8000;
      cpu.setFlag(CpuFlags.InterruptDisable, false);
      const originalSR = cpu.SR;

      // Trigger IRQ
      cpu.triggerIRQ();

      // Step should handle IRQ
      const cycles = cpu.step();
      expect(cycles).toBe(7);
      expect(cpu.PC).toBe(0xA000); // Should jump to IRQ handler
      expect(cpu.getFlag(CpuFlags.InterruptDisable)).toBe(true);

      // Stack should contain return address and status
      const stackedPC = memory.read(0x0100 | ((cpu.SP + 1) & 0xFF)) |
                       (memory.read(0x0100 | ((cpu.SP + 2) & 0xFF)) << 8);
      const stackedStatus = memory.read(0x0100 | ((cpu.SP + 3) & 0xFF));
      expect(stackedPC).toBe(0x8000);
      expect(stackedStatus & CpuFlags.Break).toBe(0);
      expect(stackedStatus & CpuFlags.Unused).toBe(CpuFlags.Unused);

      // Execute RTI
      cpu.step();
      expect(cpu.PC).toBe(0x8000);
      expect(cpu.SR).toBe(originalSR);
    });

    it('should ignore IRQ when interrupts are disabled', () => {
      cpu.PC = 0x8000;
      cpu.setFlag(CpuFlags.InterruptDisable, true);
      const originalPC = cpu.PC;
      const originalSP = cpu.SP;

      // Trigger IRQ
      cpu.triggerIRQ();

      // Step should ignore IRQ and execute NOP instead
      const cycles = cpu.step();
      expect(cycles).toBe(2); // NOP cycles
      expect(cpu.PC).toBe(originalPC + 1);
      expect(cpu.SP).toBe(originalSP);
    });

    it('should handle NMI even when interrupts are disabled', () => {
      cpu.PC = 0x8000;
      cpu.setFlag(CpuFlags.InterruptDisable, true);

      // Trigger NMI
      cpu.triggerNMI();

      // Step should handle NMI despite interrupt disable flag
      const cycles = cpu.step();
      expect(cycles).toBe(7);
      expect(cpu.PC).toBe(0x9000);
    });

    it('should prioritize NMI over IRQ', () => {
      cpu.PC = 0x8000;
      cpu.setFlag(CpuFlags.InterruptDisable, false);

      // Trigger both interrupts
      cpu.triggerNMI();
      cpu.triggerIRQ();

      // Step should handle NMI first
      const cycles = cpu.step();
      expect(cycles).toBe(7);
      expect(cpu.PC).toBe(0x9000);

      // IRQ should still be pending
      expect(cpu['pendingIRQ']).toBe(true);
    });

    it('should handle RTI instruction correctly', () => {
      // Setup a known state on stack
      const testPC = 0x1234;
      const testSR = 0b11001111; // Some test flags
      cpu.SP = 0xFD;
      
      // Push test values to stack (in reverse order)
      memory.write(0x0100 | cpu.SP--, (testPC >> 8) & 0xFF);
      memory.write(0x0100 | cpu.SP--, testPC & 0xFF);
      memory.write(0x0100 | cpu.SP, testSR);

      // Execute RTI
      cpu.PC = 0x8000;
      memory.write(0x8000, 0x40); // RTI opcode
      
      const cycles = cpu.step();
      expect(cycles).toBe(6);
      expect(cpu.PC).toBe(testPC);
      expect(cpu.SR & ~CpuFlags.Break).toBe(testSR & ~CpuFlags.Break);
      expect(cpu.SR & CpuFlags.Unused).toBe(CpuFlags.Unused);
    });
  });
}) 