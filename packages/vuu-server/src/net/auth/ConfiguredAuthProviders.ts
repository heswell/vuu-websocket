import type { Config } from "../../util/ConfigFactory";
import {
  type AuthenticationProviders,
  PermissiveAuthProvider,
} from "./AuthProvider";
import { KeycloakAuthProvider } from "./KeycloakAuthProvider";

const AuthConfigKeys = {
  mode: "vuu.auth.mode",
  permissiveUsers: "vuu.auth.permissive.users",
} as const;

/**
 * The effective auth mode: `vuu.auth.mode`, else the VUU_AUTH_MODE env var,
 * else "keycloak". Always lower case.
 */
export function getConfiguredAuthMode(config: Config): string {
  return config
    .getString(AuthConfigKeys.mode, process.env.VUU_AUTH_MODE ?? "keycloak")
    .toLowerCase();
}

export function createConfiguredAuthProviders(
  config: Config,
): AuthenticationProviders {
  const mode = getConfiguredAuthMode(config);

  if (mode === "permissive") {
    return {
      credentials: new PermissiveAuthProvider(
        parsePermissiveUsers(
          config.getString(AuthConfigKeys.permissiveUsers, ""),
        ),
      ),
    };
  }

  if (mode === "keycloak") {
    return { bearerToken: new KeycloakAuthProvider(config) };
  }

  throw new Error(
    `Unsupported VUU_AUTH_MODE '${mode}'. Expected 'keycloak' or 'permissive'.`,
  );
}

/**
 * Parses `vuu.auth.permissive.users`: comma-separated `username:password`
 * entries, or a bare `username` for a user that may use any password.
 */
export function parsePermissiveUsers(value: string): Array<[string, string?]> {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  return trimmed
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf(":");
      const username = (
        separator === -1 ? entry : entry.slice(0, separator)
      ).trim();
      const password =
        separator === -1 ? "" : entry.slice(separator + 1).trim();
      if (!username) {
        throw new Error(
          "Invalid vuu.auth.permissive.users entry. Expected 'username' or 'username:password'.",
        );
      }
      return password ? [username, password] : [username];
    });
}
