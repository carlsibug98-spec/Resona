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
    onEndFile: (cb) => {
      const l = () => cb();
      ipcRenderer.on("mpv:end-file", l);
      return () => ipcRenderer.removeListener("mpv:end-file", l);
    },
  },
});
