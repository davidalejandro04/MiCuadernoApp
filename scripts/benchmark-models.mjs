#!/usr/bin/env node
/**
 * Quick benchmark: compare GGUF models on llama.cpp with identical prompts.
 * Usage: node scripts/benchmark-models.mjs
 */
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const BIN = path.join(ROOT, "bin", "llama-server.exe");
const MODELS_DIR = path.join(ROOT, "models");
const PORT = 8099; // Use a different port to avoid conflicts
const BASE = `http://127.0.0.1:${PORT}`;

const MODELS = [
  "gemma-3-4b-it-q4_k_m.gguf",
  "gemma-4-E2B-it-Q4_K_M.gguf",
];

const PROMPT = {
  messages: [
    {
      role: "system",
      content:
        "Eres un tutor de matematicas en espanol. Responde de forma clara y pedagogica.",
    },
    {
      role: "user",
      content:
        "Propon 3 ejercicios de fracciones para un estudiante de sexto grado. Incluye la solucion de cada uno.",
    },
  ],
  max_tokens: 512,
  temperature: 0.4,
  stream: false,
};

const WARMUP_PROMPT = {
  messages: [{ role: "user", content: "Hola" }],
  max_tokens: 16,
  temperature: 0,
  stream: false,
};

function findMmproj(gguf) {
  const files = fs.readdirSync(MODELS_DIR);
  const mmprojs = files.filter(
    (f) => f.toLowerCase().startsWith("mmproj") && f.endsWith(".gguf")
  );
  const parts = gguf.replace(/\.gguf$/, "").split("-");
  for (let len = Math.min(parts.length, 4); len >= 2; len--) {
    const prefix = parts.slice(0, len).join("-").toLowerCase();
    const match = mmprojs.find((f) => f.toLowerCase().includes(prefix));
    if (match) return match;
  }
  return null;
}

function startServer(gguf) {
  const modelPath = path.join(MODELS_DIR, gguf);
  const args = [
    "-m", modelPath,
    "--port", String(PORT),
    "-c", "2048",
    "-ngl", "0",
    "--no-mmap",
    "-np", "1",
    "-b", "256",
    "-ub", "256",
  ];
  const mmproj = findMmproj(gguf);
  if (mmproj) {
    const mp = path.join(MODELS_DIR, mmproj);
    if (fs.existsSync(mp)) args.push("--mmproj", mp);
  }
  const proc = spawn(BIN, args, { stdio: "pipe" });
  proc.stderr.on("data", () => {}); // drain
  proc.stdout.on("data", () => {});
  return proc;
}

async function waitHealth(timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Server did not become healthy in time");
}

async function chat(body) {
  const r = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "bench", ...body }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

function kill(proc) {
  return new Promise((resolve) => {
    proc.on("close", resolve);
    proc.kill();
    setTimeout(() => resolve(), 2000);
  });
}

// ── Main ────────────────────────────────────────────────────────────
const RUNS = 3;

console.log("=".repeat(60));
console.log("  GGUF Model Benchmark");
console.log(`  Runs per model: ${RUNS}`);
console.log("=".repeat(60));
console.log();

for (const gguf of MODELS) {
  console.log(`▸ Model: ${gguf}`);
  console.log("  Starting server...");

  const proc = startServer(gguf);
  try {
    await waitHealth(60000);
    console.log("  Server ready. Warming up...");

    // Warmup
    await chat(WARMUP_PROMPT);

    const times = [];
    const tokenCounts = [];

    for (let i = 0; i < RUNS; i++) {
      const t0 = performance.now();
      const result = await chat(PROMPT);
      const elapsed = performance.now() - t0;

      const tokens = result.usage?.completion_tokens ?? "?";
      times.push(elapsed);
      tokenCounts.push(tokens);

      console.log(
        `  Run ${i + 1}: ${(elapsed / 1000).toFixed(2)}s — ${tokens} tokens`
      );

      // Print response on first run
      if (i === 0) {
        const text = result.choices?.[0]?.message?.content || "";
        console.log("  ── Response (run 1) ──");
        for (const line of text.split("\n")) {
          console.log(`  │ ${line}`);
        }
        console.log("  ──────────────────────");
      }
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const avgTok = tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length;
    const tokPerSec = avgTok / (avg / 1000);

    console.log();
    console.log(`  ✓ Avg time:    ${(avg / 1000).toFixed(2)}s`);
    console.log(`  ✓ Avg tokens:  ${avgTok.toFixed(0)}`);
    console.log(`  ✓ Tokens/sec:  ${tokPerSec.toFixed(1)}`);
    console.log();
  } finally {
    await kill(proc);
    // Wait for port to free up
    await new Promise((r) => setTimeout(r, 1500));
  }
}

console.log("=".repeat(60));
console.log("  Benchmark complete.");
console.log("=".repeat(60));
