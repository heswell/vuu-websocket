import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  clearLogLevel,
  ConfigFactory,
  configureLogging,
  consoleSink,
  getLogger,
  getLogLevel,
  getLogSink,
  type LogEntry,
  parseLogLevel,
  resetLogging,
  setLogLevel,
  setLogSink,
} from "../src";

const tempDirs: string[] = [];

const confFromText = (contents: string, env: Record<string, string> = {}) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "logger-"));
  tempDirs.push(dir);
  const file = path.join(dir, "application.conf");
  fs.writeFileSync(file, contents);
  return ConfigFactory.fromFile(file, { env });
};

let entries: LogEntry[];
const messages = () =>
  entries.map(
    ({ level, name, args }) => `${level}:${name ?? ""}:${args.join(" ")}`,
  );

const savedEnvLevel = process.env.VUU_LOG_LEVEL;

beforeEach(() => {
  delete process.env.VUU_LOG_LEVEL;
  resetLogging();
  entries = [];
  setLogSink((entry) => entries.push(entry));
});

afterEach(() => {
  if (savedEnvLevel === undefined) {
    delete process.env.VUU_LOG_LEVEL;
  } else {
    process.env.VUU_LOG_LEVEL = savedEnvLevel;
  }
  resetLogging();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const logAll = (name?: string) => {
  const log = getLogger(name);
  log.trace("t");
  log.debug("d");
  log.info("i");
  log.warn("w");
  log.error("e");
};

describe("level filtering", () => {
  test("defaults to info", () => {
    expect(getLogLevel()).toBe("info");
    logAll();
    expect(messages()).toEqual(["info::i", "warn::w", "error::e"]);
  });

  test.each([
    ["trace", ["t", "d", "i", "w", "e"]],
    ["debug", ["d", "i", "w", "e"]],
    ["info", ["i", "w", "e"]],
    ["warn", ["w", "e"]],
    ["error", ["e"]],
    ["silent", []],
  ] as const)("level %s", (level, expected) => {
    setLogLevel(level);
    logAll("test");
    expect(entries.map(({ args }) => args[0])).toEqual([...expected]);
  });

  test("isEnabled reflects the level and changes", () => {
    const log = getLogger("test");
    expect(log.isEnabled("debug")).toBe(false);
    setLogLevel("debug");
    expect(log.isEnabled("debug")).toBe(true);
    expect(log.level).toBe("debug");
  });

  test("passes all arguments and the logger name to the sink", () => {
    const err = new Error("boom");
    getLogger("vuu.net").error("failed", err, { id: 1 });
    expect(entries).toEqual([
      { level: "error", name: "vuu.net", args: ["failed", err, { id: 1 }] },
    ]);
  });

  test("rejects an invalid level", () => {
    expect(() => setLogLevel("loud" as never)).toThrow("Invalid log level");
  });

  test("parseLogLevel is case-insensitive and accepts warning", () => {
    expect(parseLogLevel(" DEBUG ")).toBe("debug");
    expect(parseLogLevel("warning")).toBe("warn");
    expect(parseLogLevel("loud")).toBeUndefined();
    expect(parseLogLevel(3)).toBeUndefined();
  });
});

describe("named loggers", () => {
  test("getLogger returns the same instance per name", () => {
    expect(getLogger("vuu.rpc")).toBe(getLogger("vuu.rpc"));
    expect(getLogger("vuu").child("rpc")).toBe(getLogger("vuu.rpc"));
    expect(getLogger().child("vuu").name).toBe("vuu");
  });

  test("per-name overrides apply to the name and its children", () => {
    setLogLevel("warn");
    setLogLevel("debug", "vuu.viewport");
    setLogLevel("error", "vuu");
    getLogger("vuu.viewport").debug("vp");
    getLogger("vuu.viewport.links").debug("links");
    getLogger("vuu.net").warn("net");
    getLogger("vuu.net").error("net-error");
    getLogger("other").warn("other");
    expect(messages()).toEqual([
      "debug:vuu.viewport:vp",
      "debug:vuu.viewport.links:links",
      "error:vuu.net:net-error",
      "warn:other:other",
    ]);
    expect(getLogLevel("vuu.viewport.links")).toBe("debug");
  });

  test("clearLogLevel removes overrides", () => {
    const log = getLogger("vuu.rpc");
    setLogLevel("trace", "vuu.rpc");
    expect(log.level).toBe("trace");
    clearLogLevel("vuu.rpc");
    expect(log.level).toBe("info");
    setLogLevel("trace", "vuu.rpc");
    clearLogLevel();
    expect(log.level).toBe("info");
  });
});

describe("configureLogging", () => {
  test("reads vuu.log.level from config", () => {
    configureLogging(confFromText('vuu.log.level="debug"'));
    expect(getLogLevel()).toBe("debug");
  });

  test("${?VUU_LOG_LEVEL} in the conf overrides the configured level", () => {
    const conf = 'vuu.log.level="info"\nvuu.log.level=${?VUU_LOG_LEVEL}';
    configureLogging(confFromText(conf, { VUU_LOG_LEVEL: "error" }));
    expect(getLogLevel()).toBe("error");
    configureLogging(confFromText(conf));
    expect(getLogLevel()).toBe("info");
  });

  test("falls back to VUU_LOG_LEVEL when the conf has no level", () => {
    configureLogging(confFromText("a=1"), { env: { VUU_LOG_LEVEL: "warn" } });
    expect(getLogLevel()).toBe("warn");
  });

  test("keeps the current level when neither conf nor env set it", () => {
    setLogLevel("debug");
    configureLogging(confFromText("a=1"), { env: {} });
    expect(getLogLevel()).toBe("debug");
  });

  test("applies vuu.log.levels.<name> overrides", () => {
    configureLogging(
      confFromText(
        [
          'vuu.log.level="warn"',
          "vuu.log.levels.vuu.rpc=trace",
          "vuu.log.levels.net=debug",
        ].join("\n"),
      ),
    );
    expect(getLogLevel()).toBe("warn");
    expect(getLogLevel("vuu.rpc")).toBe("trace");
    expect(getLogLevel("net.ws")).toBe("debug");
    expect(getLogLevel("vuu.viewport")).toBe("warn");
  });

  test("warns about and ignores an invalid level", () => {
    configureLogging(confFromText('vuu.log.level="loud"'));
    expect(getLogLevel()).toBe("info");
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe("warn");
    expect(String(entries[0].args[0])).toContain("'loud'");
  });

  test("can install a sink", () => {
    const captured: LogEntry[] = [];
    const sink = (entry: LogEntry) => captured.push(entry);
    configureLogging(confFromText("a=1"), { env: {}, sink });
    expect(getLogSink()).toBe(sink);
    getLogger("x").info("hello");
    expect(captured).toHaveLength(1);
    expect(entries).toHaveLength(0);
  });
});

describe("sinks", () => {
  test("resetLogging restores the console sink and env level", () => {
    process.env.VUU_LOG_LEVEL = "error";
    resetLogging();
    expect(getLogSink()).toBe(consoleSink);
    expect(getLogLevel()).toBe("error");
  });

  test("setLogSink() with no argument restores the console sink", () => {
    setLogSink();
    expect(getLogSink()).toBe(consoleSink);
  });

  test("console sink maps levels to console methods and prefixes the name", () => {
    const debug = spyOn(console, "debug").mockImplementation(() => {});
    const info = spyOn(console, "info").mockImplementation(() => {});
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      setLogSink(consoleSink);
      setLogLevel("trace");
      getLogger("vuu.net").trace("t");
      getLogger("vuu.net").info("i", 1);
      getLogger().warn("w");
      getLogger("vuu.net").error("e");
      expect(debug).toHaveBeenCalledWith("[vuu.net]", "t");
      expect(info).toHaveBeenCalledWith("[vuu.net]", "i", 1);
      expect(warn).toHaveBeenCalledWith("w");
      expect(error).toHaveBeenCalledWith("[vuu.net]", "e");
    } finally {
      debug.mockRestore();
      info.mockRestore();
      warn.mockRestore();
      error.mockRestore();
    }
  });

  test("disabled levels do not reach the sink", () => {
    setLogLevel("silent");
    logAll("x");
    expect(entries).toHaveLength(0);
  });
});
