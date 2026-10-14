import type { Config } from "../../util/ConfigFactory";

export const CorsConfigKeys = {
  allowedOrigin: "vuu.auth.cors.allowedOrigin",
  allowedOrigins: "vuu.auth.cors.allowedOrigins",
} as const;

export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  "http://localhost:5002",
];

export const WILDCARD_ORIGIN = "*";

/**
 * Parses a list of allowed browser origins. Accepts an array, a HOCON-style
 * list string (`["http://a:1", "http://b:2"]`) or a comma-separated string
 * (`http://a:1,http://b:2`). Each origin is normalised (`new URL().origin`,
 * so a trailing slash or default port is dropped). `"*"` is kept as is.
 * Throws on anything that is not an origin (a path, query, or bare host).
 */
export function parseAllowedOrigins(
  value: string | readonly string[] | undefined,
): string[] {
  if (value === undefined) {
    return [];
  }
  const entries = Array.isArray(value) ? value : splitOriginList(value as string);
  const origins: string[] = [];
  for (const entry of entries) {
    const origin = normaliseOrigin(entry);
    if (origin && !origins.includes(origin)) {
      origins.push(origin);
    }
  }
  return origins;
}

function splitOriginList(value: string): string[] {
  let text = value.trim();
  if (text.startsWith("[") && text.endsWith("]")) {
    text = text.slice(1, -1);
  }
  return text.split(",").map(unquote);
}

function unquote(value: string) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    (trimmed[0] === '"' || trimmed[0] === "'") &&
    trimmed.endsWith(trimmed[0])
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function normaliseOrigin(entry: string): string | undefined {
  const value = entry.trim();
  if (!value) {
    return undefined;
  }
  if (value === WILDCARD_ORIGIN) {
    return WILDCARD_ORIGIN;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      `Invalid CORS allowed origin '${value}'. Expected scheme://host[:port] or "*".`,
    );
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.pathname !== "/" ||
    /[?#]/.test(value) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      `Invalid CORS allowed origin '${value}'. Expected scheme://host[:port] or "*", without a path, query or fragment.`,
    );
  }
  return url.origin;
}

/**
 * The effective allowed origins: `vuu.auth.cors.allowedOrigins` merged with
 * the legacy `vuu.auth.cors.allowedOrigin` (both accept a list or a
 * comma-separated string), else `http://localhost:5002`. `"*"` is only
 * accepted with permissive auth.
 */
export function getConfiguredAllowedOrigins(
  config: Config,
  authMode: string,
): string[] {
  const configured = [
    ...parseAllowedOrigins(readOptionalString(config, CorsConfigKeys.allowedOrigins)),
    ...parseAllowedOrigins(readOptionalString(config, CorsConfigKeys.allowedOrigin)),
  ];
  const origins =
    configured.length === 0
      ? [...DEFAULT_ALLOWED_ORIGINS]
      : configured.filter((origin, i) => configured.indexOf(origin) === i);

  if (
    origins.includes(WILDCARD_ORIGIN) &&
    authMode.toLowerCase() !== "permissive"
  ) {
    throw new Error(
      `CORS allowed origin "*" is only allowed with vuu.auth.mode="permissive". List the allowed origins in ${CorsConfigKeys.allowedOrigins} instead.`,
    );
  }
  return origins;
}

function readOptionalString(config: Config, key: string) {
  return config.has(key) ? config.getString(key) : undefined;
}

/**
 * The CORS response headers for a request. A matching request `Origin` is
 * echoed back (never the whole list) with `Access-Control-Allow-Credentials`
 * and `Vary: Origin`. With `"*"` the response is `Access-Control-Allow-Origin: *`
 * and never allows credentials.
 */
export function createCorsHeaders(
  req: Request,
  allowedOrigins: string | readonly string[],
): Record<string, string> {
  const origins =
    typeof allowedOrigins === "string"
      ? parseAllowedOrigins(allowedOrigins)
      : allowedOrigins;
  const wildcard = origins.includes(WILDCARD_ORIGIN);
  const requestOrigin = req.headers.get("Origin");
  const allowed = !wildcard && isOriginAllowed(requestOrigin, origins);

  return {
    ...(wildcard ? { "Access-Control-Allow-Origin": WILDCARD_ORIGIN } : {}),
    ...(allowed && requestOrigin
      ? {
          "Access-Control-Allow-Origin": requestOrigin,
          "Access-Control-Allow-Credentials": "true",
        }
      : {}),
    ...(wildcard ? {} : { Vary: "Origin" }),
    "Access-Control-Expose-Headers": "vuu-auth-token",
    "Cache-Control": "no-cache, no-store, max-age=0, must-revalidate",
  };
}

export function isOriginAllowed(
  requestOrigin: string | null,
  allowedOrigins: readonly string[],
) {
  if (!requestOrigin) {
    return false;
  }
  return (
    allowedOrigins.includes(WILDCARD_ORIGIN) ||
    allowedOrigins.includes(requestOrigin)
  );
}
