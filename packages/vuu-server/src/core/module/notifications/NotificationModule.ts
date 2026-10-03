import { TableDef, VUU_DEFAULT_COLUMNS } from "../../../api/TableDef";
import { ProviderFactory } from "../../../provider/Provider";
import { PermissionFunction } from "../../filter/PermissionFilter";
import { ModuleFactory, ServiceFactory } from "../ModuleFactory";
import { ViewServerModule } from "../VsModule";
import { ColumnDefinition, NotificationsSchema } from "./NotificationsSchema";

const NAME = "NOTIFICATIONS";
const TABLE_NAME = "notifications";

/**
 * A generic Notifications module, exposing a single 'notifications' table.
 * The source of notifications (provider), the rows visible to each user
 * (permissionFunction) and any rpc services (viewPortDefFactory) are supplied
 * by the consumer. Any additional columns are appended to the generic
 * notification columns (see NotificationsSchema).
 */
function createNotificationModule(
  providerFunc: ProviderFactory,
  permissionFunction: PermissionFunction,
  viewPortDefFactory: ServiceFactory,
  ...additionalColumns: ColumnDefinition[]
): ViewServerModule {
  return ModuleFactory.withNameSpace(NAME)
    .addTable(
      TableDef({
        name: TABLE_NAME,
        keyField: "id",
        columns: [
          ...NotificationsSchema.allFrom(...additionalColumns),
          ...VUU_DEFAULT_COLUMNS,
        ],
        joinFields: ["id"],
        permissionFunction,
      }),
      providerFunc,
      viewPortDefFactory,
    )
    .asModule();
}

export const NotificationModule = Object.assign(createNotificationModule, {
  NAME,
  TABLE_NAME,
} as const);
