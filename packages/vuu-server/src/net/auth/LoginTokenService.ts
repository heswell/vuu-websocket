import { VuuLoginRequest } from "@vuu-ui/vuu-protocol-types";
import { VuuUser } from "../../core/auths/VuuUser";

export interface LoginTokenService {
  getToken: () => string;
  login: (msg: VuuLoginRequest) => VuuUser;
}

class LoginTokenServiceImpl implements LoginTokenService {
  constructor() {}

  getToken() {
    return "token";
  }

  login(msg: VuuLoginRequest) {
    console.log(`[LoginTokenService] login ${JSON.stringify(msg)}`);
    return VuuUser("steve");
  }
}

export function LoginTokenService(): LoginTokenService {
  return new LoginTokenServiceImpl();
}
