import { VuuUser } from "../core/auths/VuuUser";
import { ClientSessionId, MessageHandler } from "./ClientConnectionCreator";

export interface ClientSessionContainer {
  getHandler: (sessionId: ClientSessionId) => MessageHandler | undefined;
  getSessions: () => ClientSessionId[];
  register: (
    vuuUser: VuuUser,
    sessionId: ClientSessionId,
    messageHandler: MessageHandler,
  ) => void;
  remove: (vuuUser: VuuUser, sessionId: ClientSessionId) => void;
}

class ClientSessionContainerImpl implements ClientSessionContainer {
  constructor(private maxSessionsPerUser: number) {
    console.log(`[ClientSessionContainer] constructor`);
  }
  private sessionsPerUser: Map<string, Set<string>> = new Map();
  private sessions: Map<string, MessageHandler> = new Map();
  private sessionIds: Map<string, ClientSessionId> = new Map();

  getHandler = ({ sessionId }: ClientSessionId) => {
    const handler = this.sessions.get(sessionId);
    if (handler) {
      return handler;
    }
    console.log(
      `[ClientSessionContainer] No handler found for session ${sessionId}`,
    );
  };

  getSessions = () => Array.from(this.sessionIds.values());

  remove = (vuuUser: VuuUser, { sessionId }: ClientSessionId) => {
    const userKey = vuuUser.name;
    if (this.sessions.has(sessionId)) {
      this.sessions.delete(sessionId);
      this.sessionIds.delete(sessionId);
    }
    const set = this.sessionsPerUser.get(userKey);
    if (set) {
      set.delete(sessionId);
      if (set.size === 0) this.sessionsPerUser.delete(userKey);
    }
    console.log(
      `[ClientSessionContainer] removed session ${sessionId} for user ${userKey}`,
    );
  };
  register(
    vuuUser: VuuUser,
    clientSessionId: ClientSessionId,
    messageHandler: MessageHandler,
  ) {
    console.log(
      `[ClientSessionContainer] register handler for session ${clientSessionId}`,
    );

    const { sessionId } = clientSessionId;
    const userKey = vuuUser.name;
    let set = this.sessionsPerUser.get(userKey);
    if (!set) {
      set = new Set<string>();
      this.sessionsPerUser.set(userKey, set);
    }

    // If exceeding max sessions per user, remove oldest
    if (set.size >= this.maxSessionsPerUser) {
      const oldest = set.values().next().value as string;
      if (oldest) {
        const clientSessionId = this.sessionIds.get(oldest);
        if (clientSessionId) {
          this.remove(vuuUser, clientSessionId);
        }
      }
    }

    this.sessions.set(sessionId, messageHandler);
    this.sessionIds.set(sessionId, clientSessionId);

    set.add(sessionId);
    console.log(
      `[ClientSessionContainer] register session ${sessionId} for user ${userKey}`,
    );
  }
}

export function ClientSessionContainer(
  maxSessionsPerUser = 1,
): ClientSessionContainer {
  return new ClientSessionContainerImpl(maxSessionsPerUser);
}
