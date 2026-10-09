import path from "node:path";
import { ConfigFactory } from "@heswell/service-utils";

export const loadConfig = () =>
  ConfigFactory.load(
    process.env.VUU_CONFIG_FILE ??
      path.resolve(import.meta.dir, "../application.conf"),
  );
