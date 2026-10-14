/**
 * A client request was refused because it is invalid for the requesting
 * session (unknown table, a viewport owned by another session, ...). This is
 * a client error, not a server fault: it is logged at warn without a stack
 * trace and `reason` is safe to return to the client.
 */
export class ClientRequestError extends Error {
  name = "ClientRequestError";
  constructor(
    message: string,
    /** Client-safe description of the refusal. */
    readonly reason: string = message,
  ) {
    super(message);
  }
}

export class TableNotFoundError extends ClientRequestError {
  name = "TableNotFoundError";
  constructor(
    readonly tableName: string,
    source = "TableContainer",
  ) {
    super(`[${source}] no table ${tableName}`, `table not found ${tableName}`);
  }
}

export class ViewportNotFoundError extends ClientRequestError {
  name = "ViewportNotFoundError";
  constructor(readonly viewportId: string) {
    super(
      `[ViewportContainer] viewport not found ${viewportId}`,
      `viewport not found ${viewportId}`,
    );
  }
}

export const isClientRequestError = (
  error: unknown,
): error is ClientRequestError => error instanceof ClientRequestError;

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
