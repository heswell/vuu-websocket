import type { Config, ConfigEnvironment } from "./ConfigFactory";

/**
 * A small leveled logger. Levels, from most to least verbose:
 * `trace`, `debug`, `info`, `warn`, `error`, `silent`.
 *
 * The process-wide level defaults to `info`, or to `VUU_LOG_LEVEL` when that
 * environment variable is set. `configureLogging(config)` applies
 * `vuu.log.level` and any per-name `vuu.log.levels.<name>` overrides from a
 * conf file. Output goes to a sink, which defaults to the console.
 */
export const LogLevels = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "silent",
] as const;

export type LogLevel = (typeof LogLevels)[number];

/** A level a message can be logged at (every level except `silent`). */
export type LogMessageLevel = Exclude<LogLevel, "silent">;

export interface LogEntry {
  level: LogMessageLevel;
  /** Name of the logger, `undefined` for the root logger. */
  name: string | undefined;
  args: unknown[];
}

export type LogSink = (entry: LogEntry) => void;

export interface Logger {
  readonly name: string | undefined;
  /** The effective level, after any per-name override. */
  readonly level: LogLevel;
  trace(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  /** Use to skip building expensive log arguments. */
  isEnabled(level: LogMessageLevel): boolean;
  /** Returns the logger named `<this name>.<name>`. */
  child(name: string): Logger;
}

export const LOG_LEVEL_CONFIG_KEY = "vuu.log.level";
export const LOG_LEVELS_CONFIG_PREFIX = "vuu.log.levels.";
export const LOG_LEVEL_ENV_VAR = "VUU_LOG_LEVEL";

const DEFAULT_LEVEL: LogLevel = "info";

const severity: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  silent: 5,
};

export const isLogLevel = (value: unknown): value is LogLevel =>
  typeof value === "string" && value in severity;

/** Parses a level case-insensitively. `warning` is accepted for `warn`. */
export function parseLogLevel(value: unknown): LogLevel | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "warning") {
    return "warn";
  }
  return isLogLevel(normalized) ? normalized : undefined;
}

const consoleMethod: Record<
  LogMessageLevel,
  "debug" | "info" | "warn" | "error"
> = {
  trace: "debug",
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error",
};

/** The default sink. Prefixes messages with `[name]` for named loggers. */
export const consoleSink: LogSink = ({ level, name, args }) => {
  const method = console[consoleMethod[level]];
  if (name === undefined) {
    method(...args);
  } else {
    method(`[${name}]`, ...args);
  }
};

const initialLevel = (): LogLevel => {
  const env =
    typeof process === "undefined"
      ? undefined
      : process.env?.[LOG_LEVEL_ENV_VAR];
  return parseLogLevel(env) ?? DEFAULT_LEVEL;
};

interface LoggingState {
  rootLevel: LogLevel;
  nameLevels: Map<string, LogLevel>;
  sink: LogSink;
  // Bumped on every level change so loggers can cache their effective level.
  generation: number;
}

// Kept on globalThis so that every copy of this package loaded in a process
// (e.g. two installed versions) shares one level and sink.
const STATE_KEY = Symbol.for("@heswell/service-utils/logging");
let cachedState: LoggingState | undefined;

// Created on first use, so importing the package has no side effects.
function getState(): LoggingState {
  if (cachedState === undefined) {
    const shared = globalThis as Record<symbol, LoggingState | undefined>;
    cachedState = shared[STATE_KEY] ??= {
      rootLevel: initialLevel(),
      nameLevels: new Map(),
      sink: consoleSink,
      generation: 0,
    };
  }
  return cachedState;
}

function resolveLevel(name: string | undefined): LogLevel {
  const { nameLevels, rootLevel } = getState();
  if (name !== undefined && nameLevels.size > 0) {
    let current = name;
    for (;;) {
      const level = nameLevels.get(current);
      if (level !== undefined) {
        return level;
      }
      const dot = current.lastIndexOf(".");
      if (dot === -1) {
        break;
      }
      current = current.slice(0, dot);
    }
  }
  return rootLevel;
}

class LoggerImpl implements Logger {
  #generation = -1;
  #level: LogLevel = DEFAULT_LEVEL;

  constructor(readonly name: string | undefined) {}

  get level(): LogLevel {
    const { generation } = getState();
    if (this.#generation !== generation) {
      this.#level = resolveLevel(this.name);
      this.#generation = generation;
    }
    return this.#level;
  }

  isEnabled(level: LogMessageLevel): boolean {
    return severity[level] >= severity[this.level];
  }

  #log(level: LogMessageLevel, args: unknown[]) {
    if (this.isEnabled(level)) {
      getState().sink({ level, name: this.name, args });
    }
  }

  trace(...args: unknown[]) {
    this.#log("trace", args);
  }
  debug(...args: unknown[]) {
    this.#log("debug", args);
  }
  info(...args: unknown[]) {
    this.#log("info", args);
  }
  warn(...args: unknown[]) {
    this.#log("warn", args);
  }
  error(...args: unknown[]) {
    this.#log("error", args);
  }

  child(name: string): Logger {
    return getLogger(this.name === undefined ? name : `${this.name}.${name}`);
  }
}

const loggers = new Map<string, Logger>();
const rootLogger = new LoggerImpl(undefined);

/**
 * Returns the logger with this name, or the root logger when no name is
 * given. Names are dot separated (e.g. `vuu.net`), and a level set for
 * `vuu` also applies to `vuu.net` unless `vuu.net` has its own.
 */
export function getLogger(name?: string): Logger {
  if (name === undefined || name === "") {
    return rootLogger;
  }
  let logger = loggers.get(name);
  if (!logger) {
    logger = new LoggerImpl(name);
    loggers.set(name, logger);
  }
  return logger;
}

/**
 * Sets the process-wide level, or, with a name, the level for that logger
 * and its children.
 */
export function setLogLevel(level: LogLevel, name?: string): void {
  if (!isLogLevel(level)) {
    throw new Error(
      `Invalid log level '${String(level)}', expected one of ${LogLevels.join(", ")}`,
    );
  }
  if (name === undefined || name === "") {
    getState().rootLevel = level;
  } else {
    getState().nameLevels.set(name, level);
  }
  getState().generation += 1;
}

/** The effective level for a logger name, or the process-wide level. */
export function getLogLevel(name?: string): LogLevel {
  return resolveLevel(name || undefined);
}

/** Removes per-name overrides: one name, or all of them. */
export function clearLogLevel(name?: string): void {
  if (name === undefined) {
    getState().nameLevels.clear();
  } else {
    getState().nameLevels.delete(name);
  }
  getState().generation += 1;
}

/** Replaces the sink. Call with no argument to restore the console sink. */
export function setLogSink(newSink: LogSink = consoleSink): void {
  getState().sink = newSink;
}

export function getLogSink(): LogSink {
  return getState().sink;
}

export interface ConfigureLoggingOptions {
  /** Used when the config has no `vuu.log.level`. Defaults to `process.env`. */
  env?: ConfigEnvironment;
  sink?: LogSink;
}

type LoggingConfig = Pick<Config, "get" | "toObject">;

/**
 * Applies log levels from config: `vuu.log.level` for the process-wide level
 * and `vuu.log.levels.<name>` for per-name overrides. When the config has no
 * `vuu.log.level`, `VUU_LOG_LEVEL` from the environment is used, otherwise
 * the current level is kept. Invalid values are reported with `warn` and
 * ignored.
 */
export function configureLogging(
  config: LoggingConfig,
  options: ConfigureLoggingOptions = {},
): void {
  const { env = typeof process === "undefined" ? {} : process.env, sink: newSink } =
    options;
  if (newSink) {
    setLogSink(newSink);
  }
  const log = getLogger("vuu.log");
  const apply = (value: unknown, source: string, name?: string) => {
    const level = parseLogLevel(value);
    if (level) {
      setLogLevel(level, name);
    } else {
      log.warn(
        `Ignoring invalid log level '${String(value)}' from ${source}, expected one of ${LogLevels.join(", ")}`,
      );
    }
  };

  const configured = config.get(LOG_LEVEL_CONFIG_KEY);
  if (configured !== undefined) {
    apply(configured, LOG_LEVEL_CONFIG_KEY);
  } else if (env[LOG_LEVEL_ENV_VAR] !== undefined) {
    apply(env[LOG_LEVEL_ENV_VAR], LOG_LEVEL_ENV_VAR);
  }

  for (const [key, value] of Object.entries(config.toObject())) {
    if (key.startsWith(LOG_LEVELS_CONFIG_PREFIX)) {
      const name = key.slice(LOG_LEVELS_CONFIG_PREFIX.length);
      if (name) {
        apply(value, key, name);
      }
    }
  }
}

/**
 * Restores the defaults: the level from `VUU_LOG_LEVEL` or `info`, no
 * per-name overrides and the console sink.
 */
export function resetLogging(): void {
  const state = getState();
  state.rootLevel = initialLevel();
  state.nameLevels.clear();
  state.sink = consoleSink;
  state.generation += 1;
}
