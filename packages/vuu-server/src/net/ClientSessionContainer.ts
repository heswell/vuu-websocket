import { VuuUser } from "../core/auths/VuuUser";
import type { ClientSessionId, MessageHandler } from "./ClientConnectionCreator";
import { getLogger } from "@heswell/service-utils";
import { ClientRequestError } from "./ClientRequestError";
import { VuuCloseCode } from "./CloseCodes";

const log = getLogger("vuu.session");

/**
 * What happens when a user logs in with `maxSessionsPerUser` sessions
 * already open. "evict-oldest" (the default) closes the user's oldest
 * session; "reject-new" refuses the login.
 */
export type SessionLimitPolicy = "evict-oldest" | "reject-new";

export const SessionLimitPolicies: readonly SessionLimitPolicy[] = [
  "evict-oldest",
  "reject-new",
];


export class SessionLimitError extends ClientRequestError {
  name = "SessionLimitError";
}

export interface ClientSessionContainer {
  /**
   * The handler for the session. When the session was registered on a
   * different channel, undefined (a session id is only valid on the channel
   * that logged in).
   */
  getHandler: (sessionId: ClientSessionId) => MessageHandler | undefined;
  getSessions: () => ClientSessionId[];
  register: (
    vuuUser: VuuUser,
    sessionId: ClientSessionId,
    messageHandler: MessageHandler,
  ) => void;
  remove: (vuuUser: VuuUser, sessionId: ClientSessionId) => void;
  /**
   * Tears down every session opened on the channel, e.g. when its websocket
   * closes.
   */
  removeChannel: (channelId: string) => void;
  runOnce: () => void;
}

type SessionEntry = {
  handler: MessageHandler;
  id: ClientSessionId;
  user: VuuUser;
};

class ClientSessionContainerImpl implements ClientSessionContainer {
  constructor(
    private maxSessionsPerUser: number,
    private sessionLimitPolicy: SessionLimitPolicy,
  ) {
    if (!Number.isInteger(maxSessionsPerUser) || maxSessionsPerUser < 1) {
      throw new Error(
        `maxSessionsPerUser must be a positive integer, got ${maxSessionsPerUser}`,
      );
    }
    if (!SessionLimitPolicies.includes(sessionLimitPolicy)) {
      throw new Error(
        `sessionLimitPolicy must be one of ${SessionLimitPolicies.join(", ")}, got ${sessionLimitPolicy}`,
      );
    }
    log.debug(
      `create ClientSessionContainer, maxSessionsPerUser ${maxSessionsPerUser}, ${sessionLimitPolicy}`,
    );
  }
  // insertion ordered, oldest first
  private sessionsPerUser: Map<string, Set<string>> = new Map();
  private sessions: Map<string, SessionEntry> = new Map();

  getHandler = ({ sessionId, channelId }: ClientSessionId) => {
    const entry = this.sessions.get(sessionId);
    if (entry === undefined) {
      log.debug(`No handler found for session ${sessionId}`);
    } else if (entry.id.channelId !== channelId) {
      log.warn(
        `session ${sessionId} used on channel ${channelId}, it belongs to another channel`,
      );
    } else {
      return entry.handler;
    }
  };

  getSessions = () => Array.from(this.sessions.values(), ({ id }) => id);

  remove = (vuuUser: VuuUser, { sessionId }: ClientSessionId) => {
    const userKey = vuuUser.name;
    this.sessions.delete(sessionId);
    const set = this.sessionsPerUser.get(userKey);
    if (set) {
      set.delete(sessionId);
      if (set.size === 0) this.sessionsPerUser.delete(userKey);
    }
    log.debug(`removed session ${sessionId} for user ${userKey}`);
  };

  removeChannel = (channelId: string) => {
    for (const { handler, id, user } of Array.from(this.sessions.values())) {
      if (id.channelId === channelId) {
        log.debug(`channel ${channelId} closed, removing session ${id.sessionId}`);
        this.remove(user, id);
        handler.close?.();
      }
    }
  };

  register(
    vuuUser: VuuUser,
    clientSessionId: ClientSessionId,
    messageHandler: MessageHandler,
  ) {
    const { sessionId } = clientSessionId;
    const userKey = vuuUser.name;
    const set = this.sessionsPerUser.get(userKey) ?? new Set<string>();

    if (set.size >= this.maxSessionsPerUser) {
      if (this.sessionLimitPolicy === "reject-new") {
        log.info(
          `login refused for user ${userKey}, ${set.size} session(s) already open (maxSessionsPerUser ${this.maxSessionsPerUser})`,
        );
        throw new SessionLimitError(
          `maximum sessions (${this.maxSessionsPerUser}) reached for user ${userKey}`,
        );
      }
      for (const oldest of Array.from(set)) {
        if (set.size < this.maxSessionsPerUser) break;
        this.evict(oldest);
      }
    }

    this.sessions.set(sessionId, {
      handler: messageHandler,
      id: clientSessionId,
      user: vuuUser,
    });
    set.add(sessionId);
    this.sessionsPerUser.set(userKey, set);
    log.debug(`register session ${sessionId} for user ${userKey}`);
  }

  private evict(sessionId: string) {
    const entry = this.sessions.get(sessionId);
    if (entry) {
      const { handler, id, user } = entry;
      log.info(
        `evicting session ${sessionId} of user ${user.name}, new login exceeds maxSessionsPerUser ${this.maxSessionsPerUser}`,
      );
      this.remove(user, id);
      handler.close?.(
        VuuCloseCode.SessionEvicted,
        "session evicted: user logged in again",
      );
    }
  }

  runOnce() {
    this.sessions.forEach(({ handler }) => {
      handler.sendUpdates();
    });
  }
}

export function ClientSessionContainer(
  maxSessionsPerUser = 1,
  sessionLimitPolicy: SessionLimitPolicy = "evict-oldest",
): ClientSessionContainer {
  return new ClientSessionContainerImpl(maxSessionsPerUser, sessionLimitPolicy);
}
