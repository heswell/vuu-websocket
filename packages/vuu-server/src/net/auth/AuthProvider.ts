import { VuuUser } from "../../core/auths/VuuUser";
import { VuuUserWithAuthorizations } from "../../core/auths/VuuUser";

export interface CredentialAuthProvider {
  authenticate: (username: string, password: string) => Promise<VuuUser>;
}

export interface BearerTokenAuthProvider {
  authenticateBearerToken: (token: string) => Promise<VuuUser>;
}

export interface AuthenticationProviders {
  bearerToken?: BearerTokenAuthProvider;
  credentials?: CredentialAuthProvider;
}

/**
 * Compatibility type for consumers that provide both authentication methods.
 */
export interface AuthProvider extends CredentialAuthProvider {
  authenticateBearerToken?: BearerTokenAuthProvider["authenticateBearerToken"];
}

export class PermissiveAuthProvider implements CredentialAuthProvider {
  constructor(private users: Array<[string, string]> = []) { }

  async authenticate(username: string, password: string): Promise<VuuUser> {
    if (!username || !password) {
      throw new Error("username and password are required");
    }

    if (
      this.users.length > 0 &&
      !this.users.find(([u, p]) => u === username && p === password)
    ) {
      throw new Error(`unknown user '${username}'`);
    }

    return VuuUserWithAuthorizations(username, []);
  }
}
