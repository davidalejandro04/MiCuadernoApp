const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const fs = require("fs/promises");
const fsSync = require("fs");
const crypto = require("crypto");
const path = require("path");
const { pathToFileURL } = require("url");
const { spawn } = require("child_process");

let llamaServerProc = null;

const LLM_PORT = 8080;
const LLM_BASE = `http://127.0.0.1:${LLM_PORT}`;

let activeGguf = "gemma-4-E2B-it-Q4_K_M.gguf";

function waitForServer(timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      fetch(`${LLM_BASE}/health`)
        .then(r => { if (r.ok) resolve(); else throw new Error(); })
        .catch(() => {
          if (Date.now() - start > timeoutMs) reject(new Error("llama-server did not start in time"));
          else setTimeout(attempt, 500);
        });
    };
    attempt();
  });
}

const APP_DATA_NAME = ".TutorMate";
const DATA_DIR = path.join(app.getPath("appData"), APP_DATA_NAME);
app.setPath("userData", DATA_DIR);

const ROOT_DIR = path.join(__dirname, "..");
const LESSON_CATALOG_DIR = path.join(ROOT_DIR, "data", "lesson-catalog");

const DEFAULT_PROFILE = {
  name: "",
  avatar: "",
  grade: "",
  dailyGoal: 20,
  focusArea: "",
  responseMode: "coach",
  onboardingCompleted: false,
  xp: 0,
  lessonsCompleted: 0,
  completed: [],
  activity: [],
  conceptProgress: [],
  tutorSessions: [],
  struggleSignals: [],
  lessonFlashcards: [],
  interactionLog: []
};

const DEFAULT_SETTINGS = {
  responseMode: "coach",
  theme: "light",
  agentMode: true,
  ggufModel: "gemma-4-E2B-it-Q4_K_M.gguf"
};

const activeChatControllers = new Map();
let lessonCatalogModulePromise = null;
let ragModulePromise = null;
let ragRetriever = null;
let machineId = null;

function getLessonCatalogModule() {
  if (!lessonCatalogModulePromise) {
    const moduleUrl = pathToFileURL(path.join(ROOT_DIR, "src", "utils", "lesson-catalog.mjs")).href;
    lessonCatalogModulePromise = import(moduleUrl);
  }
  return lessonCatalogModulePromise;
}

function getRAGModule() {
  if (!ragModulePromise) {
    const moduleUrl = pathToFileURL(path.join(ROOT_DIR, "src", "rag", "index.mjs")).href;
    ragModulePromise = import(moduleUrl);
  }
  return ragModulePromise;
}

function userFile(name) {
  return path.join(app.getPath("userData"), name);
}

function ensureMachineId() {
  const idPath = userFile("machine-id");
  try {
    machineId = fsSync.readFileSync(idPath, "utf8").trim();
  } catch {
    machineId = crypto.randomUUID();
    fsSync.mkdirSync(path.dirname(idPath), { recursive: true });
    fsSync.writeFileSync(idPath, machineId, "utf8");
  }
  return machineId;
}

async function wipeUserData() {
  const dataPath = app.getPath("userData");
  try {
    await fs.rm(dataPath, { recursive: true, force: true });
  } catch {
    // Directory may already be gone or locked.
  }
}

async function confirmAndWipeData(parentWindow) {
  const options = {
    type: "question",
    buttons: ["Conservar datos", "Eliminar datos"],
    defaultId: 0,
    cancelId: 0,
    title: "Datos de Mi cuaderno",
    message: "¿Quieres borrar todos los datos de Mi cuaderno?",
    detail: `Esto borrará tu perfil, progreso y configuración guardados en:\n${app.getPath("userData")}`
  };
  const { response } = parentWindow
    ? await dialog.showMessageBox(parentWindow, options)
    : await dialog.showMessageBox(options);
  if (response === 1) {
    await wipeUserData();
    return true;
  }
  return false;
}

function sanitizeRect(rect = {}) {
  return {
    x: Math.max(0, Math.round(Number(rect.x) || 0)),
    y: Math.max(0, Math.round(Number(rect.y) || 0)),
    width: Math.max(1, Math.round(Number(rect.width) || 0)),
    height: Math.max(1, Math.round(Number(rect.height) || 0))
  };
}

async function readJson(filePath, defaults) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return { ...defaults, ...parsed };
  } catch {
    return { ...defaults };
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
  return data;
}

async function scanGgufModels() {
  const modelsDir = path.join(ROOT_DIR, "models");
  try {
    const files = await fs.readdir(modelsDir);
    return files.filter(f => f.endsWith(".gguf") && !f.toLowerCase().startsWith("mmproj"));
  } catch {
    return [];
  }
}

function findMmprojFor(ggufFile) {
  const modelsDir = path.join(ROOT_DIR, "models");
  try {
    const files = fsSync.readdirSync(modelsDir);
    const mmprojFiles = files.filter(f => f.toLowerCase().startsWith("mmproj") && f.endsWith(".gguf"));
    // Try to match by model family prefix (e.g. "gemma-3-4b" or "gemma-4-E2B")
    const parts = ggufFile.replace(/\.gguf$/, "").split("-");
    for (let len = Math.min(parts.length, 4); len >= 2; len--) {
      const prefix = parts.slice(0, len).join("-").toLowerCase();
      const match = mmprojFiles.find(f => f.toLowerCase().includes(prefix));
      if (match) return match;
    }
    return null;
  } catch {
    return null;
  }
}

async function startLlamaServer(ggufFile) {
  if (llamaServerProc) {
    const oldProc = llamaServerProc;
    llamaServerProc = null;
    oldProc.kill();
    await new Promise(r => { oldProc.on("close", r); setTimeout(r, 3000); });
  }

  const exePath = path.join(ROOT_DIR, "bin", "llama-server.exe");
  const modelPath = path.join(ROOT_DIR, "models", ggufFile);

  if (!fsSync.existsSync(modelPath)) {
    throw new Error(`Archivo de modelo no encontrado: ${ggufFile}`);
  }

  const args = [
    "-m", modelPath,
    "--port", String(LLM_PORT),
    "-c", "2048",
    "-ngl", "999",
    "--no-mmap",
    "-np", "1",
    "-b", "256",
    "-ub", "256",
    "--reasoning", "off",
    "--reasoning-format", "none"
  ];

  const mmprojFile = findMmprojFor(ggufFile);
  if (mmprojFile) {
    args.push("--mmproj", path.join(ROOT_DIR, "models", mmprojFile));
  }

  llamaServerProc = spawn(exePath, args);
  llamaServerProc.stdout.on("data", d => process.stdout.write(`[llama.cpp] ${d}`));
  llamaServerProc.stderr.on("data", d => process.stderr.write(`[llama.cpp] ${d}`));
  llamaServerProc.on("close", code => console.log(`llama.cpp exited with code ${code}`));

  await waitForServer(45000);
  activeGguf = ggufFile;
}

/**
 * Normalize messages for llama.cpp OpenAI-compatible API.
 * Converts Ollama-style image messages ({content, images: [base64]})
 * to OpenAI multimodal format ({content: [{type:"text",...},{type:"image_url",...}]}).
 */
function normalizeMessages(messages) {
  if (!messages.some(m => Array.isArray(m.images) && m.images.length > 0)) return messages;
  return messages.map((msg) => {
    if (!Array.isArray(msg.images) || msg.images.length === 0) return msg;
    const parts = [];
    if (msg.content) {
      parts.push({ type: "text", text: String(msg.content) });
    }
    for (const img of msg.images) {
      parts.push({
        type: "image_url",
        image_url: { url: `data:image/png;base64,${img}` }
      });
    }
    const { images: _dropped, ...rest } = msg;
    return { ...rest, content: parts };
  });
}

async function chatWithLlm({
  messages,
  requestId = "",
  maxTokens = null,
  temperature = null,
  forceJson = false,
  webContents = null
}) {
  const safeRequestId = String(requestId || "").trim();
  const controller = new AbortController();
  if (safeRequestId) {
    activeChatControllers.set(safeRequestId, controller);
  }

  let numPredict = 512;
  let temp = 0.4;
  if (Number.isFinite(Number(maxTokens)) && Number(maxTokens) > 0) {
    numPredict = Math.round(Number(maxTokens));
  }
  if (Number.isFinite(Number(temperature))) {
    temp = Number(temperature);
  }

  try {
    const normalizedMessages = normalizeMessages(messages);
    const response = await fetch(`${LLM_BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: activeGguf,
        stream: true,
        messages: normalizedMessages,
        max_tokens: numPredict,
        temperature: temp,
        ...(forceJson ? { response_format: { type: "json_object" } } : {})
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Llama.cpp error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    const tokens = [];
    let streamDone = false;

    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim() || !line.startsWith("data: ")) continue;
        const dataStr = line.slice(6);
        if (dataStr === "[DONE]") { streamDone = true; break; }
        try {
          const data = JSON.parse(dataStr);
          const delta = data.choices?.[0]?.delta;
          const token = delta?.content || delta?.reasoning_content || "";
          if (token) {
            tokens.push(token);
            if (webContents && !webContents.isDestroyed()) {
              webContents.send("llm:chat-token", { requestId: safeRequestId, token });
            }
          }
        } catch {}
      }
    }

    return tokens.join("");
  } catch (error) {
    if (error?.name === "AbortError") {
      const abortError = new Error("Solicitud cancelada.");
      abortError.name = "AbortError";
      throw abortError;
    }
    throw error;
  } finally {
    if (safeRequestId) {
      activeChatControllers.delete(safeRequestId);
    }
  }
}

function cancelLlmChat(_event, requestId) {
  const safeRequestId = String(requestId || "").trim();
  const controller = activeChatControllers.get(safeRequestId);
  if (!controller) {
    return { ok: false };
  }

  controller.abort();
  activeChatControllers.delete(safeRequestId);
  return { ok: true };
}

async function captureRegion(event, rect) {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    throw new Error("No se encontro una ventana activa para capturar.");
  }

  const bounds = sanitizeRect(rect);
  const image = await window.capturePage(bounds);
  return {
    mimeType: "image/png",
    base64: image.toPNG().toString("base64")
  };
}

async function bootstrap() {
  ensureMachineId();

  const settings = await readJson(userFile("settings.json"), DEFAULT_SETTINGS);
  const selectedGguf = settings.ggufModel || DEFAULT_SETTINGS.ggufModel;

  // Start LLM server in parallel with lesson/profile loading
  const llmPromise = (async () => {
    if (llamaServerProc) return { ok: true, message: `Modelo ${activeGguf} listo.` };
    try {
      await startLlamaServer(selectedGguf);
      console.log("[llama.cpp] Server is ready.");
      return { ok: true, message: `Modelo ${selectedGguf} listo.` };
    } catch (err) {
      console.error("[llama.cpp] Server failed to start:", err.message);
      return { ok: false, message: `Error: ${err.message}` };
    }
  })();

  const lessonsPromise = getLessonCatalogModule()
    .then(({ loadLessonCatalogFromDirectory }) => loadLessonCatalogFromDirectory(LESSON_CATALOG_DIR));

  const [llmStatus, lessons, profile, ggufModels] = await Promise.all([
    llmPromise,
    lessonsPromise,
    readJson(userFile("profile.json"), DEFAULT_PROFILE),
    scanGgufModels()
  ]);

  try {
    const { chunkLessonCatalog, RAGIndex, Retriever } = await getRAGModule();
    const chunks = chunkLessonCatalog(lessons);
    const index = new RAGIndex();
    index.build(chunks);
    ragRetriever = new Retriever(index);
  } catch (err) {
    console.warn("[rag] No se pudo construir el indice RAG:", err.message);
  }

  return {
    lessons, profile, settings,
    llm: llmStatus,
    ggufModels,
    machineId,
    dataPath: app.getPath("userData")
  };
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#f6f1e8",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.loadFile(path.join(ROOT_DIR, "src", "index.html"));
}

app.whenReady().then(() => {
  ipcMain.handle("app:bootstrap", bootstrap);
  ipcMain.handle("profile:save", (_event, profile) => writeJson(userFile("profile.json"), profile));
  ipcMain.handle("profile:reset", async () => {
    const profile = {
      ...DEFAULT_PROFILE,
      onboardingCompleted: true
    };
    await writeJson(userFile("profile.json"), profile);
    return profile;
  });
  ipcMain.handle("settings:save", (_event, settings) => writeJson(userFile("settings.json"), settings));
  ipcMain.handle("llm:chat", async (event, payload) => {
    if (payload.useRAG && ragRetriever) {
      try {
        const { augmentPromptWithContext } = await getRAGModule();
        const query = (payload.messages || [])
          .filter((m) => m.role === "user")
          .map((m) => m.content)
          .pop() || "";
        if (query) {
          const { context } = ragRetriever.retrieve(query);
          if (context && Array.isArray(payload.messages) && payload.messages.length > 0) {
            const firstMsg = payload.messages[0];
            if (firstMsg.role === "system") {
              payload.messages = [
                { ...firstMsg, content: augmentPromptWithContext(firstMsg.content, context) },
                ...payload.messages.slice(1)
              ];
            }
          }
        }
      } catch (err) {
        console.warn("[rag] Error augmenting chat:", err.message);
      }
    }
    return chatWithLlm({ ...payload, webContents: event.sender });
  });
  ipcMain.handle("llm:cancel-chat", cancelLlmChat);
  ipcMain.handle("llm:list-models", async () => scanGgufModels());
  ipcMain.handle("llm:apply-model", async (_event, ggufFile) => {
    try {
      await startLlamaServer(ggufFile);
      return { ok: true, message: `Modelo ${ggufFile} listo.` };
    } catch (err) {
      return { ok: false, message: `Error: ${err.message}` };
    }
  });
  ipcMain.handle("rag:search", async (_event, query) => {
    if (!ragRetriever) return { context: "", sources: [] };
    return ragRetriever.retrieve(String(query || ""));
  });
  ipcMain.handle("data:wipe", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return confirmAndWipeData(win);
  });
  ipcMain.handle("data:path", () => app.getPath("userData"));
  ipcMain.handle("window:capture-region", captureRegion);

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("before-quit", () => {
  if (llamaServerProc) llamaServerProc.kill();
});
