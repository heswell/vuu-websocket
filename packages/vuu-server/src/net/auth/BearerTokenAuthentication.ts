import { VuuUser } from "../../core/auths/VuuUser";
import { BearerTokenAuthProvider } from "./AuthProvider";
import { AuthenticationError } from "./AuthenticationErrors";

export async function authenticateBearerRequest(
  provider: BearerTokenAuthProvider,
  request: Request,
): Promise<VuuUser> {
  const authorization = request.headers.get("Authorization");
  if (!authorization) {
    throw new AuthenticationError("Authorization header is required");
  }

  try {
    const user = await provider.authenticateBearerToken(
      parseBearerToken(authorization),
    );
    if (user.expiry.getTime() <= Date.now()) {
      throw new Error("Bearer token is expired");
    }
    return user;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    throw new AuthenticationError((error as Error).message);
  }
}

export function parseBearerToken(authorization: string): string {
  const match = /^Bearer:?\s+(.+)$/i.exec(authorization);
  if (!match || !match[1].trim()) {
    throw new AuthenticationError(
      "Authorization header must contain a bearer token",
    );
  }
  return match[1].trim();
}
