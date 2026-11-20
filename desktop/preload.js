/**
 * Preload for the desktop window. Exposes the window controls the custom
 * header needs (the window has no native frame), the taskbar playback
 * controls, and nothing else.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("resonaDesktop", {
  minimize: () => ipcRenderer.send("win:minimize"),
  toggleMaximize: () => ipcRenderer.send("win:toggle-max"),
  close: () => ipcRenderer.send("win:close"),
  isMaximized: () => ipcRenderer.invoke("win:is-max"),
  onMaximizeChange: (cb) => {
    ipcRenderer.on("win:max-changed", (_event, maximized) => cb(maximized));
  },
  /** taskbar playback controls (see TaskbarControls.tsx) */
  setThumbarState: (s) => ipcRenderer.send("thumbs:state", s),
  onThumbarAction: (cb) => {
    const listener = (_event, action) => cb(action);
    ipcRenderer.on("thumbs:action", listener);
    return () => ipcRenderer.removeListener("thumbs:action", listener);
  },
  /** update flow (see desktop/main.js beginBackgroundUpdate +
   *  UpdateBanner.tsx): the updater only runs after the window is up. Live
   *  status arrives over update:progress ({ state: idle | downloading |
   *  ready | error, percent, version, message }), updateStatus() returns
   *  the current snapshot for a component that mounts mid-download, and
   *  { version } is pushed again over update:ready once the installer is
   *  on disk. The banner's Restart button asks the main process to install
   *  + relaunch now (restart-first apply). */
  onUpdateReady: (cb) => {
    const listener = (_event, info) => cb(info || {});
    ipcRenderer.on("update:ready", listener);
    return () => ipcRenderer.removeListener("update:ready", listener);
  },
  onUpdateProgress: (cb) => {
    const listener = (_event, status) => cb(status || {});
    ipcRenderer.on("update:progress", listener);
    return () => ipcRenderer.removeListener("update:progress", listener);
  },
  updateStatus: () => ipcRenderer.invoke("update:status"),
  installUpdate: () => ipcRenderer.send("update:install-now"),
  /** the mpv playback core (desktop/mpv-host.js) — undefined on non-desktop
   *  or when libmpv is missing, in which case the HTML5 chain plays on */
  mpv: {
    available: () => ipcRenderer.invoke("mpv:available"),
    load: (url, startSec) => ipcRenderer.invoke("mpv:load", { url, startSec }),
    play: () => ipcRenderer.invoke("mpv:play"),
    pause: () => ipcRenderer.invoke("mpv:pause"),
    seek: (sec) => ipcRenderer.invoke("mpv:seek", sec),
    volume: (v) => ipcRenderer.invoke("mpv:volume", v),
    stop: () => ipcRenderer.invoke("mpv:stop"),
    state: () => ipcRenderer.invoke("mpv:state"),
    shutdown: () => ipcRenderer.invoke("mpv:shutdown"),
    onFileLoaded: (cb) => {
      const l = () => cb();
      ipcRenderer.on("mpv:file-loaded", l);
      return () => ipcRenderer.removeListener("mpv:file-loaded", l);
    },
    /** cb receives { reason, error, reasonName } — mpv_end_file_reason:
     *  0 eof · 2 stop · 3 quit · 4 error · 5 redirect (−1 unknown). The
     *  engine must know WHY a file ended: error means "this stream died",
     *  eof means "song finished" — they are opposite queue decisions. */
    onEndFile: (cb) => {
      const l = (_e, info) => cb(info || { reason: -1, error: 0, reasonName: "unknown" });
      ipcRenderer.on("mpv:end-file", l);
      return () => ipcRenderer.removeListener("mpv:end-file", l);
    },
    /** mpv entered idle mode — while a load is pending this is the fast
     *  "the URL could not be opened" signal (bad path, refused connection) */
    onIdle: (cb) => {
      const l = () => cb();
      ipcRenderer.on("mpv:idle", l);
      return () => ipcRenderer.removeListener("mpv:idle", l);
    },
  },
});
