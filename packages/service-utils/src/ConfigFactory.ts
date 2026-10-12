import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type ConfigValue = string | number | boolean;

export type ConfigEnvironment = Record<string, string | undefined>;

export interface ConfigLoadOptions {
  /**
   * Values that win over the file, including any substitutions in it.
   * Keys use the same dotted form as the file, e.g. `vuu.https.port`.
   */
  overrides?: Record<string, ConfigValue>;
  /** Source for `${VAR}` / `${?VAR}` substitutions. Defaults to `process.env`. */
  env?: ConfigEnvironment;
}

export interface Config {
  has(key: string): boolean;
  get(key: string): ConfigValue | undefined;
  getString(key: string, defaultValue?: string): string;
  getBoolean(key: string, defaultValue?: boolean): boolean;
  getNumber(key: string, defaultValue?: number): number;
  getPath(key: string, defaultValue?: string): string;
  toObject(): Record<string, ConfigValue>;
}

class ConfigImpl implements Config {
  constructor(
    private readonly values: Map<string, ConfigValue>,
    private readonly configDir: string,
  ) {}

  has(key: string): boolean {
    return this.values.has(key);
  }

  get(key: string): ConfigValue | undefined {
    return this.values.get(key);
  }

  getString(key: string, defaultValue?: string): string {
    const value = this.values.get(key);
    if (value === undefined) {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw new Error(`Missing required config key '${key}'`);
    }
    return String(value);
  }

  getBoolean(key: string, defaultValue?: boolean): boolean {
    const value = this.values.get(key);
    if (value === undefined) {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw new Error(`Missing required config key '${key}'`);
    }

    if (typeof value === "boolean") {
      return value;
    }

    const normalized = String(value).trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }

    throw new Error(
      `Config key '${key}' has value '${String(value)}', expected boolean`,
    );
  }

  getNumber(key: string, defaultValue?: number): number {
    const value = this.values.get(key);
    if (value === undefined) {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw new Error(`Missing required config key '${key}'`);
    }

    if (typeof value === "number") {
      return value;
    }

    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }

    throw new Error(
      `Config key '${key}' has value '${String(value)}', expected number`,
    );
  }

  getPath(key: string, defaultValue?: string): string {
    const value = this.getString(key, defaultValue);
    if (value === "~") {
      return os.homedir();
    }
    if (value.startsWith("~/")) {
      return path.join(os.homedir(), value.slice(2));
    }
    if (path.isAbsolute(value)) {
      return value;
    }
    return path.resolve(this.configDir, value);
  }

  toObject(): Record<string, ConfigValue> {
    return Object.fromEntries(this.values.entries());
  }
}

export class ConfigFactory {
  private static singleton:
    | {
        config: Config;
        resolvedPath: string;
        overrides: Record<string, ConfigValue> | undefined;
      }
    | undefined;

  /**
   * Loads the process-wide config. The first call reads the file; later
   * calls return the same instance. A later call that passes a different
   * path or different overrides throws, because those arguments could not
   * take effect. Call `reset()` first to load a different config.
   */
  static load(configFilePath?: string, options: ConfigLoadOptions = {}): Config {
    const { overrides, env = process.env } = options;
    const existing = ConfigFactory.singleton;
    if (existing) {
      const pathConflict =
        configFilePath !== undefined &&
        resolveExplicitPath(configFilePath) !== existing.resolvedPath;
      const overridesConflict =
        overrides !== undefined &&
        !sameOverrides(overrides, existing.overrides);
      if (pathConflict || overridesConflict) {
        throw new Error(
          `ConfigFactory.load() was called with ${pathConflict ? `path '${configFilePath}'` : "different overrides"}, but config is already loaded from '${existing.resolvedPath}'. Call ConfigFactory.reset() first to load a different config.`,
        );
      }
      return existing.config;
    }

    const resolvedPath = resolveConfigPath(configFilePath);
    const config = readConfig(resolvedPath, overrides, env);
    ConfigFactory.singleton = { config, resolvedPath, overrides };
    return config;
  }

  /**
   * Reads a conf file without touching the process-wide cached config. Use
   * this when several components in one process each have their own conf,
   * e.g. data services started together in tests.
   */
  static fromFile(configFilePath: string, options: ConfigLoadOptions = {}): Config {
    const resolvedPath = resolveExplicitPath(configFilePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Config file not found at '${resolvedPath}'`);
    }
    return readConfig(resolvedPath, options.overrides, options.env ?? process.env);
  }

  // Useful for tests that need to reload config from a different file.
  static reset(): void {
    ConfigFactory.singleton = undefined;
  }
}

function readConfig(
  resolvedPath: string,
  overrides: Record<string, ConfigValue> | undefined,
  env: ConfigEnvironment,
): Config {
  const values = parseConfigFile(resolvedPath, env);
  for (const [key, value] of Object.entries(overrides ?? {})) {
    values.set(key, value);
  }
  return new ConfigImpl(values, path.dirname(resolvedPath));
}

function sameOverrides(
  a: Record<string, ConfigValue>,
  b: Record<string, ConfigValue> | undefined,
): boolean {
  const aKeys = Object.keys(a);
  const bValues = b ?? {};
  return (
    aKeys.length === Object.keys(bValues).length &&
    aKeys.every((key) => bValues[key] === a[key])
  );
}

function resolveExplicitPath(configuredPath: string): string {
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(process.cwd(), configuredPath);
}

function resolveConfigPath(explicitPath?: string): string {
  const configuredPath = explicitPath ?? process.env.VUU_CONFIG_FILE;
  if (configuredPath) {
    const resolved = resolveExplicitPath(configuredPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Config file not found at '${resolved}'`);
    }
    return resolved;
  }

  const appName = process.env.VUU_APP?.trim();
  if (appName) {
    const appConfigPath = findApplicationConfForApp(process.cwd(), appName);
    if (appConfigPath) {
      return appConfigPath;
    }
    throw new Error(
      `Unable to locate application.conf for VUU_APP='${appName}'. Expected '${path.join("packages", appName, "application.conf")}' from '${process.cwd()}', or set VUU_CONFIG_FILE explicitly.`,
    );
  }

  const directPath = path.resolve(process.cwd(), "application.conf");
  if (fs.existsSync(directPath)) {
    return directPath;
  }

  const discovered = findSingleApplicationConf(process.cwd());
  if (discovered) {
    return discovered;
  }

  throw new Error(
    "Unable to locate application.conf. Set VUU_CONFIG_FILE, set VUU_APP, or pass a path to ConfigFactory.load().",
  );
}

function findApplicationConfForApp(
  rootDir: string,
  appName: string,
): string | undefined {
  const candidate = path.join(rootDir, "packages", appName, "application.conf");
  return fs.existsSync(candidate) ? candidate : undefined;
}

function findSingleApplicationConf(rootDir: string): string | undefined {
  const packagesDir = path.join(rootDir, "packages");
  if (!fs.existsSync(packagesDir)) {
    return undefined;
  }

  const matches: string[] = [];
  for (const dirent of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!dirent.isDirectory()) {
      continue;
    }
    const candidate = path.join(packagesDir, dirent.name, "application.conf");
    if (fs.existsSync(candidate)) {
      matches.push(candidate);
    }
  }

  return matches.length === 1 ? matches[0] : undefined;
}

function parseConfigFile(
  filePath: string,
  env: ConfigEnvironment,
): Map<string, ConfigValue> {
  const contents = fs.readFileSync(filePath, "utf-8");
  const values = new Map<string, ConfigValue>();

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = stripInlineComment(trimmed.slice(separatorIndex + 1)).trim();
    const value = resolveValue(key, rawValue, env, filePath);
    if (value !== undefined) {
      values.set(key, value);
    }
  }

  return values;
}

function stripInlineComment(input: string): string {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      escaped = true;
      continue;
    }

    if (!inDoubleQuote && ch === "'") {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (!inSingleQuote && ch === '"') {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (inSingleQuote || inDoubleQuote) {
      continue;
    }

    const prev = i > 0 ? input[i - 1] : " ";
    const prevIsWhitespace = /\s/.test(prev);

    if (ch === "#" && prevIsWhitespace) {
      return input.slice(0, i).trimEnd();
    }

    if (ch === "/" && input[i + 1] === "/" && prevIsWhitespace) {
      return input.slice(0, i).trimEnd();
    }
  }

  return input;
}

type ValueToken =
  | { kind: "quoted"; text: string }
  | { kind: "unquoted"; text: string }
  | { kind: "substitution"; name: string; optional: boolean };

const SUBSTITUTION = /^\$\{(\?)?([A-Za-z_][A-Za-z0-9_.-]*)\}/;

function tokenizeValue(rawValue: string): ValueToken[] {
  const tokens: ValueToken[] = [];
  let unquoted = "";
  const flush = () => {
    if (unquoted) {
      tokens.push({ kind: "unquoted", text: unquoted });
      unquoted = "";
    }
  };

  let i = 0;
  while (i < rawValue.length) {
    const ch = rawValue[i];
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < rawValue.length && rawValue[j] !== ch) {
        j += rawValue[j] === "\\" ? 2 : 1;
      }
      if (j >= rawValue.length) {
        // Unterminated quote: treat the rest literally.
        unquoted += rawValue.slice(i);
        break;
      }
      flush();
      tokens.push({ kind: "quoted", text: parseValue(rawValue.slice(i, j + 1)) as string });
      i = j + 1;
      continue;
    }
    const match = ch === "$" ? SUBSTITUTION.exec(rawValue.slice(i)) : null;
    if (match) {
      flush();
      tokens.push({
        kind: "substitution",
        name: match[2],
        optional: match[1] === "?",
      });
      i += match[0].length;
      continue;
    }
    unquoted += ch;
    i += 1;
  }
  flush();
  return tokens;
}

/**
 * Resolves a raw value, applying HOCON-style substitutions. Returns
 * `undefined` when the whole value is an unset optional substitution, so
 * the line is ignored and any earlier assignment of the key stands.
 */
function resolveValue(
  key: string,
  rawValue: string,
  env: ConfigEnvironment,
  filePath: string,
): ConfigValue | undefined {
  const tokens = tokenizeValue(rawValue);
  if (!tokens.some((token) => token.kind === "substitution")) {
    return parseValue(rawValue);
  }

  const lookup = (token: Extract<ValueToken, { kind: "substitution" }>) => {
    const value = env[token.name];
    if (value === undefined && !token.optional) {
      throw new Error(
        `Config key '${key}' in '${filePath}' requires environment variable '${token.name}', which is not set. Set it, or use \${?${token.name}} to make it optional.`,
      );
    }
    return value;
  };

  if (tokens.length === 1 && tokens[0].kind === "substitution") {
    const value = lookup(tokens[0]);
    return value === undefined ? undefined : parseValue(value);
  }

  // Concatenation: an unset optional substitution contributes nothing.
  const text = tokens
    .map((token) =>
      token.kind === "substitution" ? (lookup(token) ?? "") : token.text,
    )
    .join("");
  return tokens.some((token) => token.kind === "quoted")
    ? text
    : parseValue(text);
}

function parseValue(rawValue: string): ConfigValue {
  if (
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
  ) {
    const quote = rawValue[0];
    const unwrapped = rawValue.slice(1, -1);
    return quote === '"'
      ? unwrapped.replace(/\\"/g, '"').replace(/\\\\/g, "\\")
      : unwrapped.replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  }

  const normalized = rawValue.toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }

  const numeric = Number(rawValue);
  if (!Number.isNaN(numeric) && rawValue !== "") {
    return numeric;
  }

  return rawValue;
}