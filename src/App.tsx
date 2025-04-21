import { useState, useRef, useEffect, useCallback } from 'react'
import {
  NesConsole,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
} from '@src/emulator' // Use path alias
import { createFakeNromRom } from '@root/tests/testUtils' // Use path alias for test util
import './App.css'

// Create a simple default ROM (e.g., 1 bank of NOPs)
const createDefaultRom = () => {
  const prgBank = new Uint8Array(16 * 1024).fill(0xEA); // NOP
  return createFakeNromRom({
    numPrgBanks: 1,
    prgData: [prgBank],
    resetVector: 0x8000,
  });
};

function App() {
  const [isRunning, setIsRunning] = useState(false);
  const [consoleInstance, setConsoleInstance] = useState<NesConsole | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameId = useRef<number | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  // Get canvas context when canvas mounts
  useEffect(() => {
    if (canvasRef.current) {
      ctxRef.current = canvasRef.current.getContext('2d', { willReadFrequently: true });
      if (ctxRef.current) {
         // Initial black screen draw
         ctxRef.current.fillStyle = 'black';
         ctxRef.current.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
      }
    }
  }, []);

  // The main emulator loop
  const gameLoop = useCallback(() => {
    if (!isRunning || !consoleInstance || !ctxRef.current) {
      return;
    }

    try {
      const frameBuffer = consoleInstance.runFrame();
      const imageData = new ImageData(frameBuffer, SCREEN_WIDTH, SCREEN_HEIGHT);
      ctxRef.current.putImageData(imageData, 0, 0);

      animationFrameId.current = requestAnimationFrame(gameLoop);
    } catch (error) {
      console.error('Emulator crashed:', error);
      setIsRunning(false); // Stop the loop on error
    }
  }, [isRunning, consoleInstance]);

  // Start/stop the loop
  useEffect(() => {
    if (isRunning) {
      animationFrameId.current = requestAnimationFrame(gameLoop);
    } else {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
    }
    // Cleanup function
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isRunning, gameLoop]);

  const handleStartClick = () => {
    if (!consoleInstance) {
      console.log('Initializing NES Console...');
      const romData = createDefaultRom();
      setConsoleInstance(new NesConsole(romData));
    }
    console.log('Starting emulator loop...');
    setIsRunning(true);
  };

  const handleStopClick = () => {
    console.log('Stopping emulator loop...');
    setIsRunning(false);
  };

  return (
    <>
      <h1>My NES Emulator</h1>
      <canvas
        ref={canvasRef}
        width={SCREEN_WIDTH}
        height={SCREEN_HEIGHT}
        style={{ border: '1px solid grey', imageRendering: 'pixelated', width: SCREEN_WIDTH*2, height: SCREEN_HEIGHT*2 }}
      />
      <div className="card">
        {!isRunning ? (
          <button onClick={handleStartClick}>Start</button>
        ) : (
          <button onClick={handleStopClick}>Stop</button>
        )}
      </div>
      {/* Basic info display */}
      {/* {consoleInstance && (
        <p>Cartridge loaded ({consoleInstance.cartridge.prgBanks.length} PRG banks)</p>
      )} */}
    </>
  )
}

export default App
