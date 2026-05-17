import { VuuUser } from "../../core/auths/VuuUser";
import { LoginTokenService } from "../LoginTokenService";
import { Authenticator, AuthFunction } from "./Authenticator";

export class AuthenticatorWithUserList extends Authenticator {
  constructor(
    tokenService: LoginTokenService,
    private users: Array<[string, string]>,
  ) {
    super(tokenService, (input: unknown) =>
      this.authenticateFromUserList(input),
    );
  }

  private authenticateFromUserList: AuthFunction = (input: unknown) => {
    if (Array.isArray(input) && input.length === 2) {
      const [username, password] = input;
      if (this.users.length === 0) {
        return {
          type: "AUTH_SUCCESS",
          vuuUser: VuuUser(username),
        };
      } else if (
        this.users.find(([u, p]) => u === username && p === password)
      ) {
        return {
          type: "AUTH_SUCCESS",
          vuuUser: VuuUser(username),
        };
      } else {
        return { type: "AUTH_FAIL", reason: `unknown user '${username}'` };
      }
    } else {
      throw Error(
        "[AuthenticatorWithUserList] authenticateFromUserList invalid input",
      );
    }
  };
}
