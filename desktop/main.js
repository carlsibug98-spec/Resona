/**
 * Resona desktop wrapper.
 * Boots the bundled Next.js standalone server as a hidden child process
 * (Electron's node runtime), waits for it, then opens the app in a native
 * window. Designed to fail fast and LOUD: every attempt is logged to
 * <userData>/server.log and real errors are shown instead of a vague timeout.
 */
const { app, BrowserWindow, shell, dialog, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");

// packaged: <install>/resources/{server, yt-dlp.exe}
// dev: desktop/staging/
const resourceBase = app.isPackaged
  ? process.resourcesPath
  : path.join(__dirname, "staging");
const serverDir = path.join(resourceBase, "server");

let win = null;
let splash = null;
let serverProc = null;
let serverReady = false;
let quitting = false;

// window controls for the custom header (see desktop/preload.js)
const winOf = (e) => BrowserWindow.fromWebContents(e.sender);
ipcMain.on("win:minimize", (e) => winOf(e)?.minimize());
ipcMain.on("win:toggle-max", (e) => {
  const w = winOf(e);
  if (!w) return;
  if (w.isMaximized()) w.unmaximize();
  else w.maximize();
});
ipcMain.on("win:close", (e) => winOf(e)?.close());
ipcMain.handle("win:is-max", (e) => winOf(e)?.isMaximized() ?? false);
let logFile = null;
// last lines of server output, for the error dialog
const tail = [];
function log(line) {
  const t = new Date().toISOString();
  const full = `[${t}] ${line}`;
  tail.push(full);
  if (tail.length > 40) tail.shift();
  try {
    if (logFile) fs.appendFileSync(logFile, full + "\n");
  } catch {}
}

function pickPort() {
  // random high port avoids conflicts with anything on a fixed port
  return 30000 + Math.floor(Math.random() * 25000);
}

function startServer(port, attempt) {
  const serverJs = path.join(serverDir, "server.js");
  if (!fs.existsSync(serverJs)) {
    throw new Error("Internal server bundle missing: " + serverJs);
  }
  log(`attempt ${attempt}: spawning server on port ${port}`);
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
  };
  // bundled yt-dlp resolver (optional)
  const ytdlpName = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  const ytdlp = path.join(resourceBase, ytdlpName);
  if (fs.existsSync(ytdlp)) env.YTDLP_PATH = ytdlp;

  // dependencies live in "deps" (renamed from node_modules so electron-builder
  // does not strip them) — point Node's legacy resolution path at it
  const deps = path.join(serverDir, "deps");
  if (fs.existsSync(deps)) env.NODE_PATH = deps;

  serverProc = spawn(process.execPath, [serverJs], {
    env,
    cwd: serverDir,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  serverProc.stdout.on("data", (d) =>
    String(d)
      .split("\n")
      .filter((l) => l.trim())
      .forEach((l) => log("server: " + l))
  );
  serverProc.stderr.on("data", (d) =>
    String(d)
      .split("\n")
      .filter((l) => l.trim())
      .forEach((l) => log("server-err: " + l))
  );
}

/** resolves when the server answers; rejects fast if the process dies */
function waitForServer(port, tries = 150) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const bail = (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    };
    serverProc.on("error", (e) => bail(new Error("spawn failed: " + e.message)));
    serverProc.once("exit", (code, signal) => {
      if (!serverReady)
        bail(new Error(`server process exited early (code=${code} signal=${signal})`));
    });
    const attempt = (left) => {
      if (settled) return;
      const req = http.get(
        { host: "127.0.0.1", port, path: "/", timeout: 2000 },
        (res) => {
          res.resume();
          settled = true;
          resolve();
        }
      );
      req.on("timeout", () => req.destroy());
      req.on("error", () => {
        if (settled) return;
        if (left <= 0) return bail(new Error("server did not start in time"));
        setTimeout(() => attempt(left - 1), 500);
      });
    };
    attempt(tries);
  });
}

async function bootServer() {
  const maxAttempts = 3;
  let lastErr = null;
  for (let i = 1; i <= maxAttempts; i++) {
    const port = pickPort();
    try {
      killServer();
      startServer(port, i);
      await waitForServer(port);
      log(`attempt ${i}: server ready on port ${port}`);
      return port;
    } catch (e) {
      lastErr = e;
      log(`attempt ${i} failed: ${e.message}`);
      killServer();
    }
  }
  throw lastErr || new Error("unknown startup failure");
}

function killServer() {
  if (serverProc) {
    try {
      serverProc.kill();
    } catch {}
    serverProc = null;
  }
}

const SPLASH_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0a0a0a;color:#fafafa;font-family:'Segoe UI',system-ui,sans-serif;user-select:none}
.logo{width:56px;height:56px;border-radius:50%;background:#fafafa;display:flex;align-items:center;justify-content:center;margin-bottom:16px}
h1{font-size:20px;margin:0 0 6px;font-weight:600}
p{margin:0;color:#a3a3a3;font-size:13px}
.spin{width:18px;height:18px;border:2px solid #2e2e2e;border-top-color:#fafafa;border-radius:50%;margin-top:22px;animation:s .8s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}
</style></head><body>
<div class="logo"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" stroke-width="2.2" stroke-linecap="round"><path d="M4 10v4"/><path d="M8 6v12"/><path d="M12 3v18"/><path d="M16 6v12"/><path d="M20 10v4"/></svg></div>
<h1>Resona</h1><p>Starting up&hellip;</p><div class="spin"></div>
</body></html>`;

/* ── startup update ──────────────────────────────────────────────────────────
 * Runs before the server boots. Silent install on Windows (NSIS) and Linux
 * AppImage. macOS is unsigned, so it keeps the in-app "update available"
 * prompt. The whole step is capped at UPDATE_WAIT_MS: if it is still running
 * then, the app opens on the current version and the download installs on the
 * next quit. A failed check never blocks launch. */
const UPDATE_WAIT_MS = 10000;

function canSelfUpdate() {
  if (!app.isPackaged) return false;
  if (process.platform === "win32") return true;
  if (process.platform === "linux") return !!process.env.APPIMAGE;
  return false;
}

function setSplashStatus(text) {
  if (!splash) return;
  splash.webContents
    .executeJavaScript(`document.querySelector("p").textContent = ${JSON.stringify(text)};`)
    .catch(() => {});
}

function startupUpdate() {
  if (!canSelfUpdate()) return Promise.resolve();
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  return new Promise((resolve) => {
    let finished = false;
    const finish = (why) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      log(`startup update: ${why}`);
      resolve();
    };
    const timer = setTimeout(() => {
      autoUpdater.autoInstallOnAppQuit = true;
      finish("time limit reached, opening app");
    }, UPDATE_WAIT_MS);

    autoUpdater.once("update-not-available", () => finish("up to date"));
    autoUpdater.on("update-available", (info) => setSplashStatus(`Updating to ${info.version}…`));
    autoUpdater.on("download-progress", (p) =>
      setSplashStatus(`Downloading update… ${Math.round(p.percent)}%`)
    );
    autoUpdater.once("update-downloaded", () => {
      // past the time limit the app is already open: leave the install to the next quit
      if (finished) return log("update downloaded after launch, installs on next quit");
      setSplashStatus("Installing update…");
      finished = true;
      clearTimeout(timer);
      autoUpdater.quitAndInstall(true, true);
    });
    autoUpdater.once("error", (e) => finish(`error, opening app (${e && e.message})`));

    autoUpdater.checkForUpdates().catch((e) => finish(`check failed (${e && e.message})`));
  });
}

function showSplash() {
  splash = new BrowserWindow({
    width: 380,
    height: 240,
    frame: false,
    resizable: false,
    backgroundColor: "#0a0a0a",
    center: true,
    show: true,
    title: "Resona",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  splash.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(SPLASH_HTML));
}

function closeSplash() {
  if (splash) {
    try {
      splash.close();
    } catch {}
    splash = null;
  }
}

async function createWindow(port) {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: "#0a0a0a",
    autoHideMenuBar: true,
    // frameless: the app's own header draws the title row and the window controls
    frame: false,
    show: false,
    title: "Resona",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  win.on("maximize", () => win.webContents.send("win:max-changed", true));
  win.on("unmaximize", () => win.webContents.send("win:max-changed", false));
  win.once("ready-to-show", () => {
    closeSplash();
    win.show();
  });
  // open external links in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1:${port}`)) shell.openExternal(url);
    return { action: "deny" };
  });
  // if the page fails to load (server hiccup), retry once after 2s
  win.webContents.on("did-fail-load", (e, code, desc, url, isMain) => {
    if (!isMain) return;
    log(`page load failed (${code} ${desc}), retrying…`);
    setTimeout(() => win && win.loadURL(`http://127.0.0.1:${port}/`), 2000);
  });
  await win.loadURL(`http://127.0.0.1:${port}/`);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.setAppUserModelId("app.resona.desktop");

  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      logFile = path.join(app.getPath("userData"), "server.log");
      fs.mkdirSync(path.dirname(logFile), { recursive: true });
      try {
        fs.appendFileSync(logFile, `\n===== launch ${new Date().toISOString()} =====\n`);
      } catch {}
    } catch {}
    log(`resources: ${resourceBase}`);

    showSplash();
    await startupUpdate();
    let port;
    try {
      port = await bootServer();
    } catch (e) {
      closeSplash();
      const tailText = tail.slice(-8).join("\n");
      dialog.showErrorBox(
        "Resona",
        `The music service failed to start.\n\n` +
          `${e.message}\n\n` +
          (tailText ? `Details:\n${tailText}\n\n` : "") +
          `Full log:\n${logFile}`
      );
      app.quit();
      return;
    }
    serverReady = true;
    serverProc.on("exit", (code) => {
      if (serverReady && !quitting) {
        log(`server exited while running (code=${code})`);
        dialog.showErrorBox(
          "Resona",
          "The music service stopped unexpectedly. Please reopen the app."
        );
        app.quit();
      }
    });
    try {
      await createWindow(port);
    } catch (e) {
      closeSplash();
      log("window load failed: " + e.message);
      dialog.showErrorBox("Resona", "The interface failed to load.\n\n" + e.message);
      app.quit();
    }
  });

  app.on("window-all-closed", () => {
    quitting = true;
    killServer();
    app.quit();
  });
  app.on("before-quit", () => {
    quitting = true;
    killServer();
  });
  process.on("exit", () => {
    if (serverProc) {
      try {
        serverProc.kill();
      } catch {}
    }
  });
}
