import {
  ServerMessageBody,
  ServerToClientTableRows,
} from "@vuu-ui/vuu-protocol-types";

export const isSizeOnlyTableMessage = (
  messageBody: ServerMessageBody
): messageBody is ServerToClientTableRows =>
  messageBody.type === "TABLE_ROW" &&
  messageBody.rows.length === 1 &&
  messageBody.rows[0].updateType === "SIZE";

export const tableMessageWithData = (
  messageBody: ServerMessageBody
): messageBody is ServerToClientTableRows =>
  messageBody.type === "TABLE_ROW" &&
  messageBody.rows.length > 0 &&
  !isSizeOnlyTableMessage(messageBody);

export const tableMessageViewport = (messageBody: ServerToClientTableRows) => {
  const [{ viewPortId }] = messageBody.rows;
  return viewPortId;
};
