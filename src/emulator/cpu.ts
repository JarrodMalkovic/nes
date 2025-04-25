import { Memory } from './memory';

// --- Status Flags ---
export enum CpuFlags {
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
  bytes: number;
  cycles: number;
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

  // Cycle counting
  cycles = 0; // Total cycles executed

  // Instruction lookup table
  private instructions: Record<number, Instruction> = {};

  // Interrupt vectors
  private static readonly NMI_VECTOR = 0xFFFA;
  private static readonly RESET_VECTOR = 0xFFFC;
  private static readonly IRQ_VECTOR = 0xFFFE;

  // Interrupt state
  private pendingNMI = false;
  private pendingIRQ = false;

  constructor(memory: Memory) {
    this.memory = memory;
    this.populateInstructions();
    this.reset();
  }

  // --- Flag Operations ---
  setFlag(flag: CpuFlags, value: boolean): void {
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
  private operandImmediate(): number {
    return this.fetchByte();
  }

  private operandZeroPage(): number {
    const addr = this.fetchByte();
    return addr;
  }

  private operandZeroPageX(): number {
    const addr = (this.fetchByte() + this.X) & 0xFF;
    return addr;
  }

  private operandZeroPageY(): number {
    const addr = (this.fetchByte() + this.Y) & 0xFF;
    return addr;
  }

  private operandAbsolute(): number {
    const addr = this.fetchWord();
    return addr;
  }

  private operandAbsoluteX(): number {
    const baseAddr = this.fetchWord();
    const addr = (baseAddr + this.X) & 0xFFFF;
    return addr;
  }

  private operandAbsoluteY(): number {
    const baseAddr = this.fetchWord();
    const addr = (baseAddr + this.Y) & 0xFFFF;
    return addr;
  }

  private operandIndirectX(): number {
    const zeroPageAddr = (this.fetchByte() + this.X) & 0xFF;
    const lo = this.memory.read(zeroPageAddr);
    const hi = this.memory.read((zeroPageAddr + 1) & 0xFF);
    const addr = (hi << 8) | lo;
    return addr;
  }

  private operandIndirectY(): number {
    const zeroPageAddr = this.fetchByte();
    const lo = this.memory.read(zeroPageAddr);
    const hi = this.memory.read((zeroPageAddr + 1) & 0xFF);
    const baseAddr = (hi << 8) | lo;
    const addr = (baseAddr + this.Y) & 0xFFFF;
    return addr;
  }

  // --- Addressing Mode Address Fetchers ---
  // Used by STA, JMP etc. where we need the target address itself.

  private addrZeroPage(): number {
    return this.fetchByte();
  }

  private addrZeroPageX(): number {
    return (this.fetchByte() + this.X) & 0xFF;
  }

  private addrZeroPageY(): number {
    return (this.fetchByte() + this.Y) & 0xFF;
  }

  private addrAbsolute(): number {
    return this.fetchWord();
  }

  private addrAbsoluteX(): number {
    const baseAddr = this.fetchWord();
    return (baseAddr + this.X) & 0xFFFF;
  }

  private addrAbsoluteY(): number {
    const baseAddr = this.fetchWord();
    return (baseAddr + this.Y) & 0xFFFF;
  }

  private addrIndirectX(): number {
    const zeroPageAddr = (this.fetchByte() + this.X) & 0xFF;
    const lo = this.memory.read(zeroPageAddr);
    const hi = this.memory.read((zeroPageAddr + 1) & 0xFF);
    return (hi << 8) | lo;
  }

  private addrIndirectY(): number {
    const zeroPageAddr = this.fetchByte();
    const lo = this.memory.read(zeroPageAddr);
    const hi = this.memory.read((zeroPageAddr + 1) & 0xFF);
    const baseAddr = (hi << 8) | lo;
    return (baseAddr + this.Y) & 0xFFFF;
  }

  // --- Arithmetic Helpers ---
  private add(value: number): void {
    const carry = this.getFlag(CpuFlags.Carry) ? 1 : 0;
    const sum = this.A + value + carry;
    
    // Set carry flag
    this.setFlag(CpuFlags.Carry, sum > 0xFF);
    
    // Set overflow flag
    const hasOverflow = (~(this.A ^ value) & (this.A ^ sum) & 0x80) !== 0;
    this.setFlag(CpuFlags.Overflow, hasOverflow);
    
    this.A = sum & 0xFF;
    this.updateZeroNegativeFlags(this.A);
  }

  private subtract(value: number): void {
    // 6502 subtraction is implemented as addition with one's complement
    const carry = this.getFlag(CpuFlags.Carry) ? 1 : 0;
    const oneComplement = (~value) & 0xFF;
    this.add(oneComplement);
  }

  private compare(register: number, value: number): void {
    const result = (register - value) & 0xFF;
    this.setFlag(CpuFlags.Carry, register >= value);
    this.updateZeroNegativeFlags(result);
  }

  // --- Bit Operation Helpers ---
  private and(value: number): number {
    this.A &= value;
    this.updateZeroNegativeFlags(this.A);
    return 2; // Base cycle count for AND operation
  }

  private ora(value: number): number {
    this.A |= value;
    this.updateZeroNegativeFlags(this.A);
    return 2; // Base cycle count for ORA operation
  }

  private eor(value: number): number {
    this.A ^= value;
    this.updateZeroNegativeFlags(this.A);
    return 2; // Base cycle count for EOR operation
  }

  private bit(value: number): number {
    const result = this.A & value;
    this.setFlag(CpuFlags.Zero, result === 0);
    this.setFlag(CpuFlags.Negative, (value & 0x80) !== 0);
    this.setFlag(CpuFlags.Overflow, (value & 0x40) !== 0);
    return 0;
  }

  // --- Increment/Decrement Helpers ---
  private incrementMemory(addr: number): void {
    const value = (this.memory.read(addr) + 1) & 0xFF;
    this.memory.write(addr, value);
    this.updateZeroNegativeFlags(value);
  }

  private decrementMemory(addr: number): void {
    const value = (this.memory.read(addr) - 1) & 0xFF;
    this.memory.write(addr, value);
    this.updateZeroNegativeFlags(value);
  }

  // --- Shift and Rotate Helpers ---
  private asl(value: number): number {
    this.setFlag(CpuFlags.Carry, (value & 0x80) !== 0);
    const result = (value << 1) & 0xFF;
    this.updateZeroNegativeFlags(result);
    return result;
  }

  private lsr(value: number): number {
    this.setFlag(CpuFlags.Carry, (value & 0x01) !== 0);
    const result = value >> 1;
    this.updateZeroNegativeFlags(result);
    return result;
  }

  private rol(value: number): number {
    const oldCarry = this.getFlag(CpuFlags.Carry) ? 1 : 0;
    this.setFlag(CpuFlags.Carry, (value & 0x80) !== 0);
    const result = ((value << 1) | oldCarry) & 0xFF;
    this.updateZeroNegativeFlags(result);
    return result;
  }

  private ror(value: number): number {
    const oldCarry = this.getFlag(CpuFlags.Carry) ? 0x80 : 0;
    this.setFlag(CpuFlags.Carry, (value & 0x01) !== 0);
    const result = (value >> 1) | oldCarry;
    this.updateZeroNegativeFlags(result);
    return result;
  }

  // --- Helper for checking page boundary crossing ---
  private pageCrossed(addr1: number, addr2: number): boolean {
    return (addr1 & 0xFF00) !== (addr2 & 0xFF00);
  }

  // --- Instruction Population ---
  private populateInstructions(): void {
    // BRK - Force Interrupt
    this.instructions[0x00] = {
      bytes: 1,
      cycles: 7,
      execute: (cpu) => {
        cpu.pushWord(cpu.PC + 2);
        cpu.pushByte(cpu.SR);
        cpu.PC = cpu.fetchWord();
        cpu.setFlag(CpuFlags.Break, true);
      }
    };

    // NOP - No Operation
    this.instructions[0xEA] = {
      bytes: 1,
      cycles: 2,
      execute: () => {}
    };

    // LDA - Load Accumulator (Immediate)
    this.instructions[0xA9] = {
      bytes: 2,
      cycles: 2,
      execute: (cpu) => {
        cpu.A = cpu.operandImmediate();
        cpu.setFlag(CpuFlags.Zero, cpu.A === 0);
        cpu.setFlag(CpuFlags.Negative, (cpu.A & 0x80) !== 0);
      }
    };

    // LDA - Load Accumulator (Zero Page)
    this.instructions[0xA5] = {
      bytes: 2,
      cycles: 3,
      execute: (cpu) => {
        const address = cpu.operandZeroPage();
        cpu.A = cpu.memory.read(address);
        cpu.setFlag(CpuFlags.Zero, cpu.A === 0);
        cpu.setFlag(CpuFlags.Negative, (cpu.A & 0x80) !== 0);
      }
    };

    // STA - Store Accumulator
    this.instructions[0x85] = { // STA Zero Page
      bytes: 3,
      cycles: 3,
      execute: (cpu) => {
        const addr = cpu.addrZeroPage();
        cpu.memory.write(addr, cpu.A);
      }
    };
    
    this.instructions[0x95] = { // STA Zero Page,X
      bytes: 4,
      cycles: 4,
      execute: (cpu) => {
        const addr = cpu.addrZeroPageX();
        cpu.memory.write(addr, cpu.A);
      }
    };
    
    this.instructions[0x8D] = { // STA Absolute
      bytes: 4,
      cycles: 4,
      execute: (cpu) => {
        const addr = cpu.addrAbsolute();
        cpu.memory.write(addr, cpu.A);
      }
    };
    
    this.instructions[0x9D] = { // STA Absolute,X
      bytes: 5,
      cycles: 5,
      execute: (cpu) => {
        const addr = cpu.addrAbsoluteX();
        cpu.memory.write(addr, cpu.A);
      }
    };
    
    this.instructions[0x99] = { // STA Absolute,Y
      bytes: 5,
      cycles: 5,
      execute: (cpu) => {
        const addr = cpu.addrAbsoluteY();
        cpu.memory.write(addr, cpu.A);
      }
    };
    
    this.instructions[0x81] = { // STA (Indirect,X)
      bytes: 6,
      cycles: 6,
      execute: (cpu) => {
        const addr = cpu.addrIndirectX();
        cpu.memory.write(addr, cpu.A);
      }
    };
    
    this.instructions[0x91] = { // STA (Indirect),Y
      bytes: 6,
      cycles: 6,
      execute: (cpu) => {
        const addr = cpu.addrIndirectY();
        cpu.memory.write(addr, cpu.A);
      }
    };

    // JMP - Jump (Absolute)
    this.instructions[0x4C] = {
      bytes: 3,
      cycles: 3,
      execute: (cpu) => {
        cpu.PC = cpu.operandAbsolute();
      }
    };
    
    this.instructions[0xB5] = {
      bytes: 4,
      cycles: 4,
      execute: (cpu) => {
        const addr = cpu.operandZeroPageX();
        cpu.A = cpu.memory.read(addr);
        cpu.updateZeroNegativeFlags(cpu.A);
      }
    };
    
    this.instructions[0xAD] = { // LDA Absolute
      bytes: 4,
      cycles: 4,
      execute: (cpu) => {
        const value = cpu.operandAbsolute();
        cpu.A = value;
        cpu.updateZeroNegativeFlags(cpu.A);
        return 0;
      }
    };
    
    this.instructions[0xBD] = { // LDA Absolute,X
      bytes: 4,
      cycles: 4,
      execute: (cpu) => {
        const value = cpu.operandAbsoluteX();
        cpu.A = value;
        cpu.updateZeroNegativeFlags(cpu.A);
        return 4;
      }
    };
    
    this.instructions[0xB9] = { // LDA Absolute,Y
      bytes: 4,
      cycles: 4,
      execute: (cpu) => {
        const value = cpu.operandAbsoluteY();
        cpu.A = value;
        cpu.updateZeroNegativeFlags(cpu.A);
        return 4;
      }
    };
    
    this.instructions[0xA1] = { // LDA (Indirect,X)
      bytes: 6,
      cycles: 6,
      execute: (cpu) => {
        const value = cpu.operandIndirectX();
        cpu.A = value;
        cpu.updateZeroNegativeFlags(cpu.A);
        return 0;
      }
    };
    
    this.instructions[0xB1] = { // LDA (Indirect),Y
      bytes: 5,
      cycles: 5,
      execute: (cpu) => {
        const value = cpu.operandIndirectY();
        cpu.A = value;
        cpu.updateZeroNegativeFlags(cpu.A);
        return 5;
      }
    };

    // LDX - Load X Register
    this.instructions[0xA2] = { // LDX Immediate
      bytes: 2,
      cycles: 2,
      execute: (cpu) => {
        cpu.X = cpu.operandImmediate();
        cpu.updateZeroNegativeFlags(cpu.X);
      }
    };
    
    this.instructions[0xA6] = { // LDX Zero Page
      bytes: 3,
      cycles: 3,
      execute: (cpu) => {
        const addr = cpu.operandZeroPage();
        cpu.X = cpu.memory.read(addr);
        cpu.updateZeroNegativeFlags(cpu.X);
      }
    };
    
    this.instructions[0xB6] = { // LDX Zero Page,Y
      bytes: 4,
      cycles: 4,
      execute: (cpu) => {
        const addr = cpu.operandZeroPageY();
        cpu.X = cpu.memory.read(addr);
        cpu.updateZeroNegativeFlags(cpu.X);
      }
    };
    
    this.instructions[0xAE] = { // LDX Absolute
      bytes: 4,
      cycles: 4,
      execute: (cpu) => {
        const addr = cpu.operandAbsolute();
        cpu.X = cpu.memory.read(addr);
        cpu.updateZeroNegativeFlags(cpu.X);
      }
    };
    
    this.instructions[0xBE] = { // LDX Absolute,Y
      bytes: 4,
      cycles: 4, // +1 if page boundary crossed
      execute: (cpu) => {
        const addr = cpu.operandAbsoluteY();
        cpu.X = cpu.memory.read(addr);
        cpu.updateZeroNegativeFlags(cpu.X);
      }
    };

    // LDY - Load Y Register
    this.instructions[0xA0] = { // LDY Immediate
      bytes: 2,
      cycles: 2,
      execute: (cpu) => {
        cpu.Y = cpu.operandImmediate();
        cpu.updateZeroNegativeFlags(cpu.Y);
      }
    };
    
    this.instructions[0xA4] = { // LDY Zero Page
      bytes: 3,
      cycles: 3,
      execute: (cpu) => {
        const addr = cpu.operandZeroPage();
        cpu.Y = cpu.memory.read(addr);
        cpu.updateZeroNegativeFlags(cpu.Y);
      }
    };
    
    this.instructions[0xB4] = { // LDY Zero Page,X
      bytes: 4,
      cycles: 4,
      execute: (cpu) => {
        const addr = cpu.operandZeroPageX();
        cpu.Y = cpu.memory.read(addr);
        cpu.updateZeroNegativeFlags(cpu.Y);
      }
    };
    
    this.instructions[0xAC] = { // LDY Absolute
      bytes: 4,
      cycles: 4,
      execute: (cpu) => {
        const addr = cpu.operandAbsolute();
        cpu.Y = cpu.memory.read(addr);
        cpu.updateZeroNegativeFlags(cpu.Y);
      }
    };
    
    this.instructions[0xBC] = { // LDY Absolute,X
      bytes: 4,
      cycles: 4, // +1 if page boundary crossed
      execute: (cpu) => {
        const addr = cpu.operandAbsoluteX();
        cpu.Y = cpu.memory.read(addr);
        cpu.updateZeroNegativeFlags(cpu.Y);
      }
    };

    // STX - Store X Register
    this.instructions[0x86] = { // STX Zero Page
      bytes: 3,
      cycles: 3,
      execute: (cpu) => {
        const addr = cpu.addrZeroPage();
        cpu.memory.write(addr, cpu.X);
      }
    };
    
    this.instructions[0x96] = { // STX Zero Page,Y
      bytes: 4,
      cycles: 4,
      execute: (cpu) => {
        const addr = cpu.addrZeroPageY();
        cpu.memory.write(addr, cpu.X);
      }
    };
    
    this.instructions[0x8E] = { // STX Absolute
      bytes: 4,
      cycles: 4,
      execute: (cpu) => {
        const addr = cpu.addrAbsolute();
        cpu.memory.write(addr, cpu.X);
      }
    };

    // STY - Store Y Register
    this.instructions[0x84] = { // STY Zero Page
      bytes: 3,
      cycles: 3,
      execute: (cpu) => {
        const addr = cpu.addrZeroPage();
        cpu.memory.write(addr, cpu.Y);
      }
    };
    
    this.instructions[0x94] = { // STY Zero Page,X
      bytes: 4,
      cycles: 4,
      execute: (cpu) => {
        const addr = cpu.addrZeroPageX();
        cpu.memory.write(addr, cpu.Y);
      }
    };
    
    this.instructions[0x8C] = { // STY Absolute
      bytes: 4,
      cycles: 4,
      execute: (cpu) => {
        const addr = cpu.addrAbsolute();
        cpu.memory.write(addr, cpu.Y);
      }
    };

    // --- Arithmetic Operations ---

    // ADC - Add with Carry
    this.instructions[0x69] = { // ADC Immediate
      bytes: 2,
      cycles: 2,
      execute: (cpu) => {
        cpu.add(cpu.operandImmediate());
      }
    };
    
    this.instructions[0x65] = { // ADC Zero Page
      bytes: 3,
      cycles: 3,
      execute: (cpu) => {
        const addr = cpu.operandZeroPage();
        cpu.add(cpu.memory.read(addr));
      }
    };
    
    this.instructions[0x75] = { // ADC Zero Page,X
      bytes: 4,
      cycles: 4,
      execute: (cpu) => {
        const addr = cpu.operandZeroPageX();
        cpu.add(cpu.memory.read(addr));
      }
    };
    
    this.instructions[0x6D] = { // ADC Absolute
      bytes: 4,
      cycles: 4,
      execute: (cpu) => {
        const addr = cpu.operandAbsolute();
        cpu.add(cpu.memory.read(addr));
      }
    };
    
    this.instructions[0x7D] = { // ADC Absolute,X
      bytes: 4,
      cycles: 4, // +1 if page boundary crossed
      execute: (cpu) => {
        const addr = cpu.operandAbsoluteX();
        cpu.add(cpu.memory.read(addr));
      }
    };
    
    this.instructions[0x79] = { // ADC Absolute,Y
      bytes: 4,
      cycles: 4, // +1 if page boundary crossed
      execute: (cpu) => {
        const addr = cpu.operandAbsoluteY();
        cpu.add(cpu.memory.read(addr));
      }
    };
    
    this.instructions[0x61] = { // ADC (Indirect,X)
      bytes: 6,
      cycles: 6,
      execute: (cpu) => {
        const addr = cpu.operandIndirectX();
        cpu.add(cpu.memory.read(addr));
      }
    };
    
    this.instructions[0x71] = { // ADC (Indirect),Y
      bytes: 5,
      cycles: 5, // +1 if page boundary crossed
      execute: (cpu) => {
        const addr = cpu.operandIndirectY();
        cpu.add(cpu.memory.read(addr));
      }
    };

    // SBC - Subtract with Carry
    this.instructions[0xE9] = { // SBC Immediate
      bytes: 2,
      cycles: 2,
      execute: (cpu) => {
        cpu.subtract(cpu.operandImmediate());
      }
    };
    
    this.instructions[0xE5] = { // SBC Zero Page
      bytes: 3,
      cycles: 3,
      execute: (cpu) => {
        const addr = cpu.operandZeroPage();
        cpu.subtract(cpu.memory.read(addr));
      }
    };
    
    this.instructions[0xF5] = { // SBC Zero Page,X
      bytes: 4,
      cycles: 4,
      execute: (cpu) => {
        const addr = cpu.operandZeroPageX();
        cpu.subtract(cpu.memory.read(addr));
      }
    };
    
    this.instructions[0xED] = { // SBC Absolute
      bytes: 4,
      cycles: 4,
      execute: (cpu) => {
        const addr = cpu.operandAbsolute();
        cpu.subtract(cpu.memory.read(addr));
      }
    };
    
    this.instructions[0xFD] = { // SBC Absolute,X
      bytes: 4,
      cycles: 4, // +1 if page boundary crossed
      execute: (cpu) => {
        const addr = cpu.operandAbsoluteX();
        cpu.subtract(cpu.memory.read(addr));
      }
    };
    
    this.instructions[0xF9] = { // SBC Absolute,Y
      bytes: 4,
      cycles: 4, // +1 if page boundary crossed
      execute: (cpu) => {
        const addr = cpu.operandAbsoluteY();
        cpu.subtract(cpu.memory.read(addr));
      }
    };
    
    this.instructions[0xE1] = { // SBC (Indirect,X)
      bytes: 6,
      cycles: 6,
      execute: (cpu) => {
        const addr = cpu.operandIndirectX();
        cpu.subtract(cpu.memory.read(addr));
      }
    };
    
    this.instructions[0xF1] = { // SBC (Indirect),Y
      bytes: 5,
      cycles: 5, // +1 if page boundary crossed
      execute: (cpu) => {
        const addr = cpu.operandIndirectY();
        cpu.subtract(cpu.memory.read(addr));
      }
    };

    // --- Compare Operations ---

    // CMP - Compare Accumulator
    this.instructions[0xC9] = { // CMP Immediate
      bytes: 2,
      cycles: 2,
      execute: (cpu) => {
        cpu.compare(cpu.A, cpu.operandImmediate());
      }
    };
    
    this.instructions[0xC5] = { // CMP Zero Page
      bytes: 3,
      cycles: 3,
      execute: (cpu) => {
        const addr = cpu.operandZeroPage();
        cpu.compare(cpu.A, cpu.memory.read(addr));
      }
    };
    
    this.instructions[0xD5] = { // CMP Zero Page,X
      bytes: 4,
      cycles: 4,
      execute: (cpu) => {
        const addr = cpu.operandZeroPageX();
        cpu.compare(cpu.A, cpu.memory.read(addr));
      }
    };
    
    this.instructions[0xCD] = { // CMP Absolute
      bytes: 4,
      cycles: 4,
      execute: (cpu) => {
        const addr = cpu.operandAbsolute();
        cpu.compare(cpu.A, cpu.memory.read(addr));
      }
    };
    
    this.instructions[0xDD] = { // CMP Absolute,X
      bytes: 4,
      cycles: 4, // +1 if page boundary crossed
      execute: (cpu) => {
        const addr = cpu.operandAbsoluteX();
        cpu.compare(cpu.A, cpu.memory.read(addr));
      }
    };
    
    this.instructions[0xD9] = { // CMP Absolute,Y
      bytes: 4,
      cycles: 4, // +1 if page boundary crossed
      execute: (cpu) => {
        const addr = cpu.operandAbsoluteY();
        cpu.compare(cpu.A, cpu.memory.read(addr));
      }
    };
    
    this.instructions[0xC1] = { // CMP (Indirect,X)
      bytes: 6,
      cycles: 6,
      execute: (cpu) => {
        const addr = cpu.operandIndirectX();
        cpu.compare(cpu.A, cpu.memory.read(addr));
      }
    };
    
    this.instructions[0xD1] = { // CMP (Indirect),Y
      bytes: 5,
      cycles: 5, // +1 if page boundary crossed
      execute: (cpu) => {
        const addr = cpu.operandIndirectY();
        cpu.compare(cpu.A, cpu.memory.read(addr));
      }
    };

    // CPX - Compare X Register
    this.instructions[0xE0] = { // CPX Immediate
      bytes: 2,
      cycles: 2,
      execute: (cpu) => {
        cpu.compare(cpu.X, cpu.operandImmediate());
      }
    };
    
    this.instructions[0xE4] = { // CPX Zero Page
      bytes: 3,
      cycles: 3,
      execute: (cpu) => {
        const addr = cpu.operandZeroPage();
        cpu.compare(cpu.X, cpu.memory.read(addr));
      }
    };
    
    this.instructions[0xEC] = { // CPX Absolute
      bytes: 4,
      cycles: 4,
      execute: (cpu) => {
        const addr = cpu.operandAbsolute();
        cpu.compare(cpu.X, cpu.memory.read(addr));
      }
    };

    // CPY - Compare Y Register
    this.instructions[0xC0] = { // CPY Immediate
      bytes: 2,
      cycles: 2,
      execute: (cpu) => {
        cpu.compare(cpu.Y, cpu.operandImmediate());
      }
    };
    
    this.instructions[0xC4] = { // CPY Zero Page
      bytes: 3,
      cycles: 3,
      execute: (cpu) => {
        const addr = cpu.operandZeroPage();
        cpu.compare(cpu.Y, cpu.memory.read(addr));
      }
    };
    
    this.instructions[0xCC] = { // CPY Absolute
      bytes: 4,
      cycles: 4,
      execute: (cpu) => {
        const addr = cpu.operandAbsolute();
        cpu.compare(cpu.Y, cpu.memory.read(addr));
      }
    };

    // --- Control Flow ---

    // JMP - Jump (Absolute)
    this.instructions[0x4C] = {
      bytes: 3,
      cycles: 3,
      execute: (cpu) => {
        cpu.PC = cpu.operandAbsolute();
      }
    };

    // Branch Instructions
    // BEQ - Branch if Equal (Zero Set)
    this.instructions[0xF0] = {
      bytes: 2,
      cycles: 2, // +1 if branch taken, +2 if page boundary crossed
      execute: (cpu) => {
        const offset = cpu.fetchByte();
        if (cpu.getFlag(CpuFlags.Zero)) {
          const oldPC = cpu.PC;
          // Convert offset to signed value (-128 to +127)
          const signedOffset = (offset ^ 0x80) - 0x80;
          cpu.PC = (cpu.PC + signedOffset) & 0xFFFF;
          // Add cycle if page boundary crossed
          if ((oldPC & 0xFF00) !== (cpu.PC & 0xFF00)) {
            cpu.cycles += 2;
          } else {
            cpu.cycles += 1;
          }
        }
      }
    };

    // BNE - Branch if Not Equal (Zero Clear)
    this.instructions[0xD0] = {
      bytes: 2,
      cycles: 2, // +1 if branch taken, +2 if page boundary crossed
      execute: (cpu) => {
        const offset = cpu.fetchByte();
        if (!cpu.getFlag(CpuFlags.Zero)) {
          const oldPC = cpu.PC;
          const signedOffset = (offset ^ 0x80) - 0x80;
          cpu.PC = (cpu.PC + signedOffset) & 0xFFFF;
          if ((oldPC & 0xFF00) !== (cpu.PC & 0xFF00)) {
            cpu.cycles += 2;
          } else {
            cpu.cycles += 1;
          }
        }
      }
    };

    // BCS - Branch if Carry Set
    this.instructions[0xB0] = {
      bytes: 2,
      cycles: 2, // +1 if branch taken, +2 if page boundary crossed
      execute: (cpu) => {
        const offset = cpu.fetchByte();
        if (cpu.getFlag(CpuFlags.Carry)) {
          const oldPC = cpu.PC;
          const signedOffset = (offset ^ 0x80) - 0x80;
          cpu.PC = (cpu.PC + signedOffset) & 0xFFFF;
          if ((oldPC & 0xFF00) !== (cpu.PC & 0xFF00)) {
            cpu.cycles += 2;
          } else {
            cpu.cycles += 1;
          }
        }
      }
    };

    // BCC - Branch if Carry Clear
    this.instructions[0x90] = {
      bytes: 2,
      cycles: 2, // +1 if branch taken, +2 if page boundary crossed
      execute: (cpu) => {
        const offset = cpu.fetchByte();
        if (!cpu.getFlag(CpuFlags.Carry)) {
          const oldPC = cpu.PC;
          const signedOffset = (offset ^ 0x80) - 0x80;
          cpu.PC = (cpu.PC + signedOffset) & 0xFFFF;
          if ((oldPC & 0xFF00) !== (cpu.PC & 0xFF00)) {
            cpu.cycles += 2;
          } else {
            cpu.cycles += 1;
          }
        }
      }
    };

    // BVS - Branch if Overflow Set
    this.instructions[0x70] = {
      bytes: 2,
      cycles: 2, // +1 if branch taken, +2 if page boundary crossed
      execute: (cpu) => {
        const offset = cpu.fetchByte();
        if (cpu.getFlag(CpuFlags.Overflow)) {
          const oldPC = cpu.PC;
          const signedOffset = (offset ^ 0x80) - 0x80;
          cpu.PC = (cpu.PC + signedOffset) & 0xFFFF;
          if ((oldPC & 0xFF00) !== (cpu.PC & 0xFF00)) {
            cpu.cycles += 2;
          } else {
            cpu.cycles += 1;
          }
        }
      }
    };

    // BVC - Branch if Overflow Clear
    this.instructions[0x50] = {
      bytes: 2,
      cycles: 2, // +1 if branch taken, +2 if page boundary crossed
      execute: (cpu) => {
        const offset = cpu.fetchByte();
        if (!cpu.getFlag(CpuFlags.Overflow)) {
          const oldPC = cpu.PC;
          const signedOffset = (offset ^ 0x80) - 0x80;
          cpu.PC = (cpu.PC + signedOffset) & 0xFFFF;
          if ((oldPC & 0xFF00) !== (cpu.PC & 0xFF00)) {
            cpu.cycles += 2;
          } else {
            cpu.cycles += 1;
          }
        }
      }
    };

    // BMI - Branch if Minus (Negative Set)
    this.instructions[0x30] = {
      bytes: 2,
      cycles: 2, // +1 if branch taken, +2 if page boundary crossed
      execute: (cpu) => {
        const offset = cpu.fetchByte();
        if (cpu.getFlag(CpuFlags.Negative)) {
          const oldPC = cpu.PC;
          const signedOffset = (offset ^ 0x80) - 0x80;
          cpu.PC = (cpu.PC + signedOffset) & 0xFFFF;
          if ((oldPC & 0xFF00) !== (cpu.PC & 0xFF00)) {
            cpu.cycles += 2;
          } else {
            cpu.cycles += 1;
          }
        }
      }
    };

    // BPL - Branch if Plus (Negative Clear)
    this.instructions[0x10] = {
      bytes: 2,
      cycles: 2, // +1 if branch taken, +2 if page boundary crossed
      execute: (cpu) => {
        const offset = cpu.fetchByte();
        if (!cpu.getFlag(CpuFlags.Negative)) {
          const oldPC = cpu.PC;
          const signedOffset = (offset ^ 0x80) - 0x80;
          cpu.PC = (cpu.PC + signedOffset) & 0xFFFF;
          if ((oldPC & 0xFF00) !== (cpu.PC & 0xFF00)) {
            cpu.cycles += 2;
          } else {
            cpu.cycles += 1;
          }
        }
      }
    };

    // RTI - Return from Interrupt
    this.instructions[0x40] = {
      bytes: 1,
      cycles: 6,
      execute: (cpu) => {
        cpu.returnFromInterrupt();
      }
    };
  }

  // --- Lifecycle Methods ---
  reset(): void {
    this.A = 0;
    this.X = 0;
    this.Y = 0;
    this.SP = 0xFD;
    this.SR = CpuFlags.InterruptDisable | CpuFlags.Unused;
    
    // Clear pending interrupts
    this.pendingNMI = false;
    this.pendingIRQ = false;

    // Read reset vector
    this.PC = this.memory.read(CPU.RESET_VECTOR) | (this.memory.read(CPU.RESET_VECTOR + 1) << 8);
  }

  step(): number {
    // Handle any pending interrupts first
    const interruptCycles = this.handleInterrupts();
    if (interruptCycles > 0) {
      return interruptCycles;
    }

    const opcode = this.fetchByte();
    const instruction = this.instructions[opcode];

    if (!instruction) {
      throw new Error(
        `Unimplemented opcode: 0x${opcode.toString(16).toUpperCase()} at PC=0x${(this.PC - 1).toString(16).toUpperCase()}`
      );
    }

    // Reset cycle count for this instruction
    this.cycles = 0;

    // Execute the instruction
    instruction.execute(this);

    // Add base cycles for the instruction
    this.cycles += instruction.cycles;

    return this.cycles;
  }

  /**
   * Triggers a Non-Maskable Interrupt (NMI)
   * Will be handled at the start of the next instruction
   */
  triggerNMI(): void {
    this.pendingNMI = true;
  }

  /**
   * Triggers an Interrupt Request (IRQ)
   * Will be handled at the start of the next instruction if interrupts are enabled
   */
  triggerIRQ(): void {
    this.pendingIRQ = true;
  }

  /**
   * Handles pending interrupts before executing the next instruction
   * NMI takes precedence over IRQ
   * @returns number of cycles taken by interrupt handling
   */
  private handleInterrupts(): number {
    let cycles = 0;

    if (this.pendingNMI) {
      cycles = this.handleNMI();
      this.pendingNMI = false;
    } else if (this.pendingIRQ && !this.getFlag(CpuFlags.InterruptDisable)) {
      cycles = this.handleIRQ();
      this.pendingIRQ = false;
    }

    return cycles;
  }

  /**
   * Handles a Non-Maskable Interrupt
   * @returns number of cycles taken (7)
   */
  private handleNMI(): number {
    // Push PC and status to stack
    this.pushWord(this.PC);
    this.pushByte(this.SR & ~CpuFlags.Break); // Break flag is cleared when pushed

    // Set interrupt disable flag
    this.setFlag(CpuFlags.InterruptDisable, true);

    // Load PC from NMI vector
    this.PC = this.memory.read(CPU.NMI_VECTOR) | (this.memory.read(CPU.NMI_VECTOR + 1) << 8);

    return 7; // NMI takes 7 cycles
  }

  /**
   * Handles an Interrupt Request
   * @returns number of cycles taken (7)
   */
  private handleIRQ(): number {
    // Push PC and status to stack
    this.pushWord(this.PC);
    this.pushByte(this.SR & ~CpuFlags.Break); // Break flag is cleared when pushed

    // Set interrupt disable flag
    this.setFlag(CpuFlags.InterruptDisable, true);

    // Load PC from IRQ vector
    this.PC = this.memory.read(CPU.IRQ_VECTOR) | (this.memory.read(CPU.IRQ_VECTOR + 1) << 8);

    return 7; // IRQ takes 7 cycles
  }

  /**
   * Returns from interrupt (RTI instruction)
   */
  private returnFromInterrupt(): void {
    // Pull status register, ignoring Break and Unused flags
    this.SR = this.pullByte();
    // Force Unused flag to 1
    this.SR |= CpuFlags.Unused;
    
    // Pull program counter
    this.PC = this.pullWord();
  }
} 