import fs from "fs";
import path from "path";
import { start } from "@heswell/orders-service";

const filePath = path.resolve("../logs/order-service.log");
fs.rmSync(filePath, { force: true });

start();
