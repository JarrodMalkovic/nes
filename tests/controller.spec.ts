import { describe, it, expect, beforeEach } from 'vitest'
import { Controller, NesButton } from '../src/emulator/controller'

describe('Controller', () => {
  let controller: Controller;

  beforeEach(() => {
    controller = new Controller();
  })

  it('should initialize with no buttons pressed', () => {
    expect(controller.read()).toBe(0);
  })

  it('should set the correct bit when pressing A', () => {
    controller.press('A');
    expect(controller.read()).toBe(0b00000001);
  })

  it('should clear the correct bit when releasing A', () => {
    controller.press('A');
    expect(controller.read()).toBe(0b00000001); // Verify it was set
    controller.release('A');
    expect(controller.read()).toBe(0);
  })

  it('should handle pressing multiple buttons', () => {
    controller.press('A');
    controller.press('Up');
    controller.press('Right');
    expect(controller.read()).toBe(0b10010001);
  })

  it('should handle releasing one of multiple pressed buttons', () => {
    controller.press('A');
    controller.press('B');
    controller.press('Start');
    expect(controller.read()).toBe(0b00001011);

    controller.release('B');
    expect(controller.read()).toBe(0b00001001); // B released, A and Start remain

    controller.release('A');
    expect(controller.read()).toBe(0b00001000); // A released, Start remains

    controller.release('Start');
    expect(controller.read()).toBe(0); // All released
  })

  it('should handle pressing and releasing all buttons', () => {
    const allButtons: NesButton[] = ['A', 'B', 'Select', 'Start', 'Up', 'Down', 'Left', 'Right'];
    let expectedMask = 0;

    // Press all buttons
    for (const button of allButtons) {
      controller.press(button);
      // Manually compute expected mask to ensure ButtonBitmask is correct
      expectedMask |= (1 << allButtons.indexOf(button));
      expect(controller.read()).toBe(expectedMask);
    }

    expect(controller.read()).toBe(0b11111111);

    // Release all buttons in reverse order
    for (let i = allButtons.length - 1; i >= 0; i--) {
      const button = allButtons[i];
      controller.release(button);
      expectedMask &= ~(1 << i);
      expect(controller.read()).toBe(expectedMask);
    }

    expect(controller.read()).toBe(0);
  })
}) 