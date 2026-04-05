import { spawn } from "child_process";
import fsSync from "fs";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, "..");
const SOURCE_BIN_DIR = path.join(ROOT_DIR, "bin");
const SOURCE_MODELS_DIR = path.join(ROOT_DIR, "models");
const STAGE_DIR = path.join(ROOT_DIR, "build", "installer-resources");
const STAGE_BIN_DIR = path.join(STAGE_DIR, "bin");
const STAGE_MODELS_DIR = path.join(STAGE_DIR, "models");
const GGUF_SPLIT_SIZE = "1500M";
const GGUF_SPLIT_RE = /-\d{5}-of-\d{5}\.gguf$/i;
const MAX_DIRECT_GGUF_BYTES = 1_500_000_000;

function log(message) {
  console.log(`[installer-resources] ${message}`);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${path.basename(command)} exited with code ${code}`));
    });
  });
}

async function ensureStageDir() {
  await fs.rm(STAGE_DIR, { recursive: true, force: true });
  await fs.mkdir(STAGE_BIN_DIR, { recursive: true });
  await fs.mkdir(STAGE_MODELS_DIR, { recursive: true });
}

async function stageRuntimeBin() {
  const runtimeFiles = await fs.readdir(SOURCE_BIN_DIR, { withFileTypes: true });
  const selected = runtimeFiles
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.toLowerCase() === "llama-server.exe" || name.toLowerCase().endsWith(".dll"));

  if (!selected.includes("llama-server.exe")) {
    throw new Error("bin/llama-server.exe was not found");
  }

  for (const name of selected) {
    await fs.copyFile(path.join(SOURCE_BIN_DIR, name), path.join(STAGE_BIN_DIR, name));
  }

  log(`Staged ${selected.length} runtime binaries`);
}

function isSplitPart(fileName) {
  return GGUF_SPLIT_RE.test(fileName);
}

async function splitOversizedModel(sourcePath, fileName) {
  const splitExe = path.join(SOURCE_BIN_DIR, "llama-gguf-split.exe");
  if (!fsSync.existsSync(splitExe)) {
    throw new Error(`Cannot split ${fileName} because bin/llama-gguf-split.exe is missing`);
  }

  const outputPrefix = path.join(STAGE_MODELS_DIR, path.basename(fileName, ".gguf"));
  log(`Splitting ${fileName} into ${GGUF_SPLIT_SIZE} chunks`);
  await run(splitExe, ["--split-max-size", GGUF_SPLIT_SIZE, sourcePath, outputPrefix]);
}

async function stageModels() {
  const entries = await fs.readdir(SOURCE_MODELS_DIR, { withFileTypes: true });
  const ggufFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".gguf"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  if (ggufFiles.length === 0) {
    throw new Error("No GGUF files were found in models/");
  }

  for (const fileName of ggufFiles) {
    const sourcePath = path.join(SOURCE_MODELS_DIR, fileName);
    const targetPath = path.join(STAGE_MODELS_DIR, fileName);
    const stats = await fs.stat(sourcePath);

    if (isSplitPart(fileName) || stats.size <= MAX_DIRECT_GGUF_BYTES) {
      await fs.copyFile(sourcePath, targetPath);
      continue;
    }

    await splitOversizedModel(sourcePath, fileName);
  }

  const stagedFiles = await fs.readdir(STAGE_MODELS_DIR);
  log(`Staged ${stagedFiles.length} GGUF file(s) for the installer`);
}

async function main() {
  log("Preparing installer resources");
  await ensureStageDir();
  await stageRuntimeBin();
  await stageModels();
  log(`Installer resources ready at ${STAGE_DIR}`);
}

main().catch((error) => {
  console.error(`[installer-resources] ${error.message}`);
  process.exit(1);
});
