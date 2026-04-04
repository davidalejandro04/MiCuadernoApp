const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bridge", {
  bootstrap: () => ipcRenderer.invoke("app:bootstrap"),
  saveProfile: (profile) => ipcRenderer.invoke("profile:save", profile),
  resetProfile: () => ipcRenderer.invoke("profile:reset"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  chat: (payload) => ipcRenderer.invoke("llm:chat", payload),
  cancelChat: (requestId) => ipcRenderer.invoke("llm:cancel-chat", requestId),
  onChatToken: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("llm:chat-token", handler);
    return () => ipcRenderer.removeListener("llm:chat-token", handler);
  },
  wipeData: () => ipcRenderer.invoke("data:wipe"),
  getDataPath: () => ipcRenderer.invoke("data:path"),
  captureRegion: (rect) => ipcRenderer.invoke("window:capture-region", rect),
  ragSearch: (query) => ipcRenderer.invoke("rag:search", query)
});
