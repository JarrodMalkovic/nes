import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Clock } from '../src/emulator/clock'
import { CPU } from '../src/emulator/cpu'
import { PPU, SCREEN_WIDTH, SCREEN_HEIGHT } from '../src/emulator/ppu'
import { Memory } from '../src/emulator/memory' // Needed for mock CPU constructor

// Mock the components
vi.mock('../src/emulator/cpu');
vi.mock('../src/emulator/ppu');
vi.mock('../src/emulator/memory'); // Mock Memory as well

const CPU_CYCLES_PER_FRAME = 29780;

describe('Clock', () => {
  let clock: Clock;
  let mockCpu: CPU;
  let mockPpu: PPU;
  let mockMemory: Memory;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Create mock instances. Vitest automatically uses the mocked constructors.
    // We need a Memory instance even if mocked, as CPU constructor expects it.
    mockMemory = new Memory();
    mockCpu = new CPU(mockMemory);
    mockPpu = new PPU();

    // Mock the methods we want to track on the instances
    // We need vi.fn() here because the default mocks might not be functions
    mockCpu.step = vi.fn();
    mockPpu.renderFrame = vi.fn().mockReturnValue(
        // Provide a dummy return value matching the expected type
        new Uint8ClampedArray(SCREEN_WIDTH * SCREEN_HEIGHT * 4)
    );

    // Instantiate Clock with the mocked components
    clock = new Clock(mockCpu, mockPpu);
  });

  it('should call cpu.step() the correct number of times per frame', () => {
    clock.stepFrame();
    expect(mockCpu.step).toHaveBeenCalledTimes(CPU_CYCLES_PER_FRAME);
  });

  it('should call ppu.renderFrame() once per frame', () => {
    clock.stepFrame();
    expect(mockPpu.renderFrame).toHaveBeenCalledTimes(1);
  });

  it('should call ppu.renderFrame() after cpu.step() calls', () => {
    // Vitest mocks record call order. We can check this implicitly.
    // If renderFrame was called before the loop finished, the step count would be wrong.
    // We can also explicitly check the order if needed, but usually not necessary
    // when the structure is simple like this.
    clock.stepFrame();
    // Verify step was called many times *before* renderFrame was called once.
    expect(mockCpu.step).toHaveBeenCalledTimes(CPU_CYCLES_PER_FRAME);
    expect(mockPpu.renderFrame).toHaveBeenCalledTimes(1);

    // Example of explicit order check (if needed, requires careful setup)
    // const stepMockOrder = (mockCpu.step as Mock).mock.invocationCallOrder[CPU_CYCLES_PER_FRAME - 1];
    // const renderMockOrder = (mockPpu.renderFrame as Mock).mock.invocationCallOrder[0];
    // expect(stepMockOrder).toBeLessThan(renderMockOrder);
  });

   it('should return the frame buffer from ppu.renderFrame()', () => {
    const dummyFrame = new Uint8ClampedArray(SCREEN_WIDTH * SCREEN_HEIGHT * 4).fill(128);
    mockPpu.renderFrame = vi.fn().mockReturnValue(dummyFrame);

    const result = clock.stepFrame();
    expect(result).toBe(dummyFrame);
    expect(mockPpu.renderFrame).toHaveBeenCalledTimes(1);
  });
}); 