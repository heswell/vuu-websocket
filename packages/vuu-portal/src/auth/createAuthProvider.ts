import {
  AuthenticationProviders,
  Config,
  PermissiveAuthProvider,
} from "@heswell/vuu-server";
import { KeycloakAuthProvider } from "@heswell/vuu-server";

const AuthConfigKeys = {
  mode: "vuu.auth.mode",
  permissiveUsers: "vuu.auth.permissive.users",
} as const;

export function createAuthProvider(config: Config): AuthenticationProviders {
  const mode = config
    .getString(AuthConfigKeys.mode, process.env.VUU_AUTH_MODE ?? "keycloak")
    .toLowerCase();

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

function parsePermissiveUsers(value: string): Array<[string, string]> {
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
      if (separator <= 0 || separator >= entry.length - 1) {
        throw new Error(
          `Invalid vuu.auth.permissive.users entry '${entry}'. Expected 'username:password'.`,
        );
      }

      const username = entry.slice(0, separator).trim();
      const password = entry.slice(separator + 1).trim();
      if (!username || !password) {
        throw new Error(
          `Invalid vuu.auth.permissive.users entry '${entry}'. Username and password are required.`,
        );
      }

      return [username, password] as [string, string];
    });
}
