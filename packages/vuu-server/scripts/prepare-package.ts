import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareDistPackage } from "../../../scripts/prepare-dist-package";

const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

prepareDistPackage({
  packageRoot: PACKAGE_ROOT,
  distRoot: path.resolve(PACKAGE_ROOT, "../../dist/vuu-server"),
  entries: [
    { subpath: ".", name: "index" },
    { subpath: "./browser", name: "browser" },
  ],
});
