import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as child_process from "child_process";
import { detectPlatform, Platform } from "./executor";
import { SCRIPT_TEMP_PREFIX } from "./constants";

export type Runtime =
  | "python"
  | "node"
  | "bun"
  | "deno"
  | "ts-node";

const EXTENSION_MAP: Record<string, Runtime> = {
  ".py": "python",
  ".js": "node",
  ".mjs": "node",
  ".cjs": "node",
  ".jsx": "node",
  ".ts": "bun",
  ".tsx": "bun",
  ".mts": "bun",
  ".cts": "bun",
};

const RUNTIME_EXTENSION: Record<Runtime, string> = {
  python: ".py",
  node: ".js",
  bun: ".ts",
  deno: ".ts",
  "ts-node": ".ts",
};

export interface RuntimeCommand {
  /** e.g. "python3" or "C:\Python312\python.exe" */
  bin: string;
  /** flags inserted before the file path, e.g. ["run", "--allow-all"] for deno */
  preFileArgs: string[];
  /** human-readable runtime label returned to the model */
  label: string;
}

let _pythonBinCache: string | null = null;

function resolvePythonBin(platform: Platform): string {
  if (_pythonBinCache) return _pythonBinCache;

  const candidates =
    platform === "windows"
      ? ["py", "python", "python3"]
      : ["python3", "python"];
  const probe = platform === "windows" ? "where" : "which";

  for (const bin of candidates) {
    try {
      child_process.execSync(`${probe} ${bin}`, { stdio: "ignore" });
      _pythonBinCache = bin;
      return bin;
    } catch { }
  }

  _pythonBinCache = candidates[candidates.length - 1];
  return _pythonBinCache;
}

export function resolveRuntimeCommand(
  runtime: Runtime,
  pythonOverride?: string,
): RuntimeCommand {
  const platform = detectPlatform();

  switch (runtime) {
    case "python": {
      const bin = pythonOverride?.trim() || resolvePythonBin(platform);
      return { bin, preFileArgs: [], label: `Python (${bin})` };
    }
    case "node":
      return { bin: "node", preFileArgs: [], label: "Node.js" };
    case "bun":
      return { bin: "bun", preFileArgs: ["run"], label: "Bun" };
    case "deno":
      return {
        bin: "deno",
        preFileArgs: ["run", "--allow-all"],
        label: "Deno",
      };
    case "ts-node":
      return {
        bin: "npx",
        preFileArgs: ["--yes", "ts-node"],
        label: "ts-node (via npx)",
      };
  }
}

export function detectRuntimeFromExtension(
  filePath: string,
): Runtime | undefined {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_MAP[ext];
}

export interface TempFile {
  filePath: string;
  cleanup(): void;
}

export function writeTempFile(code: string, runtime: Runtime): TempFile {
  const ext = RUNTIME_EXTENSION[runtime];
  const dir = os.tmpdir();
  const filePath = path.join(
    dir,
    `${SCRIPT_TEMP_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`,
  );
  fs.writeFileSync(filePath, code, "utf-8");
  return {
    filePath,
    cleanup() {
      try { fs.unlinkSync(filePath); } catch { }
    },
  };
}

export function buildScriptCommand(
  cmd: RuntimeCommand,
  scriptPath: string,
  args: string[],
): string {
  const quotedPath = `"${scriptPath.replace(/"/g, '\\"')}"`;
  const parts = [cmd.bin, ...cmd.preFileArgs, quotedPath, ...args];
  return parts.join(" ");
}
