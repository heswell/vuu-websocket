#!/usr/bin/env bun
import { main } from "./main";

const USAGE = `Usage: vuu-portal [--config <path/to/application.conf>]

Starts the Vuu portal server. All settings (ports, websocket path, auth,
module catalogue files, module admin role) come from application.conf.

Without --config the conf is located via $VUU_CONFIG_FILE, then $VUU_APP
(packages/<app>/application.conf), then ./application.conf.`;

const parseConfigFile = (args: string[]) => {
  let configFile: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else if (arg === "--config" || arg === "-c") {
      configFile = args[++index];
      if (!configFile) throw new Error(`${arg} requires a path\n\n${USAGE}`);
    } else if (arg.startsWith("--config=")) {
      configFile = arg.slice("--config=".length);
    } else {
      throw new Error(`Unknown argument '${arg}'\n\n${USAGE}`);
    }
  }
  return configFile;
};

await main({ configFile: parseConfigFile(process.argv.slice(2)) });
