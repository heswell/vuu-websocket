import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ConfigFactory, type ConfigLoadOptions } from "../src";

const tempDirs: string[] = [];

const writeConf = (contents: string) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "config-factory-"));
  tempDirs.push(dir);
  const file = path.join(dir, "application.conf");
  fs.writeFileSync(file, contents);
  return file;
};

const load = (contents: string, options?: ConfigLoadOptions) => {
  ConfigFactory.reset();
  return ConfigFactory.load(writeConf(contents), options);
};

afterEach(() => {
  ConfigFactory.reset();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("ConfigFactory value parsing", () => {
  test("parses numbers, booleans, quoted and unquoted strings", () => {
    const config = load(
      [
        "a.number=8443",
        "a.bool=true",
        'a.quoted="8443"',
        "a.text=hello world # comment",
      ].join("\n"),
    );
    expect(config.get("a.number")).toBe(8443);
    expect(config.get("a.bool")).toBe(true);
    expect(config.get("a.quoted")).toBe("8443");
    expect(config.get("a.text")).toBe("hello world");
  });
});

describe("ConfigFactory getPath", () => {
  test("resolves relative paths against the conf file directory", () => {
    const file = writeConf('modules="data/modules.yaml"');
    ConfigFactory.reset();
    const config = ConfigFactory.load(file);
    expect(config.getPath("modules")).toBe(
      path.join(path.dirname(file), "data/modules.yaml"),
    );
  });

  test("returns absolute paths unchanged", () => {
    const absolute = path.join(os.tmpdir(), "elsewhere", "modules.yaml");
    const config = load(`modules="${absolute}"`);
    expect(config.getPath("modules")).toBe(absolute);
  });

  test("expands a leading ~/ to the home directory", () => {
    const config = load('modules="~/vuu/modules.yaml"\nhome="~"');
    expect(config.getPath("modules")).toBe(
      path.join(os.homedir(), "vuu/modules.yaml"),
    );
    expect(config.getPath("home")).toBe(os.homedir());
  });
});

describe("ConfigFactory substitutions", () => {
  test("${VAR} substitutes and type-parses the value", () => {
    const config = load(
      "port=${PORT}\nssl=${SSL}\nname=${NAME}",
      { env: { PORT: "9443", SSL: "false", NAME: "portal" } },
    );
    expect(config.get("port")).toBe(9443);
    expect(config.get("ssl")).toBe(false);
    expect(config.get("name")).toBe("portal");
  });

  test("${VAR} throws a clear error naming the key and variable when unset", () => {
    expect(() => load("vuu.https.port=${VUU_HTTPS_PORT}", { env: {} })).toThrow(
      /vuu\.https\.port.*VUU_HTTPS_PORT/,
    );
  });

  test("${?VAR} overrides an earlier assignment when set", () => {
    const config = load(
      "vuu.https.port=8443\nvuu.https.port=${?VUU_HTTPS_PORT}",
      { env: { VUU_HTTPS_PORT: "18443" } },
    );
    expect(config.get("vuu.https.port")).toBe(18443);
  });

  test("${?VAR} is ignored when unset, keeping the earlier assignment", () => {
    const config = load(
      "vuu.https.port=8443\nvuu.https.port=${?VUU_HTTPS_PORT}\nunset=${?NOPE}",
      { env: {} },
    );
    expect(config.get("vuu.https.port")).toBe(8443);
    expect(config.has("unset")).toBe(false);
  });

  test("substitutions are not expanded inside quotes", () => {
    const config = load('literal="${HOST}"', { env: { HOST: "example" } });
    expect(config.get("literal")).toBe("${HOST}");
  });

  test("concatenates quoted strings, unquoted text and substitutions", () => {
    const config = load(
      [
        'url="https://"${HOST}":8443/realms"',
        "bare=https://${HOST}:${PORT}",
        "mixed=${HOST}${?MISSING}-suffix",
        "num=${A}${B}",
        'quotedNum="1"${B}',
      ].join("\n"),
      { env: { HOST: "auth.example.com", PORT: "8080", A: "1", B: "2" } },
    );
    expect(config.get("url")).toBe("https://auth.example.com:8443/realms");
    expect(config.get("bare")).toBe("https://auth.example.com:8080");
    expect(config.get("mixed")).toBe("auth.example.com-suffix");
    expect(config.get("num")).toBe(12);
    expect(config.get("quotedNum")).toBe("12");
  });

  test("defaults to process.env", () => {
    process.env.CONFIG_FACTORY_TEST_PORT = "7001";
    try {
      const config = load("port=${CONFIG_FACTORY_TEST_PORT}");
      expect(config.get("port")).toBe(7001);
    } finally {
      delete process.env.CONFIG_FACTORY_TEST_PORT;
    }
  });
});

describe("ConfigFactory overrides", () => {
  test("overrides win over literal and substituted values", () => {
    const config = load(
      "a=1\nb=${?B}\nc=keep",
      { env: { B: "2" }, overrides: { a: 10, b: "twenty", d: true } },
    );
    expect(config.get("a")).toBe(10);
    expect(config.get("b")).toBe("twenty");
    expect(config.get("c")).toBe("keep");
    expect(config.get("d")).toBe(true);
  });

  test("load() with no args returns the loaded singleton", () => {
    const config = load("a=1", { overrides: { a: 2 } });
    expect(ConfigFactory.load()).toBe(config);
  });

  test("load() with the same args returns the singleton", () => {
    const file = writeConf("a=1");
    ConfigFactory.reset();
    const config = ConfigFactory.load(file, { overrides: { a: 2 } });
    expect(ConfigFactory.load(file, { overrides: { a: 2 } })).toBe(config);
  });

  test("load() with a different path or overrides throws until reset()", () => {
    const file = writeConf("a=1");
    const other = writeConf("a=2");
    ConfigFactory.reset();
    ConfigFactory.load(file);
    expect(() => ConfigFactory.load(other)).toThrow(/reset/);
    expect(() => ConfigFactory.load(file, { overrides: { a: 3 } })).toThrow(
      /reset/,
    );
    ConfigFactory.reset();
    expect(ConfigFactory.load(other).get("a")).toBe(2);
  });

  test("fromFile() reads a conf without using or replacing the singleton", () => {
    const file = writeConf("a=1");
    const other = writeConf("a=2\nb=${?B}");
    ConfigFactory.reset();
    const shared = ConfigFactory.load(file);
    const own = ConfigFactory.fromFile(other, {
      env: { B: "3" },
      overrides: { c: "x" },
    });
    expect(own.get("a")).toBe(2);
    expect(own.get("b")).toBe(3);
    expect(own.get("c")).toBe("x");
    expect(ConfigFactory.load()).toBe(shared);
  });
});
