import fs from "node:fs";
import path from "node:path";

type ConfigValue = string | number | boolean;

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
    if (path.isAbsolute(value)) {
      throw new Error(
        `Config key '${key}' has value '${value}', expected a relative path`,
      );
    }

    return path.resolve(this.configDir, value);
  }

  toObject(): Record<string, ConfigValue> {
    return Object.fromEntries(this.values.entries());
  }
}

export class ConfigFactory {
  private static singleton: Config | undefined;

  static load(configFilePath?: string): Config {
    if (ConfigFactory.singleton) {
      return ConfigFactory.singleton;
    }

    const resolvedPath = resolveConfigPath(configFilePath);
    const parsedConfig = parseConfigFile(resolvedPath);

    ConfigFactory.singleton = new ConfigImpl(
      parsedConfig,
      path.dirname(resolvedPath),
    );
    return ConfigFactory.singleton;
  }

  // Useful for tests that need to reload config from a different file.
  static reset(): void {
    ConfigFactory.singleton = undefined;
  }
}

function resolveConfigPath(explicitPath?: string): string {
  const configuredPath = explicitPath ?? process.env.VUU_CONFIG_FILE;
  if (configuredPath) {
    const resolved = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(process.cwd(), configuredPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Config file not found at '${resolved}'`);
    }
    return resolved;
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
    "Unable to locate application.conf. Set VUU_CONFIG_FILE or pass a path to ConfigFactory.load().",
  );
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

function parseConfigFile(filePath: string): Map<string, ConfigValue> {
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
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    values.set(key, parseValue(rawValue));
  }

  return values;
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