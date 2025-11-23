import fs from "fs";
import path from "path";
import { start } from "@heswell/reference-data-service";

const filePath = path.resolve("../logs/reference-data-service.log");
fs.rmSync(filePath, { force: true });

start();
