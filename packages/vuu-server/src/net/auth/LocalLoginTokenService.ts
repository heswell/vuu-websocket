import type { VuuLoginRequest } from "@vuu-ui/vuu-protocol-types";
import { type VuuUser, VuuUserWithAuthorizations } from "../../core/auths/VuuUser";
import type { LoginTokenService } from "./LoginTokenService";

const ONE_DAY = 24 * 60 * 60 * 1000;

export interface LocalLoginTokenServiceOptions {
  /**
   * Log in a request whose token was not issued by `getToken`, as `userName`.
   * Default true, which suits a server running in the same page as its
   * client (test or demo data). Set false to accept only issued tokens.
   */
  acceptUnknownTokens?: boolean;
  /** Authorizations given to users logged in with an unknown token. */
  authorizations?: string[];
  /** Name of users logged in with an unknown token, default "local-user". */
  userName?: string;
}

/**
 * A LoginTokenService with no Node dependencies, for an in-process or
 * in-browser server. Tokens are random ids, not signed. It does no real
 * authentication, so never use it for a server reachable over a network.
 */
export function LocalLoginTokenService({
  acceptUnknownTokens = true,
  authorizations = [],
  userName = "local-user",
}: LocalLoginTokenServiceOptions = {}): LoginTokenService {
  const userTokens = new Map<string, VuuUser>();

  return {
    getToken(vuuUser: VuuUser) {
      const token = crypto.randomUUID();
      userTokens.set(token, vuuUser);
      return token;
    },

    login({ token }: VuuLoginRequest) {
      const issuedUser = userTokens.get(token);
      if (issuedUser) {
        if (issuedUser.expiry <= new Date()) {
          throw new Error("Invalid token");
        }
        return issuedUser;
      }
      if (acceptUnknownTokens) {
        return VuuUserWithAuthorizations(
          userName,
          authorizations,
          new Date(Date.now() + ONE_DAY),
        );
      }
      throw new Error("Invalid token");
    },
  };
}
