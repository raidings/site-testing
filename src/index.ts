import { configSchematics } from "./config";
import { toolsProvider } from "./toolsProvider";
import type { PluginContext } from "./pluginTypes";

export async function main(context: PluginContext) {
  context.withConfigSchematics(configSchematics);
  context.withToolsProvider(toolsProvider);
}
