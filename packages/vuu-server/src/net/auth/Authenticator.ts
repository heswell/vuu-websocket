import { VuuUser } from "../../core/auths/VuuUser";
import { LoginTokenService } from "../LoginTokenService";

type AuthSuccess = {
  type: "AUTH_SUCCESS";
  vuuUser: VuuUser;
};

type AuthFail = {
  type: "AUTH_FAIL";
  reason: string;
};

const isAuthSuccess = (
  authResult: AuthSuccess | AuthFail
): authResult is AuthSuccess => authResult.type === "AUTH_SUCCESS";

export type AuthFunction = (input: unknown) => AuthSuccess | AuthFail;

/**
 * An authenticator that calls an auth function abd returns a valid token if it succeeds
 */
export class Authenticator {
  constructor(
    protected tokenService: LoginTokenService,
    private authFunction: AuthFunction
  ) {}

  authenticate(input: [string, string] | "string") {
    const authResult = this.authFunction(input);
    if (isAuthSuccess(authResult)) {
      return this.tokenService.getToken(authResult.vuuUser);
    } else {
      return "Authentication failed";
    }
  }
}
