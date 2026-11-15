/**
 * Preload for the desktop window. Exposes the three window controls the
 * custom header needs (the window has no native frame) and nothing else.
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
});
