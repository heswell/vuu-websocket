import { VuuUser } from "../../core/auths/VuuUser";
import { VuuUserWithAuthorizations } from "../../core/auths/VuuUser";

export interface AuthnProvider {
  authenticate: (username: string, password: string) => Promise<VuuUser>;
}

export class PermissiveAuthnProvider implements AuthnProvider {
  constructor(private users: Array<[string, string]> = []) {}

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
