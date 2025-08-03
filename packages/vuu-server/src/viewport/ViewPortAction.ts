import { VuuTable } from "@vuu-ui/vuu-protocol-types";

export class ViewPortAction {}

export class NoAction extends ViewPortAction {}

export class OpenDialogViewPortAction extends ViewPortAction {
  constructor(public table: VuuTable, public renderComponent: string = "grid") {
    super();
  }
}
