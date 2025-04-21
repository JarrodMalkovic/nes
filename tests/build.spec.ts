import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import packageJson from '../package.json'; // Import package.json to get version

// --- Configuration ---
const appName = packageJson.build.productName || packageJson.name;
const appVersion = packageJson.version;
// Adjust the executable path based on OS and electron-builder output structure
const platform = process.platform;
let executablePath: string;

if (platform === 'win32') {
  // Default output for NSIS installer is in release/<version>/
  executablePath = path.join(__dirname, `../release/${appVersion}/${appName}.exe`);
} else if (platform === 'darwin') { // macOS
  executablePath = path.join(__dirname, `../release/${appVersion}/${appName}.app/Contents/MacOS/${appName}`);
} else { // Linux (assuming AppImage)
  executablePath = path.join(__dirname, `../release/${appVersion}/${appName}-${appVersion}.AppImage`);
}
// --- End Configuration ---

// Skip tests if the build hasn't been run (executable doesn't exist)
const skipTests = !fs.existsSync(executablePath);

describe.skipIf(skipTests)('Build Smoke Test', () => {

  beforeAll(() => {
    if (skipTests) {
        console.warn(`Skipping build tests: Executable not found at ${executablePath}`);
        console.warn('Please run "bun run build" first.');
    }
    // On Linux/macOS, ensure the executable has execute permissions
    if ((platform === 'linux' || platform === 'darwin') && !skipTests) {
        try {
            fs.chmodSync(executablePath, '755');
        } catch (err) {
            console.warn(`Failed to chmod +x ${executablePath}:`, err);
        }
    }
  });

  it('packaged app should report the correct version and exit cleanly', () => {
    console.log(`Attempting to run: ${executablePath} --version`);

    // Spawn the packaged application with the --version flag
    const result = spawnSync(executablePath, ['--version'], {
      encoding: 'utf8',
      timeout: 10000, // Add a timeout in case the app hangs
      shell: false, // Important for predictable argument handling
    });

    // Check for spawn errors
    if (result.error) {
      console.error('Spawn Error:', result.error);
      console.error('Stderr:', result.stderr);
      console.error('Stdout:', result.stdout);
    }
    expect(result.error, `Spawn failed: ${result.error?.message}`).toBeUndefined();

    // Log output for debugging
    console.log('Spawn Result:', result);
    console.log('Stdout:', result.stdout);
    console.log('Stderr:', result.stderr);

    // Check for non-zero exit code
    expect(result.status, `App exited with status ${result.status}. Stderr: ${result.stderr}`).toBe(0);

    // Check if stdout contains the version string
    // Electron apps often print the Electron version first, then the app version
    expect(result.stdout, 'Stdout should contain the app version').toContain(appVersion);

    // Optional: Check stderr is empty (or only contains expected warnings)
    // expect(result.stderr, `Stderr should be empty`).toBe('');
  });
}); 