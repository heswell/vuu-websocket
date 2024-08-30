import url from "url";

const path = url.pathToFileURL(import.meta.dir).toString();

export const ServiceDefinition = {
  name: "RestService",
  module: `${path}/RestService.ts`,
};
