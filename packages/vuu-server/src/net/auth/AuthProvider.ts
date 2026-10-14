import { VuuUser } from "../../core/auths/VuuUser";
import { VuuUserWithAuthorizations } from "../../core/auths/VuuUser";

export interface CredentialAuthProvider {
  /**
   * When true the auth endpoint passes an empty or missing password through
   * to `authenticate` (as `""`). Otherwise it is rejected with 401 first.
   */
  readonly allowsEmptyPassword?: boolean;
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

/**
 * Development-only credentials. With no users configured any username is
 * accepted with any password, including an empty or missing one. With users
 * configured only those users are accepted; a user listed with a password
 * must supply it, a user listed without one (`"bob"`) may use any password.
 */
export class PermissiveAuthProvider implements CredentialAuthProvider {
  readonly allowsEmptyPassword = true;

  constructor(private users: Array<[string, string?]> = []) {}

  async authenticate(username: string, password = ""): Promise<VuuUser> {
    if (!username) {
      throw new Error("username is required");
    }

    if (this.users.length > 0) {
      const user = this.users.find(([u]) => u === username);
      if (!user) {
        throw new Error("unknown user");
      }
      const [, expectedPassword] = user;
      if (expectedPassword && expectedPassword !== password) {
        throw new Error("invalid credentials");
      }
    }

    return VuuUserWithAuthorizations(username, []);
  }
}
