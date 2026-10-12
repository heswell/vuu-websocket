import type {
  CloseDialogAction,
  NoAction as VuuNoAction,
  OpenDialogAction,
  ShowNotificationAction,
  VuuRpcMenuAction,
  VuuTable,
} from "@vuu-ui/vuu-protocol-types";
import { type RenderComponent } from "./RenderComponent";

/**
 * The action returned by a menu item handler. It is sent to the client as
 * the `action` of a `VIEW_PORT_MENU_RESP`, so it is exactly the protocol's
 * `VuuRpcMenuAction`.
 */
export type ViewPortAction = VuuRpcMenuAction;

/** The client does nothing further. */
export const NoAction = (): VuuNoAction => ({
  type: "NO_ACTION",
});

/** The client shows a toast notification. */
export const ShowNotification = (
  message: string,
  title?: string,
): ShowNotificationAction =>
  title === undefined
    ? { type: "SHOW_NOTIFICATION_ACTION", message }
    : { type: "SHOW_NOTIFICATION_ACTION", message, title };

export interface OpenDialogViewPortAction extends OpenDialogAction {
  renderComponent: RenderComponent | string;
}

/**
 * The client opens `table` in a dialog. For a session table, `"grid"` and
 * `"inline-form"` open the built-in session editing UI; any other value
 * names a registered vuu-ui component. Defaults to `"grid"`, as in Scala Vuu.
 */
export const OpenDialogViewPortAction = (
  table: VuuTable,
  renderComponent: OpenDialogViewPortAction["renderComponent"] = "grid",
): OpenDialogViewPortAction => ({
  type: "OPEN_DIALOG_ACTION",
  table,
  renderComponent,
});

export const OpenDialog = OpenDialogViewPortAction;

/** Part of the protocol; vuu-ui currently ignores it in menu responses. */
export const CloseDialogViewPortAction = (): CloseDialogAction => ({
  type: "CLOSE_DIALOG_ACTION",
});

export const CloseDialog = CloseDialogViewPortAction;
