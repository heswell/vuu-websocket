import path from "node:path";
import pino, { type Logger } from "pino";

let instance: Logger | undefined;

// Created on first use so that importing @heswell/vuu-server does not start a
// pino transport worker or touch the file system.
const getLogger = (): Logger => {
  if (!instance) {
    const destination =
      process.env.VUU_SERVER_LOG_FILE ??
      path.join(process.cwd(), "logs", "vuu-server.log");
    instance = pino(
      {
        level: "info",
        formatters: {
          bindings: () => ({}),
          level: (label) => ({ level: label.toUpperCase() }),
        },
      },
      pino.transport({
        target: "pino/file",
        options: { destination, mkdir: true },
      }),
    );
  }
  return instance;
};

const logger = {
  info: (message: string) => getLogger().info(message),
};

export default logger;
