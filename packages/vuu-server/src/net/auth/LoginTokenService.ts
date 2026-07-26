import { VuuLoginRequest } from "@vuu-ui/vuu-protocol-types";
import { uuid } from "@vuu-ui/vuu-utils";
import { VuuUser } from "../../core/auths/VuuUser";

export interface LoginTokenService {
  getToken: (vuuUser: VuuUser) => string;
  login: (msg: VuuLoginRequest) => VuuUser;
}

class LoginTokenServiceImpl implements LoginTokenService {
  #userTokens = new Map<string, VuuUser>();

  getToken(vuuUser: VuuUser) {
    const token = `${btoa(JSON.stringify(vuuUser))}.${uuid()}`;
    this.#userTokens.set(token, vuuUser);
    return token;
  }

  login(msg: VuuLoginRequest) {
    const vuuUser = this.#userTokens.get(msg.token);
    if (!vuuUser) {
      throw new Error("Invalid token");
    }
    return vuuUser;
  }
}

export function LoginTokenService(): LoginTokenService {
  return new LoginTokenServiceImpl();
}
