# Requirement: Support `GET_TABLE_LIST` in `vuu-server`

## Background

`CoreServerApiHandler` in `packages/vuu-server` currently has `GET_TABLE_LIST` handling commented out.  
As a result, metadata clients cannot request the available table list through the core websocket API.

This implementation should follow the Scala server behavior as closely as practical:
- Scala reference: `vuu/src/main/scala/org/finos/vuu/core/CoreServerApiHandler.scala`

Protocol shapes must follow the source protocol definitions in `finos/vuu`:
- `vuu-ui/packages/vuu-protocol-types/index.d.ts`
- request: `VuuTableListRequest` (`type: "GET_TABLE_LIST"`)
- response: `VuuTableListResponse` (`type: "TABLE_LIST_RESP"`, `tables: VuuTable[]`)

## Functional Requirements

1. The server must accept client message body type `GET_TABLE_LIST` in `CoreServerApiHandler.process`.
2. On success, the server must return a core message body with:
   - `type: "TABLE_LIST_RESP"`
   - `tables`: list returned from `tableContainer.getDefinedTables()`
3. Response message envelope must preserve current core conventions:
   - `requestId` from request context
   - `sessionId` from request context
   - `module: "CORE"`
4. On failure while resolving tables, the server must return an error body:
   - `type: "ERROR"`
   - `msg: "Failed to process request <requestId>"`

## Non-Functional Requirements

1. Keep changes scoped to core API handler/message construction and directly related tests/docs.
2. Preserve existing behavior for all other message types.
3. Keep TypeScript implementation style aligned with current codebase patterns while preserving Scala intent.

## Scala Parity Notes

Target parity with Scala flow for `GetTableList`:
- fetch defined tables from table container
- return table list response on success
- return generic request error response on failure

Differences allowed:
- idiomatic TypeScript control flow and typing
- existing TypeScript message helper structure

## Acceptance Criteria

1. Sending `GET_TABLE_LIST` produces a `TABLE_LIST_RESP` payload containing all currently defined tables.
2. If table enumeration throws, response is an `ERROR` with the request-specific failure message.
3. Focused automated tests cover both success and failure paths.
4. No regressions in existing message handling behavior.
