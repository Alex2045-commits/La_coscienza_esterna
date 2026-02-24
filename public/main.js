const { app, BrowserWindow } = require("electron");
const path = require("path");

// Permette autoplay audio/video senza gesture utente nell'app Electron.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

function createWindow() {
  const win = new BrowserWindow({
    fullscreen: true,               // schermo intero
    autoHideMenuBar: true,          // nasconde la barra del menu
    icon: path.join(__dirname, "public/sfondi/icona_gioco.jpg"), // icona finestra
    webPreferences: {
      preload: path.join(__dirname, "public/preload.js"), // file preload
      contextIsolation: true,      // più sicuro
      nodeIntegration: false,      // Node non disponibile in pagina
      enableRemoteModule: false    // disabilita Remote Module (deprecated)
    }
  });

  // Carica il file principale del gioco
  win.loadFile("public/index.html");

  // Opzionale: apri DevTools solo in sviluppo
  if (process.env.NODE_ENV === "development") {
    win.webContents.openDevTools();
  }
}

// Avvio dell'app
app.whenReady().then(() => {
  createWindow();

  // Su macOS, riapre finestra se non ce ne sono
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Chiude l'app quando tutte le finestre sono chiuse, tranne macOS
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
