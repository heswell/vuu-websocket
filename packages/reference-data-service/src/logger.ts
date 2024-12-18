import pino from "pino";

const fileTransport = pino.transport({
  target: "pino/file",
  options: { destination: `${__dirname}/reference-data-service.log` },
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
