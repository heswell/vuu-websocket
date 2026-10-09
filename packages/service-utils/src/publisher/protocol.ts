import type { VuuDataRow } from "@vuu-ui/vuu-protocol-types";

/**
 * Wire protocol shared by all data services (publishers) and their consumers.
 *
 * Client -> Server
 *   subscribe   snapshot of the resource followed by live (conflated) updates
 *   snapshot    snapshot only
 *   unsubscribe stop receiving updates for the resource
 *   HB          heartbeat response
 *
 * Server -> Client
 *   snapshot-batch  a batch of snapshot rows, values ordered as requested columns
 *   snapshot-count  end of snapshot, total row count
 *   updates         inserted or updated rows (upsert semantics), conflated by key
 *   deletes         keys of deleted rows
 *   HB              heartbeat, client must respond before the next one is sent
 *   error           request could not be honoured
 */

export type SubscriptionMode = "subscribe" | "snapshot";

export interface ResourceRequest {
  columns?: string[];
  resource: string;
  /** "subscription" is accepted as a legacy alias of "subscribe" */
  type: SubscriptionMode | "subscription" | "unsubscribe";
}

export interface HeartbeatMessage {
  type: "HB";
  ts: number;
}

export type ClientMessage = ResourceRequest | HeartbeatMessage;

export interface SnapshotBatch {
  isLast: boolean;
  resource?: string;
  rows: VuuDataRow[];
  type: "snapshot-batch";
}

export interface SnapshotCount {
  count: number;
  resource?: string;
  type: "snapshot-count";
}

export interface UpdatesMessage {
  resource: string;
  rows: VuuDataRow[];
  type: "updates";
}

export interface DeletesMessage {
  keys: string[];
  resource: string;
  type: "deletes";
}

export interface ErrorMessage {
  message: string;
  resource?: string;
  type: "error";
}

/** @deprecated single row messages, superseded by UpdatesMessage */
export interface Upsert {
  resource: string;
  row: VuuDataRow;
  type: "insert" | "update";
}

export type ServerMessage =
  | SnapshotBatch
  | SnapshotCount
  | UpdatesMessage
  | DeletesMessage
  | HeartbeatMessage
  | ErrorMessage;

export type ResourceMessage =
  | SnapshotCount
  | SnapshotBatch
  | UpdatesMessage
  | DeletesMessage
  | Upsert;

export const isSubscribeRequest = (type: string) =>
  type === "subscribe" || type === "subscription";
