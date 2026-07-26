const ONE_MINUTE = 60_000;

export interface VuuUser {
  name: string;
  expiry: Date;
  authorizations: string[];
}
class VuuUserImpl implements VuuUser {
  constructor(
    public name: string,
    public expiry: Date,
    public authorizations: string[]
  ) {}
}

export const VuuUser = (username: string): VuuUser => {
  const now = Date.now();
  return new VuuUserImpl(username, new Date(now + ONE_MINUTE), []);
};

export const VuuUserWithAuthorizations = (
  username: string,
  authorizations: string[] = [],
  expiry?: Date,
): VuuUser => {
  const now = Date.now();
  return new VuuUserImpl(
    username,
    expiry ?? new Date(now + ONE_MINUTE),
    authorizations,
  );
};
