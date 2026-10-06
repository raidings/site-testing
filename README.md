# lms-plugin-terminal

A lean, fast-path terminal plugin for LM Studio. Gives any model two focused tools:

| Tool | What it does |
|---|---|
| `exec` | Execute any shell command - bash/sh on macOS & Linux, pwsh/powershell/cmd on Windows |
| `run_script` | Run a Python, Node.js, Bun, Deno, or ts-node file (or inline snippet) with zero friction |

---

## Tools

### `exec`

Run any shell command with full cross-platform support.

```
exec(
  command     : string        - the command to run
  cwd?        : string        - working directory (supports ~)
  timeout_ms? : number        - ms before SIGKILL, default 30 000, max 300 000
  env?        : {[k]: string} - extra env vars merged on top of the environment
)
```

**Returns** `stdout`, `stderr`, `exitCode`, `timedOut`, `platform`, `shell`.

The `platform` and `shell` fields tell the model exactly what ran so it can adapt syntax (e.g. PowerShell vs bash pipeline operators).

---

### `run_script`

Run a script file or an inline code snippet through a specific language runtime.

```
run_script(
  runtime?    : "python"|"node"|"bun"|"deno"|"ts-node"
  file_path?  : string        - absolute path to an existing script file
  code?       : string        - inline source code (written to a temp file)
  args?       : string[]      - arguments passed to the script
  cwd?        : string        - working directory (supports ~)
  timeout_ms? : number        - ms timeout
  env?        : {[k]: string} - extra env vars
)
```

Exactly one of `file_path` or `code` must be provided.

**Auto-detection** - when `file_path` is given and `runtime` is omitted, the runtime is detected from the file extension:

| Extension | Runtime |
|---|---|
| `.py` | python |
| `.js` `.mjs` `.cjs` `.jsx` | node |
| `.ts` `.tsx` `.mts` `.cts` | bun |

When `code` (inline) is used, `runtime` is required.

**Returns** `success`, `runtime`, `stdout`, `stderr`, `exitCode`, `timedOut`, `platform`.

---

## Settings

| Setting | Default | Description |
|---|---|---|
| Windows Shell | `Command Prompt (cmd.exe)` | Which shell `exec` uses on Windows. Select PowerShell to prefer `pwsh` -> `powershell.exe`. |
| Shell Path | *(empty)* | Override the shell path for `exec`. Leave empty to use the default shell. |
| Python Executable | *(empty)* | Override the Python binary for `run_script`. Auto-detects when empty. |

### Shell auto-detection

| Platform | Default Behavior |
|---|---|
| macOS / Linux | `/bin/bash` -> `/usr/bin/bash` -> `/bin/sh` -> `/usr/bin/sh` |
| Windows (cmd) | `cmd.exe` |
| Windows (powershell) | `pwsh.exe` (PS 7) -> `powershell.exe` (built-in) -> `cmd.exe` |

### Python auto-detection

| Platform | Search order |
|---|---|
| macOS / Linux | `python3` -> `python` |
| Windows | `py` -> `python` -> `python3` |

Set **Python Executable** in the plugin settings to point at a specific interpreter (e.g. inside a virtualenv or conda environment).

---

## Local Development

```bash
cd lms-plugin-terminal
bun install
lms dev
```

---

## Examples

### Run a shell command

```
exec("ls -lh ~/Downloads")
exec("git status", { cwd: "/Users/you/myproject" })
exec("npm install", { cwd: "/Users/you/myapp", timeout_ms: 120000 })
```

### Run a Python file

```
run_script({ file_path: "/Users/you/analysis.py" })
run_script({ file_path: "/Users/you/script.py", args: ["--input", "data.csv"] })
```

### Run inline Python

```
run_script({
  runtime: "python",
  code: "import sys; print(sys.version)"
})
```

### Run a TypeScript file with Bun

```
run_script({ file_path: "/Users/you/app.ts" })          // bun auto-detected
run_script({ runtime: "bun", file_path: "/Users/you/app.ts" })  // explicit
```

### Run inline Node.js

```
run_script({
  runtime: "node",
  code: "console.log(process.versions)"
})
```

### Run a Deno script

```
run_script({ runtime: "deno", file_path: "/Users/you/fetch.ts" })
```

---

## Platform notes

- **Windows**: `exec` defaults to `cmd.exe`. You can change this to prefer PowerShell (Core or Windows PowerShell) in the plugin settings. The plugin injects a UTF-8 encoding preamble when using PowerShell so output is always readable.
- **Python on Windows**: the system Python is often registered as `py` or `python`. The plugin tries multiple common names automatically; override via the **Python Executable** setting to target a specific version or virtual environment.
- **Bun for TypeScript**: Bun is the default runner for `.ts` files because it executes them natively without a compilation step. Install with `curl -fsSL https://bun.sh/install | bash` (Unix) or `powershell -c "irm bun.sh/install.ps1 | iex"` (Windows).
- **ts-node**: selected explicitly via `runtime: "ts-node"`. Invoked through `npx --yes ts-node` so no global install is needed, but it is slower than Bun.

## License

- [Apache 2.0](LICENSE)