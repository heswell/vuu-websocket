import { VuuTable } from "@vuu-ui/vuu-protocol-types";
import { type RenderComponent } from "./RenderComponent";

export interface ViewPortAction {}

export const NoAction = (): ViewPortAction => ({
  type: "NO_ACTION",
});

export interface OpenDialogViewPortAction extends ViewPortAction {
  renderComponent: RenderComponent | string;
  table: VuuTable;
  type: "OPEN_DIALOG_ACTION";
}
export const OpenDialogViewPortAction = (
  table: VuuTable,
  renderComponent: OpenDialogViewPortAction["renderComponent"]
): OpenDialogViewPortAction => ({
  type: "OPEN_DIALOG_ACTION",
  table,
  renderComponent,
});
