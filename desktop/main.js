/**
 * Resona desktop wrapper.
 * Boots the bundled Next.js standalone server as a hidden child process
 * (Electron's node runtime), waits for it, then opens the app in a native
 * window. Designed to fail fast and LOUD: every attempt is logged to
 * <userData>/server.log and real errors are shown instead of a vague timeout.
 *
 * Also keeps the app itself current: on launch (and every 4 hours) it checks
 * the GitHub releases feed via electron-updater, downloads any newer build
 * in the background, and installs it on restart — or immediately, if the
 * user clicks Restart in the ready dialog.
 */
const { app, BrowserWindow, shell, dialog } = require("electron");
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
    // per-user dir the server may write to (yt-dlp auto-provisioning etc.)
    RESONA_DATA_DIR: app.getPath("userData"),
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
    show: false,
    title: "Resona",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
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

  /* ── self-update: download new GitHub releases in the background ── */
  function setupAutoUpdate() {
    if (!app.isPackaged) return; // dev runs have nothing to update
    let autoUpdater;
    try {
      ({ autoUpdater } = require("electron-updater"));
    } catch (e) {
      log("updater unavailable: " + (e && e.message));
      return;
    }
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on("checking-for-update", () => log("updater: checking"));
    autoUpdater.on("update-available", (i) => log("updater: update available " + (i && i.version)));
    autoUpdater.on("update-not-available", () => log("updater: up to date"));
    autoUpdater.on("download-progress", (p) =>
      log(`updater: downloading ${Math.round(p.percent)}%`)
    );
    autoUpdater.on("error", (e) => log("updater error: " + (e && e.message)));
    autoUpdater.on("update-downloaded", (info) => {
      log("updater: ready to install " + (info && info.version));
      dialog
        .showMessageBox(win, {
          type: "info",
          title: "Resona update ready",
          message: `Resona ${info.version} has been downloaded.`,
          detail: "Restart now to finish installing, or it will apply when you quit.",
          buttons: ["Later", "Restart"],
          defaultId: 1,
        })
        .then((r) => {
          if (r.response === 1) {
            quitting = true;
            killServer();
            autoUpdater.quitAndInstall();
          }
        })
        .catch(() => {});
    });
    const check = () =>
      autoUpdater.checkForUpdates().catch((e) => log("updater check failed: " + (e && e.message)));
    check();
    setInterval(check, 4 * 60 * 60 * 1000);
  }

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
    setupAutoUpdate();
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
