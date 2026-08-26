import type { VuuUser } from "./auths/VuuUser";
import type { TableContainer } from "./table/TableContainer";
import type { LoginSuccessOptions } from "../net/LoginSuccess";

export type LoginSuccessProvider = (
  user: VuuUser,
  tableContainer: TableContainer,
) => LoginSuccessOptions;
