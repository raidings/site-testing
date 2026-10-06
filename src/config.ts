import { createConfigSchematics } from "@lmstudio/sdk";

export const configSchematics = createConfigSchematics()
  .field(
    "shellPath",
    "string",
    {
      displayName: "Shell Path (optional)",
      subtitle:
        "Override the default shell used by exec. " +
        "Leave empty to auto-detect: bash/sh on macOS & Linux, " +
        "pwsh -> powershell -> cmd on Windows.",
    },
    "",
  )
  .field(
    "windowsShell",
    "select",
    {
      displayName: "Windows Shell",
      subtitle: "Which shell exec uses on Windows. Select PowerShell to prefer pwsh -> powershell.exe.",
      options: [
        { value: "cmd", displayName: "Command Prompt (cmd.exe)" },
        { value: "powershell", displayName: "PowerShell (powershell.exe)" },
      ],
    },
    "cmd",
  )
  .field(
    "pythonPath",
    "string",
    {
      displayName: "Python Executable (optional)",
      subtitle:
        'Override the Python binary used by run_script. ' +
        'Leave empty to auto-detect (python3 on Unix, python on Windows). ' +
        'ex: /usr/local/bin/python3.12 or C:\\Python312\\python.exe',
    },
    "",
  )
  .build();
