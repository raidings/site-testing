import { tool } from "@lmstudio/sdk";
import { z } from "zod";
import { configSchematics } from "./config";
import { execCommand, resolveShell } from "./executor";
import {
  detectRuntimeFromExtension,
  resolveRuntimeCommand,
  writeTempFile,
  buildScriptCommand,
  type Runtime,
} from "./runtimeResolver";
import {
  EXEC_DEFAULT_TIMEOUT_MS,
  EXEC_MAX_TIMEOUT_MS,
  EXEC_MAX_COMMAND_LENGTH,
  SCRIPT_MAX_CODE_LENGTH,
} from "./constants";
import type { PluginController } from "./pluginTypes";

function getWindowsShell(ctl: PluginController): "powershell" | "cmd" {
  const c = ctl.getPluginConfig(configSchematics);
  return ((c.get("windowsShell") as string | undefined) ?? "cmd") as "powershell" | "cmd";
}

function getShellPath(ctl: PluginController): string {
  const c = ctl.getPluginConfig(configSchematics);
  return ((c.get("shellPath") as string | undefined) ?? "").trim();
}

function getPythonPath(ctl: PluginController): string {
  const c = ctl.getPluginConfig(configSchematics);
  return ((c.get("pythonPath") as string | undefined) ?? "").trim();
}

function execHints(
  exitCode: number,
  timedOut: boolean,
  stderr: string,
  timeoutMs: number,
): Record<string, string> {
  if (timedOut) {
    return {
      hint: `Command exceeded the ${timeoutMs}ms timeout. Try increasing timeout_ms or splitting the work into smaller steps.`,
    };
  }
  if (exitCode !== 0 && stderr) {
    return { hint: "Non-zero exit code - check stderr for details." };
  }
  return {};
}

const RUNTIME_ENUM = ["python", "node", "bun", "deno", "ts-node"] as const;

function makeExecTool(ctl: PluginController) {
  return tool({
    name: "exec",
    description:
      "Execute any shell command on the user's machine. " +
      "Works across macOS, Linux, and Windows. " +
      "On Windows this runs in PowerShell Core (pwsh), PowerShell (powershell.exe), " +
      "or cmd.exe - whichever is available, in that order. " +
      "On macOS and Linux this runs in bash or sh. " +
      "The response includes platform and shell fields so you can adapt syntax when needed. " +
      "Prefer write_file / patch_file (if available) for writing files - " +
      "do NOT pipe large content through echo or heredocs; it is fragile and slow.",
    parameters: {
      command: z
        .string()
        .min(1)
        .max(EXEC_MAX_COMMAND_LENGTH)
        .describe("The shell command to execute."),
      cwd: z
        .string()
        .optional()
        .describe(
          "Working directory. Supports ~ for the home directory. " +
          "Defaults to the user's home directory when omitted or invalid.",
        ),
      timeout_ms: z
        .number()
        .int()
        .min(1_000)
        .max(EXEC_MAX_TIMEOUT_MS)
        .optional()
        .describe(
          `Timeout in milliseconds. Default ${EXEC_DEFAULT_TIMEOUT_MS} ms, max ${EXEC_MAX_TIMEOUT_MS} ms. ` +
          "Increase for long-running installs or builds.",
        ),
      env: z
        .record(z.string())
        .optional()
        .describe(
          "Extra environment variables merged on top of the current environment. " +
          "Useful for API keys, virtualenv paths, or per-command flags.",
        ),
    },
    implementation: async ({ command, cwd, timeout_ms, env }, { status }) => {
      const timeoutMs = timeout_ms ?? EXEC_DEFAULT_TIMEOUT_MS;

      status(
        `${command.slice(0, 72)}${command.length > 72 ? "…" : ""}`,
      );

      const result = await execCommand(command, {
        cwd,
        timeoutMs,
        shellPath: getShellPath(ctl),
        windowsShell: getWindowsShell(ctl),
        env,
      });

      status(result.timedOut ? "Timed out" : `Exit ${result.exitCode}`);

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        platform: result.platform,
        shell: result.shell,
        ...execHints(result.exitCode, result.timedOut, result.stderr, timeoutMs),
      };
    },
  });
}

function makeRunScriptTool(ctl: PluginController) {
  return tool({
    name: "run_script",
    description:
      "Fast-path tool to run a script file or an inline code snippet. " +
      "Supports Python, Node.js, Bun, Deno, and ts-node - all cross-platform. " +
      "Provide either file_path (run an existing file) or code (inline snippet written to a temp file), not both. " +
      "When file_path is given and runtime is omitted, the runtime is auto-detected from the file extension: " +
      ".py -> python, .js/.mjs/.cjs/.jsx -> node, .ts/.tsx/.mts/.cts -> bun. " +
      "When code is given, runtime is required. " +
      "Args are passed to the script after the file path, just like the command line. " +
      "Use exec instead when you need shell features (pipes, redirection, glob expansion).",
    parameters: {
      runtime: z
        .enum(RUNTIME_ENUM)
        .optional()
        .describe(
          "Script runtime: python | node | bun | deno | ts-node. " +
          "Auto-detected from file extension when file_path is provided. " +
          "Required when code (inline snippet) is used.",
        ),
      file_path: z
        .string()
        .optional()
        .describe(
          "Absolute path to the script file to run. " +
          "Mutually exclusive with code.",
        ),
      code: z
        .string()
        .max(SCRIPT_MAX_CODE_LENGTH)
        .optional()
        .describe(
          "Inline code to execute. Written to a temporary file, then run. " +
          "Mutually exclusive with file_path. Requires runtime to be set.",
        ),
      args: z
        .array(z.string())
        .optional()
        .describe(
          "Command-line arguments passed to the script, e.g. ['--verbose', 'input.csv'].",
        ),
      cwd: z
        .string()
        .optional()
        .describe(
          "Working directory. Supports ~. Defaults to the user's home directory.",
        ),
      timeout_ms: z
        .number()
        .int()
        .min(1_000)
        .max(EXEC_MAX_TIMEOUT_MS)
        .optional()
        .describe(
          `Timeout in milliseconds. Default ${EXEC_DEFAULT_TIMEOUT_MS} ms, max ${EXEC_MAX_TIMEOUT_MS} ms.`,
        ),
      env: z
        .record(z.string())
        .optional()
        .describe(
          "Extra environment variables for this invocation, e.g. KEY/TOKEN/AUTH.",
        ),
    },
    implementation: async (
      { runtime, file_path, code, args, cwd, timeout_ms, env },
      { status },
    ) => {
      if (!file_path && !code) {
        return {
          success: false,
          error: "Provide either file_path (existing script) or code (inline snippet).",
        };
      }
      if (file_path && code) {
        return {
          success: false,
          error: "file_path and code are mutually exclusive - provide only one.",
        };
      }
      if (code && !runtime) {
        return {
          success: false,
          error: "runtime is required when using inline code. Choose: python | node | bun | deno | ts-node",
        };
      }

      let resolvedRuntime: Runtime;

      if (runtime) {
        resolvedRuntime = runtime as Runtime;
      } else {
        const detected = detectRuntimeFromExtension(file_path!);
        if (!detected) {
          return {
            success: false,
            error:
              `Cannot auto-detect runtime from "${file_path}". ` +
              "Set the runtime parameter explicitly: python | node | bun | deno | ts-node",
          };
        }
        resolvedRuntime = detected;
      }

      const pythonOverride = getPythonPath(ctl);
      const cmd = resolveRuntimeCommand(resolvedRuntime, pythonOverride);
      const timeoutMs = timeout_ms ?? EXEC_DEFAULT_TIMEOUT_MS;

      let tempFile: { filePath: string; cleanup(): void } | null = null;
      let scriptPath: string;

      if (code) {
        tempFile = writeTempFile(code, resolvedRuntime);
        scriptPath = tempFile.filePath;
      } else {
        scriptPath = file_path!;
      }

      const scriptArgs = args ?? [];
      const command = buildScriptCommand(cmd, scriptPath, scriptArgs);

      status(`[${cmd.label}] ${scriptPath.split(/[/\\]/).pop()}`);

      try {
        const result = await execCommand(command, {
          cwd,
          timeoutMs,
          shellPath: getShellPath(ctl),
          windowsShell: getWindowsShell(ctl),
          env,
        });

        status(result.timedOut ? "Timed out" : `Exit ${result.exitCode}`);

        return {
          success: !result.timedOut && result.exitCode === 0,
          runtime: cmd.label,
          ...(code ? { tempFile: scriptPath } : { filePath: scriptPath }),
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          platform: result.platform,
          ...execHints(result.exitCode, result.timedOut, result.stderr, timeoutMs),
        };
      } finally {
        tempFile?.cleanup();
      }
    },
  });
}

export async function toolsProvider(ctl: PluginController) {
  return [
    makeExecTool(ctl),
    makeRunScriptTool(ctl),
  ];
}
