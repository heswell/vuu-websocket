import { VuuLoginRequest } from "@vuu-ui/vuu-protocol-types";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { VuuUser } from "../../core/auths/VuuUser";

export interface LoginTokenService {
  getToken: (vuuUser: VuuUser) => string;
  login: (msg: VuuLoginRequest) => VuuUser;
}

class LoginTokenServiceImpl implements LoginTokenService {
  #userTokens = new Map<string, VuuUser>();
  #signingKey = randomBytes(32);

  getToken(vuuUser: VuuUser) {
    const payload = Buffer.from(JSON.stringify(vuuUser)).toString("base64url");
    const signature = createHmac("sha256", this.#signingKey)
      .update(payload)
      .digest("base64url");
    const token = `${payload}.${signature}`;
    this.#userTokens.set(token, vuuUser);
    return token;
  }

  login(msg: VuuLoginRequest) {
    if (!this.isValidTokenSignature(msg.token)) {
      throw new Error("Invalid token");
    }

    const vuuUser = this.#userTokens.get(msg.token);
    if (!vuuUser || vuuUser.expiry <= new Date()) {
      throw new Error("Invalid token");
    }
    return vuuUser;
  }

  private isValidTokenSignature(token: string) {
    const [payload, signature, ...rest] = token.split(".");
    if (!payload || !signature || rest.length > 0) {
      return false;
    }

    const expected = createHmac("sha256", this.#signingKey)
      .update(payload)
      .digest();
    const actual = Buffer.from(signature, "base64url");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}

export function LoginTokenService(): LoginTokenService {
  return new LoginTokenServiceImpl();
}
