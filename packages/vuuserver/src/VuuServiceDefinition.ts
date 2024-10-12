import url from "url";
import { resolve } from "path";

const path = url.pathToFileURL(import.meta.dir).toString();

export const ServiceDefinition = {
  name: "VuuService",
  module: `${path}/VuuService.ts`,
  modules: resolve(__dirname, `../modules`),
};
