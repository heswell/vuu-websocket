/**
 * One client session's outbound counters, from `VuuServerCore.getSessionStats`.
 * Counters are cumulative since the session logged in; read them periodically
 * and take differences for rates.
 */
export interface SessionStats {
  readonly sessionId: string;
  readonly channelId: string;
  /** The user's name. */
  readonly user: string;
  /** When the session logged in, epoch ms. */
  readonly connectedAt: number;
  /** Row updates waiting to be sent now. */
  readonly queueLength: number;
  /** Row and size updates queued for the session. */
  readonly rowsQueued: number;
  /**
   * Updates merged into one already waiting for the same viewport row, so
   * never sent on their own (included in rowsQueued).
   */
  readonly rowsCoalesced: number;
  /** Row updates sent to the client. */
  readonly rowsSent: number;
  /**
   * Updates taken off the queue but not sent, because the row had left the
   * viewport's range or the viewport had changed.
   */
  readonly rowsDropped: number;
  /** TABLE_ROW messages sent. */
  readonly messagesSent: number;
  /** Length of the JSON of the TABLE_ROW messages sent (UTF-16 code units). */
  readonly charsSent: number;
  readonly heartbeatsSent: number;
}

/** What one session send cycle did, see `VuuServerCore.onSendCycle`. */
export interface SendCycleStats {
  /** When the cycle started, `performance.now()`. */
  readonly startTime: number;
  /** How long sending to every session took, ms. */
  readonly durationMs: number;
  /** Sessions the cycle visited. */
  readonly sessions: number;
  readonly rowsSent: number;
  readonly messagesSent: number;
  readonly charsSent: number;
}

export type SendCycleListener = (cycle: SendCycleStats) => void;

/** Mutable totals a send cycle adds each session's sends to. */
export interface SendCycleTotals {
  sessions: number;
  rowsSent: number;
  messagesSent: number;
  charsSent: number;
}

export const SendCycleTotals = (): SendCycleTotals => ({
  sessions: 0,
  rowsSent: 0,
  messagesSent: 0,
  charsSent: 0,
});
