import { VuuColumnDataType } from "@vuu-ui/vuu-protocol-types";
import { Column } from "../../../api/TableDef";

const VuuColumnDataTypes: Record<string, VuuColumnDataType> = {
  boolean: "boolean",
  char: "char",
  double: "double",
  epochtimestamp: "epochtimestamp",
  int: "int",
  long: "long",
  scaleddecimal2: "scaleddecimal2",
  scaleddecimal4: "scaleddecimal4",
  scaleddecimal6: "scaleddecimal6",
  scaleddecimal8: "scaleddecimal8",
  string: "string",
};

/**
 * Accepts either a Column or a column definition in the Scala server
 * 'name:Type' format, e.g. "source:String", "priority:Int".
 */
export type ColumnDefinition = Column | string;

export const toColumn = (columnDefinition: ColumnDefinition): Column => {
  if (typeof columnDefinition === "string") {
    const [name, dataType = ""] = columnDefinition.split(":");
    const vuuDataType = VuuColumnDataTypes[dataType.toLowerCase()];
    if (name && vuuDataType) {
      return { name, dataType: vuuDataType };
    }
    throw Error(
      `[NotificationsSchema] invalid column definition '${columnDefinition}'`,
    );
  }
  return columnDefinition;
};

const Id = "id:String";
const Type = "type:String";
const ExpiryTime = "expiryTime:EpochTimestamp";
const Title = "title:String";
const Message = "message:String";
const Level = "level:String";
const Audience = "audience:String";
/**
 * Optional routing key, e.g. "orders". Clients route a notification to the
 * modules that claim its topic (see ModuleRecord.notificationTopics).
 */
const Topic = "topic:String";

const genericColumns = [
  Id,
  Type,
  ExpiryTime,
  Title,
  Message,
  Level,
  Audience,
  Topic,
];
const genericColumnNames = new Set(
  genericColumns.map((column) => column.split(":")[0]),
);

export const NotificationsSchema = {
  Id,
  Type,
  ExpiryTime,
  Title,
  Message,
  Level,
  Audience,
  Topic,
  /**
   * The generic notification columns, plus any additional columns. An
   * additional column that repeats a generic column name is ignored.
   */
  allFrom: (...additionalColumns: ColumnDefinition[]): Column[] => [
    ...genericColumns.map(toColumn),
    ...additionalColumns
      .map(toColumn)
      .filter(({ name }) => !genericColumnNames.has(name)),
  ],
};
