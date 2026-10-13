/** WebSocket close codes used by the server when it closes a channel. */
export const VuuCloseCode = {
  /** The user logged in again and this (oldest) session was evicted. */
  SessionEvicted: 4001,
  /** A message referenced a session that does not exist on this channel. */
  InvalidSession: 4002,
  /** Login refused, the user already has maxSessionsPerUser sessions. */
  SessionLimitReached: 4003,
  /** Login refused, e.g. an invalid or expired token. */
  LoginFailed: 4004,
  /** No message received from the client within the heartbeat timeout. */
  HeartbeatTimeout: 4005,
} as const;
