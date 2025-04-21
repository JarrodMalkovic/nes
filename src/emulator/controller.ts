export type NesButton =
  | 'A' | 'B' | 'Select' | 'Start' | 'Up' | 'Down' | 'Left' | 'Right';

const ButtonBitmask: Record<NesButton, number> = {
  A:      0b00000001,
  B:      0b00000010,
  Select: 0b00000100,
  Start:  0b00001000,
  Up:     0b00010000,
  Down:   0b00100000,
  Left:   0b01000000,
  Right:  0b10000000,
};

export class Controller {
  private state: number = 0;

  /**
   * Marks a button as pressed.
   * @param button The button to press.
   */
  press(button: NesButton): void {
    this.state |= ButtonBitmask[button];
  }

  /**
   * Marks a button as released.
   * @param button The button to release.
   */
  release(button: NesButton): void {
    this.state &= ~ButtonBitmask[button];
  }

  /**
   * Reads the current state of all buttons as a bitmask.
   * Note: In a real NES, reading is more complex due to serial shifting,
   * but this provides the instantaneous state for now.
   * @returns The 8-bit button state mask.
   */
  read(): number {
    return this.state;
  }
} 