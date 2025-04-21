import { app, BrowserWindow } from 'electron';
import path from 'node:path';

// The built directory structure
//
// ├─┬ dist-electron
// │ └── main.js    > Electron-Main
// ├─┬ dist
// │ └── index.html > Electron-Renderer
//
process.env.DIST = path.join(__dirname, '../dist');
// Ensure VITE_PUBLIC is defined or default to DIST
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(process.env.DIST, '../public')
  : process.env.DIST;

const distPath = process.env.DIST ?? ''; // Provide default empty string
const publicPath = process.env.VITE_PUBLIC ?? ''; // Provide default empty string

let win: BrowserWindow | null;
// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

function createWindow() {
  win = new BrowserWindow({
    // Use publicPath with a fallback icon name if needed
    icon: path.join(publicPath, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      // nodeIntegration: true,
      // contextIsolation: false,
    },
  });

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString());
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    // Open devTool if the app is not packaged
    win.webContents.openDevTools();
  } else {
    // Use distPath
    win.loadFile(path.join(distPath, 'index.html'));
  }
}

app.whenReady().then(createWindow);
