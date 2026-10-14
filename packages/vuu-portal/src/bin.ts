#!/usr/bin/env bun
import { main } from "./main";

const USAGE = `Usage: vuu-portal [--config <path/to/application.conf>]

Starts the Vuu portal server. All settings (ports, websocket path, auth,
module catalogue files, module admin role) come from application.conf.

Without --config the conf is located via $VUU_CONFIG_FILE, then $VUU_APP
(packages/<app>/application.conf), then ./application.conf, then the
conf bundled with the package. The bundled conf is for local development:
permissive auth, no TLS (ws:// and http://), websocket on 8091 and REST on
8443, and modules.yaml in the current directory. Override it with
VUU_AUTH_MODE, VUU_SSL, VUU_CERT_PATH, VUU_KEY_PATH, VUU_WEBSOCKET_PORT,
VUU_HTTPS_PORT, VUU_WEBSOCKET_PATH, VUU_PORTAL_MODULES_FILE,
VUU_PORTAL_DEFAULT_MODULES_FILE, VUU_CORS_ALLOWED_ORIGINS, VUU_LOG_LEVEL.`;

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
