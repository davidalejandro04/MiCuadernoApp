import { spawn } from "child_process";
import fsSync from "fs";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const ELECTRON_BUILDER_CLI = path.join(ROOT_DIR, "node_modules", "electron-builder", "cli.js");
const ARTIFACT_EXTENSIONS = new Set([
  ".7z",
  ".appimage",
  ".blockmap",
  ".deb",
  ".dmg",
  ".exe",
  ".msi",
  ".pkg",
  ".rpm",
  ".snap",
  ".yml",
  ".zip"
]);
const UNPACKED_DIR_RE = /(^|[\\/])[^\\/]*unpacked([\\/]|$)/i;

function log(message) {
  console.log(`[builder-wrapper] ${message}`);
}

function makeRunId() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${stamp}-${Math.random().toString(36).slice(2, 8)}`;
}

function hasArg(args, predicate) {
  return args.some(predicate);
}

function shouldSkipArtifact(relativePath) {
  if (UNPACKED_DIR_RE.test(relativePath)) return true;
  if (relativePath.endsWith(".yaml")) return true;
  if (relativePath.includes(".__uninstaller.")) return true;
  return false;
}

async function collectArtifacts(dir, rootDir = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    const relativePath = path.relative(rootDir, absolutePath);

    if (entry.isDirectory()) {
      if (UNPACKED_DIR_RE.test(relativePath)) continue;
      files.push(...await collectArtifacts(absolutePath, rootDir));
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (!ARTIFACT_EXTENSIONS.has(extension)) continue;
    if (shouldSkipArtifact(relativePath)) continue;
    files.push(absolutePath);
  }

  return files;
}

async function copyArtifacts(tempOutputDir) {
  const artifacts = await collectArtifacts(tempOutputDir);
  if (artifacts.length === 0) {
    throw new Error(`No distributable artifacts were found in ${tempOutputDir}`);
  }

  await fs.mkdir(DIST_DIR, { recursive: true });

  for (const artifactPath of artifacts) {
    const destinationPath = path.join(DIST_DIR, path.basename(artifactPath));
    if (artifactPath === destinationPath) continue;
    await fs.copyFile(artifactPath, destinationPath);
  }

  return artifacts.map((artifactPath) => path.basename(artifactPath));
}

async function main() {
  if (!fsSync.existsSync(ELECTRON_BUILDER_CLI)) {
    throw new Error("electron-builder is not installed");
  }

  const passthroughArgs = process.argv.slice(2);
  const hasConfigArg = hasArg(
    passthroughArgs,
    (arg) => arg === "--config" || arg === "-c" || arg.startsWith("--config=") || arg.startsWith("-c=")
  );
  const hasOutputOverride = hasArg(
    passthroughArgs,
    (arg) => arg.startsWith("--config.directories.output=") || arg.startsWith("-c.directories.output=")
  );

  const runId = makeRunId();
  const tempOutputDir = path.join(DIST_DIR, `_builder-${runId}`);
  const builderArgs = [];

  if (!hasConfigArg) {
    builderArgs.push("--config", "electron-builder.json");
  }

  builderArgs.push(...passthroughArgs);

  if (!hasOutputOverride) {
    builderArgs.push(`--config.directories.output=${tempOutputDir}`);
  }

  log(`Using temporary output folder: ${path.relative(ROOT_DIR, tempOutputDir)}`);

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ELECTRON_BUILDER_CLI, ...builderArgs], {
      cwd: ROOT_DIR,
      env: process.env,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`electron-builder failed with exit ${code}`));
    });
  });

  const copiedArtifacts = await copyArtifacts(tempOutputDir);
  log(`Copied ${copiedArtifacts.length} artifact(s) to dist/: ${copiedArtifacts.join(", ")}`);

  const hasWebSetup = copiedArtifacts.some((name) => name.toLowerCase().includes("web setup") && name.toLowerCase().endsWith(".exe"));
  const hasNsisPackage = copiedArtifacts.some((name) => name.toLowerCase().endsWith(".nsis.7z"));
  if (hasWebSetup && hasNsisPackage) {
    log("Keep the Web Setup .exe and the .nsis.7z package in the same folder when distributing the installer.");
  }
}

main().catch((error) => {
  console.error(`[builder-wrapper] ${error.message}`);
  process.exit(1);
});
