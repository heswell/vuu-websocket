import url from "url";

const path = url.pathToFileURL(import.meta.dir).toString();

export const ServiceDefinition = {
  name: "DataTableService",
  module: `${path}/DataTableService.js`,
};
