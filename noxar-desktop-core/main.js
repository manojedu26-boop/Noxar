const { app, BrowserWindow, globalShortcut, clipboard, ipcMain } = require('electron');
const path = require('path');

// Single Instance Lock to prevent duplicate zombie windows
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  return;
}

let mainWindow;
let isCoinState = false;

app.on('second-instance', (event, commandLine, workingDirectory) => {
  if (mainWindow) {
    isCoinState = false;
    // If minimized or docked as a coin, expand it back to full size and correct position
    mainWindow.setSize(420, 620);
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    mainWindow.setPosition(width - 440, Math.floor((height - 620) / 2));
    
    // Bring window to front and focus
    mainWindow.show();
    mainWindow.focus();

    // Inform the frontend to restore/expand its UI from the coin state
    mainWindow.webContents.send('window-restore-ui');
  }
});


function createWindow() {
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: 420,
    height: 620,
    x: width - 440,
    y: Math.floor((height - 620) / 2),
    title: "Noxar Core",
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[CONSOLE] ${message} (${sourceId}:${line})`);
  });

  // Load the static production build files if packaged, otherwise load Vite local dev server
  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Create desktop shortcut if it doesn't exist
  try {
    const { shell } = require('electron');
    const fs = require('fs');
    const desktopPath = app.getPath('desktop');
    const shortcutPath = path.join(desktopPath, 'noxar.lnk');
    if (!fs.existsSync(shortcutPath)) {
      shell.writeShortcutLink(shortcutPath, 'create', {
        target: app.getPath('exe'),
        description: 'Launch noxar Diagnostic Assistant',
        workingDirectory: path.dirname(app.getPath('exe'))
      });
      console.log('Desktop shortcut created successfully.');
    }
  } catch (err) {
    console.error('Failed to create desktop shortcut:', err);
  }

  createWindow();

  const handleShortcutTrigger = () => {
    if (!mainWindow) return;

    if (isCoinState) {
      isCoinState = false;
      const { exec } = require('child_process');
      exec(`powershell -Command "[void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); [System.Windows.Forms.SendKeys]::SendWait('^c')"`, () => {
        setTimeout(() => {
          const { screen } = require('electron');
          const primaryDisplay = screen.getPrimaryDisplay();
          const { width, height } = primaryDisplay.workAreaSize;
          mainWindow.setSize(420, 620);
          mainWindow.setPosition(width - 440, Math.floor((height - 620) / 2));
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('window-restore-ui');
          
          const text = clipboard.readText();
          mainWindow.webContents.send('clipboard-trigger', text);
        }, 80);
      });
      return;
    }

    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      const { exec } = require('child_process');
      exec(`powershell -Command "[void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); [System.Windows.Forms.SendKeys]::SendWait('^c')"`, () => {
        setTimeout(() => {
          mainWindow.show();
          mainWindow.focus();
          
          const text = clipboard.readText();
          mainWindow.webContents.send('clipboard-trigger', text);
        }, 80);
      });
    }
  };

  // Define absolute registration loop wrapper
  const registerShortcuts = () => {
    // Register the global hotkey Ctrl+Space
    if (!globalShortcut.isRegistered('Ctrl+Space')) {
      const ret1 = globalShortcut.register('Ctrl+Space', handleShortcutTrigger);
      if (ret1) {
        console.log('Ctrl+Space successfully registered');
      } else {
        console.warn('Ctrl+Space shortcut registration failed');
      }
    }

    // Register Ctrl+Alt+Space as a highly reliable fallback on Windows
    if (!globalShortcut.isRegistered('Ctrl+Alt+Space')) {
      const ret2 = globalShortcut.register('Ctrl+Alt+Space', handleShortcutTrigger);
      if (ret2) {
        console.log('Ctrl+Alt+Space successfully registered');
      } else {
        console.error('Ctrl+Alt+Space shortcut registration failed');
      }
    }
  };

  // Perform initial registration
  registerShortcuts();

  // Force re-registration on focus, blur, and visibility toggles
  if (mainWindow) {
    mainWindow.on('blur', registerShortcuts);
    mainWindow.on('focus', registerShortcuts);
    mainWindow.on('show', registerShortcuts);
  }

  // Setup periodic health check loop (every 2000ms) to ensure low-level registration persists
  setInterval(registerShortcuts, 2000);

  // Handle window minimization to coin
  ipcMain.on('window-minimize-to-coin', () => {
    if (!mainWindow) return;
    isCoinState = true;
    // Force the OS window shell itself to shrink down to a tiny box
    mainWindow.setSize(64, 64, true); 
    
    // Send it cleanly to the corner out of your way
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    mainWindow.setPosition(width - 100, height - 100);
  });

  // Handle window expansion from coin
  ipcMain.on('window-expand-from-coin', () => {
    if (!mainWindow) return;
    isCoinState = false;
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    mainWindow.setSize(420, 620);
    mainWindow.setPosition(width - 440, Math.floor((height - 620) / 2));
    mainWindow.focus();
  });

  // Handle window drag movements
  ipcMain.on('window-drag', (event, { deltaX, deltaY }) => {
    if (!mainWindow) return;
    const [x, y] = mainWindow.getPosition();
    mainWindow.setPosition(x + deltaX, y + deltaY);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('will-quit', () => {
  // Clean up global shortcuts
  globalShortcut.unregisterAll();
});
