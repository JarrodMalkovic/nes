import { Memory } from './memory';

// --- Status Flags ---
enum CpuFlags {
  Carry            = 1 << 0,
  Zero             = 1 << 1,
  InterruptDisable = 1 << 2,
  Decimal          = 1 << 3, // Not used in NES
  Break            = 1 << 4,
  Unused           = 1 << 5, // Always 1
  Overflow         = 1 << 6,
  Negative         = 1 << 7,
}

// --- Instruction Definition ---
interface Instruction {
  // Note: bytes includes the opcode byte itself
  // This isn't strictly needed with fetchByte but kept for clarity
  // bytes: number;
  execute: (cpu: CPU) => void;
}

export class CPU {
  memory: Memory;

  // Registers
  A = 0;  // Accumulator
  X = 0;  // Index Register X
  Y = 0;  // Index Register Y
  PC = 0; // Program Counter
  SP = 0; // Stack Pointer ($0100-$01FF)
  SR = 0; // Status Register (Flags)

  // Instruction lookup table
  private instructions: Record<number, Instruction> = {};

  constructor(memory: Memory) {
    this.memory = memory;
    this.populateInstructions();
    this.reset();
  }

  // --- Flag Operations ---
  private setFlag(flag: CpuFlags, value: boolean): void {
    if (value) {
      this.SR |= flag;
    } else {
      this.SR &= ~flag;
    }
  }

  private getFlag(flag: CpuFlags): boolean {
    return (this.SR & flag) !== 0;
  }

  private updateZeroNegativeFlags(value: number): void {
    this.setFlag(CpuFlags.Zero, value === 0);
    this.setFlag(CpuFlags.Negative, (value & 0x80) !== 0);
  }

  // --- Stack Operations ---
  private pushByte(value: number): void {
    this.memory.write(0x0100 | this.SP, value & 0xFF);
    this.SP = (this.SP - 1) & 0xFF; // SP wraps around 0x00-0xFF
  }

  private pushWord(value: number): void {
    this.pushByte((value >> 8) & 0xFF); // High byte first
    this.pushByte(value & 0xFF);        // Low byte second
  }

  private pullByte(): number {
    this.SP = (this.SP + 1) & 0xFF;
    return this.memory.read(0x0100 | this.SP);
  }

  private pullWord(): number {
    const lo = this.pullByte();
    const hi = this.pullByte();
    return (hi << 8) | lo;
  }

  // --- Memory Fetch Operations ---
  private fetchByte(): number {
    const value = this.memory.read(this.PC);
    this.PC = (this.PC + 1) & 0xFFFF;
    return value;
  }

  private fetchWord(): number {
    // 6502 is little-endian
    const lo = this.fetchByte();
    const hi = this.fetchByte();
    return (hi << 8) | lo;
  }

  // --- Addressing Mode Operand Fetchers ---
  // Note: These fetch the OPERAND, not necessarily the address (except for STA etc)
  // For modes like Zero Page, Absolute used by LDA/ADC etc., they fetch the value at the address.

  private operandImmediate(): number {
    return this.fetchByte();
  }

  private operandZeroPage(): number {
    const addr = this.fetchByte();
    return this.memory.read(addr);
  }

  // --- Addressing Mode Address Fetchers ---
  // Used by STA, JMP etc. where we need the target address itself.

  private addrZeroPage(): number {
    return this.fetchByte();
  }

  private addrAbsolute(): number {
    return this.fetchWord();
  }

  // --- Instruction Population ---
  private populateInstructions(): void {
    // NOP (0xEA)
    this.instructions[0xEA] = {
      execute: (cpu) => {
        // No operation
      }
    };

    // LDA Immediate (0xA9)
    this.instructions[0xA9] = {
      execute: (cpu) => {
        const value = cpu.operandImmediate();
        cpu.A = value;
        cpu.updateZeroNegativeFlags(cpu.A);
      }
    };

    // LDA ZeroPage (0xA5)
    this.instructions[0xA5] = {
      execute: (cpu) => {
        const value = cpu.operandZeroPage();
        cpu.A = value;
        cpu.updateZeroNegativeFlags(cpu.A);
      }
    };

    // STA ZeroPage (0x85)
    this.instructions[0x85] = {
      execute: (cpu) => {
        const addr = cpu.addrZeroPage();
        cpu.memory.write(addr, cpu.A);
      }
    };

    // JMP Absolute (0x4C)
    this.instructions[0x4C] = {
      execute: (cpu) => {
        const addr = cpu.addrAbsolute();
        cpu.PC = addr;
      }
    };

    // BRK (0x00)
    this.instructions[0x00] = {
      execute: (cpu) => {
        cpu.fetchByte(); // BRK has a padding byte after opcode
        cpu.pushWord(cpu.PC);
        // Push status register with Break flag set
        cpu.pushByte(cpu.SR | CpuFlags.Break | CpuFlags.Unused);
        cpu.setFlag(CpuFlags.InterruptDisable, true);
        // Load interrupt vector
        const lo = cpu.memory.read(0xFFFE);
        const hi = cpu.memory.read(0xFFFF);
        cpu.PC = (hi << 8) | lo;
      }
    };
  }

  // --- Lifecycle Methods ---
  reset(): void {
    this.A = 0;
    this.X = 0;
    this.Y = 0;
    this.SP = 0xFD; // Reset SP value
    // Set flags: Interrupt Disable and Unused are set initially
    this.SR = CpuFlags.InterruptDisable | CpuFlags.Unused;

    // Read reset vector
    const lo = this.memory.read(0xFFFC);
    const hi = this.memory.read(0xFFFD);
    this.PC = (hi << 8) | lo;
  }

  step(): void {
    // TODO: Add cycle counting later
    const opcode = this.fetchByte();
    const instruction = this.instructions[opcode];

    if (!instruction) {
      throw new Error(
        `Unimplemented opcode: 0x${opcode.toString(16).toUpperCase()} at PC=0x${(this.PC - 1).toString(16).toUpperCase()}`
      );
    }

    instruction.execute(this);
  }
} 