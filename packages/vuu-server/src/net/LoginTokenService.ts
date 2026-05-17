import { VuuLoginRequest } from "@vuu-ui/vuu-protocol-types";
import { uuid } from "@vuu-ui/vuu-utils";
import { VuuUser } from "../core/auths/VuuUser";

const INVALID_TOKEN_MESSAGE = "Invalid token";
const TOKEN_EXPIRED_MESSAGE = "Token has expired";

export const isTokenErrorMessage = (message: unknown): message is string =>
  (typeof message === "string" && message === TOKEN_EXPIRED_MESSAGE) ||
  message === INVALID_TOKEN_MESSAGE;

export interface LoginTokenService {
  getToken: (input: VuuUser) => string;
  login: (msg: VuuLoginRequest) => VuuUser | string;
}

export class LoginTokenServiceImpl implements LoginTokenService {
  static #instance: LoginTokenService;

  #userTokens = new Map<string, VuuUser>();

  public static get instance(): LoginTokenService {
    if (!LoginTokenServiceImpl.#instance) {
      LoginTokenServiceImpl.#instance = new LoginTokenServiceImpl();
    }
    return LoginTokenServiceImpl.#instance;
  }

  private constructor() {}
  getToken(vuuUser: VuuUser) {
    const token = `${btoa(JSON.stringify(vuuUser))}.${uuid()}`;
    this.#userTokens.set(token, vuuUser);
    console.log(
      `[LoginTokenService] token issues for user ${vuuUser.name} : ${token}`,
    );
    return token;
  }

  login(msg: VuuLoginRequest): VuuUser | string {
    const vuuUser = this.#userTokens.get(msg.token);
    if (vuuUser) {
      return vuuUser;
    } else {
      console.warn(`[LoginTokenService]: Invalid token ${msg.token}`);
      return INVALID_TOKEN_MESSAGE;
    }
  }
}

export default LoginTokenServiceImpl.instance;
