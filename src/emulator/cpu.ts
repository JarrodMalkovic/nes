import { Memory } from './memory';

export class CPU {
  memory: Memory;
  A = 0;
  X = 0;
  Y = 0;
  PC = 0;
  SP = 0;
  zeroFlag = false;
  negativeFlag = false;

  constructor(memory: Memory) {
    this.memory = memory;
    this.reset();
  }

  reset(): void {
    this.A = 0;
    this.X = 0;
    this.Y = 0;
    this.SP = 0xFD;
    this.zeroFlag = false;
    this.negativeFlag = false;
    const lo = this.memory.read(0xFFFC);
    const hi = this.memory.read(0xFFFD);
    this.PC = (hi << 8) | lo;
  }

  step(): void {
    const opcode = this.memory.read(this.PC);
    switch (opcode) {
      case 0xEA: // NOP
        this.PC = (this.PC + 1) & 0xFFFF;
        break;
      case 0xA9: { // LDA immediate
        const value = this.memory.read(this.PC + 1);
        this.A = value;
        this.zeroFlag = this.A === 0;
        this.negativeFlag = (this.A & 0x80) !== 0;
        this.PC = (this.PC + 2) & 0xFFFF;
        break;
      }
      default:
        throw new Error(`Unimplemented opcode: ${opcode.toString(16)} at PC=${this.PC.toString(16)}`);
    }
  }
} 