import url from "url";
import { resolve } from "path";

const path = url.pathToFileURL(import.meta.dir).toString();

export const ServiceDefinition = {
  name: "VuuProtocolHandler",
  module: `${path}/VuuProtocolHandler.ts`,
  modules: resolve(__dirname, `../modules`),
};
