import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let root: string;

const writeJson = (relativePath: string, value: unknown) => {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value));
};

const readJson = (relativePath: string) =>
  JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));

const run = (script: string, ...args: string[]) => {
  const result = Bun.spawnSync(
    [process.execPath, "--preload", "./registry.ts", `./scripts/${script}.ts`, ...args],
    { cwd: root, env: { ...process.env, BUN_OPTIONS: "" } },
  );
  return {
    code: result.exitCode,
    output: result.stdout.toString() + result.stderr.toString(),
  };
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "vuu-release-"));
  fs.mkdirSync(path.join(root, "scripts"));
  for (const name of [
    "bump-versions",
    "publish",
    "publishable-packages",
    "workspace-packages",
  ]) {
    fs.copyFileSync(
      path.resolve(import.meta.dir, `../${name}.ts`),
      path.join(root, "scripts", `${name}.ts`),
    );
  }
  writeJson("package.json", {
    name: "fixture",
    version: "1.0.0",
    dependencies: { "@heswell/vuu-demo": "^3.0.0" },
  });
  writeJson("packages/user-admin/package.json", {
    name: "@heswell/user-admin",
    version: "1.0.0",
  });
  writeJson("packages/vuu-demo/package.json", {
    name: "@heswell/vuu-demo",
    version: "3.0.0",
  });
  writeJson("packages/nested/consumer/package.json", {
    name: "@heswell/consumer",
    version: "1.0.0-beta.2",
    private: true,
    dependencies: { "@heswell/vuu-demo": "~3.0.0" },
    devDependencies: { "@heswell/vuu-demo": "3.0.0" },
    peerDependencies: { "@heswell/vuu-demo": "^3.0.0" },
    optionalDependencies: { "@heswell/vuu-demo": "^3.0.0" },
  });
  writeJson("package-lock.json", {
    lockfileVersion: 3,
    packages: {
      "": readJson("package.json"),
      "packages/vuu-demo": readJson("packages/vuu-demo/package.json"),
      "packages/nested/consumer": readJson("packages/nested/consumer/package.json"),
      "node_modules/@external/pkg": {
        version: "1.0.0",
        dependencies: { "@heswell/vuu-demo": "1.1.0" },
      },
    },
  });
  fs.writeFileSync(
    path.join(root, "registry.ts"),
    `Bun.spawnSync = () => { throw new Error("Unexpected build or publish"); };
globalThis.fetch = async (url) => {
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  if (name === "@heswell/consumer") return new Response("", { status: 404 });
  if (process.argv.includes("--registry-error") && name === "@heswell/vuu-demo") {
    return new Response("", { status: 503 });
  }
  return Response.json({ "dist-tags": {
    alpha: "3.0.1-alpha.1", beta: "3.0.1-beta.1", latest: "3.0.0"
  }, versions: { "3.0.0": {} } });
};`,
  );
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("bump:versions", () => {
  test("bumps a non-publishable workspace and updates root, nested dependants and lockfile", () => {
    const result = run("bump-versions", "--package", "@heswell/vuu-demo");
    expect(result.code).toBe(0);
    expect(readJson("packages/vuu-demo/package.json").version).toBe("3.0.1");
    expect(readJson("packages/user-admin/package.json").version).toBe("1.0.0");
    expect(readJson("package.json").dependencies["@heswell/vuu-demo"]).toBe("^3.0.1");
    const consumer = readJson("packages/nested/consumer/package.json");
    expect(consumer.dependencies["@heswell/vuu-demo"]).toBe("~3.0.1");
    expect(consumer.devDependencies["@heswell/vuu-demo"]).toBe("3.0.1");
    expect(consumer.peerDependencies["@heswell/vuu-demo"]).toBe("^3.0.0");
    expect(consumer.optionalDependencies["@heswell/vuu-demo"]).toBe("^3.0.1");
    const lock = readJson("package-lock.json").packages;
    expect(lock["packages/vuu-demo"].version).toBe("3.0.1");
    expect(lock[""].dependencies["@heswell/vuu-demo"]).toBe("^3.0.1");
    expect(lock["packages/nested/consumer"].dependencies["@heswell/vuu-demo"]).toBe("~3.0.1");
    expect(lock["node_modules/@external/pkg"].dependencies["@heswell/vuu-demo"]).toBe("1.1.0");
  });

  test("bumps private nested prereleases and accepts explicit versions", () => {
    expect(run("bump-versions", "--package=@heswell/consumer").code).toBe(0);
    expect(readJson("packages/nested/consumer/package.json").version).toBe("1.0.0-beta.3");
    expect(run("bump-versions", "--package=@heswell/vuu-demo", "--version", "4.0.0-alpha.1").code).toBe(0);
    expect(readJson("packages/vuu-demo/package.json").version).toBe("4.0.0-alpha.1");
  });

  test("retains the default package", () => {
    expect(run("bump-versions").code).toBe(0);
    expect(readJson("packages/user-admin/package.json").version).toBe("1.0.1");
    expect(readJson("packages/vuu-demo/package.json").version).toBe("3.0.0");
  });

  test("rejects invalid options without modifying manifests", () => {
    for (const args of [
      ["--package=missing"],
      ["--package"],
      ["--version="],
      ["--version=invalid"],
      ["--unknown"],
    ]) {
      expect(run("bump-versions", ...args).code).not.toBe(0);
    }
    expect(readJson("packages/user-admin/package.json").version).toBe("1.0.0");
  });
});

describe("pub --version-check", () => {
  test("lists every workspace, including non-publishable, private and unpublished packages", () => {
    const { code, output } = run("publish", "--version-check");
    expect(code).toBe(0);
    for (const name of ["@heswell/user-admin", "@heswell/vuu-demo", "@heswell/consumer"]) {
      expect(output).toContain(name);
    }
    expect(output).toContain("unavailable");
    expect(output).toContain("3.0.1-alpha.1");
    expect(output).toContain("3.0.1-beta.1");
    expect(output).toContain("1.0.0-beta.2");
    expect(output).not.toContain("Unexpected build or publish");
  });

  test("filters to any explicitly selected workspace package", () => {
    for (const args of [["--package=@heswell/vuu-demo"], ["--package", "@heswell/vuu-demo"]]) {
      const { code, output } = run("publish", "--version-check", ...args);
      expect(code).toBe(0);
      expect(output).toContain("@heswell/vuu-demo");
      expect(output).not.toContain("@heswell/user-admin");
      expect(output).not.toContain("@heswell/consumer");
    }
  });

  test("shows source and stale dist versions side by side", () => {
    writeJson("dist/vuu-demo/package.json", {
      name: "@heswell/vuu-demo",
      version: "2.9.7",
    });
    const { code, output } = run(
      "publish", "--version-check", "--package=@heswell/vuu-demo",
    );
    expect(code).toBe(0);
    expect(output).toContain("dist/package.json");
    expect(output).toContain("3.0.0");
    expect(output).toContain("2.9.7");
  });

  test("shows unavailable for missing dist output", () => {
    const { code, output } = run(
      "publish", "--version-check", "--package=@heswell/vuu-demo",
    );
    expect(code).toBe(0);
    expect(output).toContain("dist/package.json");
    expect(output).toContain("unavailable");
  });

  test("shows nested dist versions even when the package is unpublished", () => {
    writeJson("dist/nested/consumer/package.json", {
      name: "@heswell/consumer",
      version: "1.0.0-beta.1",
    });
    const { code, output } = run(
      "publish", "--version-check", "--package=@heswell/consumer",
    );
    expect(code).toBe(0);
    expect(output).toContain("1.0.0-beta.2");
    expect(output).toContain("1.0.0-beta.1");
    expect(output).toContain("unavailable");
  });

  test("reports invalid dist manifests instead of masking them as unavailable", () => {
    writeJson("dist/vuu-demo/package.json", { name: "@heswell/vuu-demo" });
    const { code, output } = run(
      "publish", "--version-check", "--package=@heswell/vuu-demo",
    );
    expect(code).not.toBe(0);
    expect(output).toContain("Invalid package manifest");
    expect(output).toContain("dist/vuu-demo/package.json");
  });

  test("shows successful rows and reports registry failures with a failing exit code", () => {
    const preload = path.join(root, "registry.ts");
    fs.writeFileSync(preload, fs.readFileSync(preload, "utf8").replace(
      'process.argv.includes("--registry-error")',
      "true",
    ));
    const { code, output } = run("publish", "--version-check");
    expect(code).not.toBe(0);
    expect(output).toContain("@heswell/user-admin");
    expect(output).toContain("@heswell/consumer");
    expect(output).toContain("503");
    expect(output).toContain("1 version check(s) failed");
  });

  test("rejects unknown packages, conflicting flags and unsupported publishing", () => {
    for (const args of [
      ["--version-check", "--package=missing"],
      ["--version-check", "--dry-run"],
      ["--version-check", "--tag=beta"],
      ["--package=@heswell/vuu-demo", "--dry-run"],
    ]) {
      const { code, output } = run("publish", ...args);
      expect(code).not.toBe(0);
      expect(output).not.toContain("Unexpected build or publish");
    }
  });
});
