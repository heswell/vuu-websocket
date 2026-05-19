import { uuid } from "@vuu-ui/vuu-utils";

let _requestId = 1;

export const RequestId = {
  oneNew() {
    return `REQ-${_requestId++}`;
  },
};
export const SessionId = {
  oneNew() {
    return `SESS-${uuid()}`;
  },
};

export const ViewPortId = {
  oneNew() {
    return `VP-${uuid()}`;
  },
};
