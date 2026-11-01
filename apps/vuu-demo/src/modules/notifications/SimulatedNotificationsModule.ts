import {
  NotificationModule,
  PermissionFilter,
  ViewPortDef,
} from "@heswell/vuu-server";
import { SimulatedNotificationsProvider } from "./providers/SimulatedNotificationsProvider";
import { DismissNotificationRpcHandler } from "./services/DismissNotificationRpcHandler";

export const SimulatedNotificationsModule = () =>
  NotificationModule(
    (table) => new SimulatedNotificationsProvider(table),
    // Example permission function: only show notifications where audience is
    // "all", the current user, or one of the demo roles
    (viewport) => {
      const currentUser = viewport.user.name;
      return PermissionFilter(
        "audience",
        new Set(["all", currentUser, "admin", "trader"]),
      );
    },
    (table, _provider, _providerContainer, tableContainer) =>
      ViewPortDef(
        table.tableDef.columns,
        new DismissNotificationRpcHandler(table, tableContainer),
      ),
    "source:String",
    "priority:Int",
    "status:String",
    "dismissedBy:String",
  );

SimulatedNotificationsModule.NAME = NotificationModule.NAME;
