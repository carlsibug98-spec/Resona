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
});
