import { uuid } from "@vuu-ui/vuu-utils";

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
