import { describe, it, expect, beforeEach } from 'vitest'
import { Memory } from '../src/emulator/memory'

describe('Memory', () => {
  let mem: Memory

  beforeEach(() => {
    mem = new Memory()
  })

  it('should initialize RAM to zero', () => {
    expect(mem.read(0x0000)).toBe(0)
    expect(mem.read(0x0123)).toBe(0)
    expect(mem.read(0x07FF)).toBe(0)
  })

  it('should write and read back a byte value in RAM', () => {
    mem.write(0x0100, 0xAB)
    expect(mem.read(0x0100)).toBe(0xAB)
  })

  it('should mirror RAM writes every 0x800 bytes up to 0x1FFF', () => {
    mem.write(0x0000, 0x12)
    mem.write(0x0100, 0x34)

    expect(mem.read(0x0800)).toBe(0x12) // Mirror 1
    expect(mem.read(0x0900)).toBe(0x34)

    expect(mem.read(0x1000)).toBe(0x12) // Mirror 2
    expect(mem.read(0x1100)).toBe(0x34)

    expect(mem.read(0x1800)).toBe(0x12) // Mirror 3
    expect(mem.read(0x1900)).toBe(0x34)
  })

  it('should mask written values to 8-bit in RAM', () => {
    mem.write(0x0200, 0x1FF)
    expect(mem.read(0x0200)).toBe(0xFF)
  })

  it('should return 0 when reading from PPU registers', () => {
    expect(mem.read(0x2000)).toBe(0)
    expect(mem.read(0x2007)).toBe(0)
    // Test mirroring
    expect(mem.read(0x2008)).toBe(0) // Mirror of 0x2000
    expect(mem.read(0x3FFF)).toBe(0) // Mirror of 0x2007
  })

  it('should ignore writes to PPU registers', () => {
    mem.write(0x0100, 0xAA) // Write to RAM first
    mem.write(0x2000, 0xBB) // Attempt write to PPU $2000
    mem.write(0x2008, 0xCC) // Attempt write to PPU mirror $2008

    expect(mem.read(0x0100)).toBe(0xAA) // Check RAM is unaffected
    expect(mem.read(0x2000)).toBe(0)    // Check PPU reads 0
    expect(mem.read(0x2008)).toBe(0)    // Check PPU mirror reads 0
  })

  it('should return 0 when reading from unmapped addresses', () => {
    expect(mem.read(0x4020)).toBe(0) // Example APU/IO range
    expect(mem.read(0x8000)).toBe(0) // Example Cartridge range
    expect(mem.read(0xFFFF)).toBe(0)
  })

  it('should ignore writes to unmapped addresses', () => {
    mem.write(0x0100, 0xAA) // Write to RAM first
    mem.write(0x4020, 0xBB) // Attempt write to APU/IO
    mem.write(0x8000, 0xCC) // Attempt write to Cartridge

    expect(mem.read(0x0100)).toBe(0xAA) // Check RAM is unaffected
    expect(mem.read(0x4020)).toBe(0)
    expect(mem.read(0x8000)).toBe(0)
  })
}) 