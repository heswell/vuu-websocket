import type { VuuRowDataItemType } from "@vuu-ui/vuu-protocol-types";
import { createTable } from "../../core/table/TableContainer";
import { cloneRows, lazy, random } from "../../data-utils";
import { buildDataColumnMap } from "../../Table";
import { schemas } from "../simul-schemas";
import { getInstrumentsData } from "./instruments";

const getInstrumentsExtendedData = lazy(() =>
  getInstrumentsData().map((row) =>
    (row as VuuRowDataItemType[])
      .slice(0, -1)
      .concat([random(0, 1) === 1, random(0, 1) === 1, new Date().getTime()]),
  ),
);

export const createInstrumentsExtendedTable = () =>
  createTable(
    schemas.instrumentsExtended,
    cloneRows(getInstrumentsExtendedData()),
    buildDataColumnMap(schemas, "instrumentsExtended"),
  );
