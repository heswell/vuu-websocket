import pino from "pino";
import path from "path";

const pathToLogs = path.join(__dirname, "../../../logs");

const fileTransport = pino.transport({
  target: "pino/file",
  options: { destination: `${pathToLogs}/order-service.log` },
});

export default pino(
  {
    level: "info",
    formatters: {
      bindings: (bindings) => ({}),
      level: (label) => {
        return { level: label.toUpperCase() };
      },
    },
  },
  fileTransport
);
