import { Table } from "@heswell/data";
import {
  VuuServerConfig,
  ModuleFactory,
  TableDef,
  Provider,
  VuuServer,
  TableContainer,
} from "@heswell/vuu-server";
import { VuuDataRow } from "@vuu-ui/vuu-protocol-types";

export class MockVuuServer extends VuuServer {
  startServer() {
    console.log("start the mock server");
  }
  getProvider(table: string) {
    return this.providerContainer.getProviderForTable(table);
  }
}

class TestProvider extends Provider {
  startEmpty: boolean;
  constructor(
    table: Table,
    { startEmpty = false }: ProviderProps = defaultProviderProps
  ) {
    super(table);
    this.startEmpty = startEmpty;
  }
  async load() {
    if (!this.startEmpty) {
      // prettier-ignore
      {
        this.table.insert([ "AAA L", "USD", "AAA Incorporated", "NASDAQ", "ABCDE0000", 1009, "AAA.N" ]);
        this.table.insert([ "BBB L", "GBP", "BBB Incorporated", "NASDAQ", "BCDEF0000", 1008, "BBB.N" ]);
        this.table.insert([ "CCC L", "CHF", "CCC Incorporated", "NASDAQ", "CDEFG0000", 1007, "CCC.N" ]);
        this.table.insert([ "DDD L", "USD", "DDD Incorporated", "NASDAQ", "DEFGH0000", 1006, "DDD.N" ]);
        this.table.insert([ "EEE L", "HKD", "EEE Incorporated", "NASDAQ", "EFGHI0000", 1005, "EEE.N" ]);
        this.table.insert([ "FFF L", "SEK", "FFF Incorporated", "NASDAQ", "FGHIJ0000", 1004, "FFF.N" ]);
        this.table.insert([ "GGG L", "EUR", "GGG Incorporated", "NASDAQ", "GHIJK0000", 1003, "GGG.N" ]);
        this.table.insert([ "HHH L", "EUR", "HHH Incorporated", "NASDAQ", "HIJKL0000", 1002, "HHH.N" ]);
        this.table.insert([ "III L", "GBP", "III Incorporated", "NASDAQ", "IJKLM0000", 1001, "III.N" ]);
        this.table.insert([ "JJJ L", "USD", "JJJ Incorporated", "NASDAQ", "JKLMN0000", 1000, "JJJ.N" ]);
    }
    }
  }

  loadTest(rows: VuuDataRow[]) {
    rows.forEach((row) => this.table.insert(row));
  }

  update(rows: VuuDataRow[]) {
    rows.forEach((row) => this.table.upsert(row));
  }
}

const TestModule = (providerProps?: ProviderProps) =>
  ModuleFactory.withNameSpace("TEST")
    .addTable(
      TableDef({
        columns: [
          { name: "bbg", dataType: "string" },
          { name: "currency", dataType: "string" },
          { name: "description", dataType: "string" },
          { name: "exchange", dataType: "string" },
          { name: "isin", dataType: "string" },
          { name: "lotSize", dataType: "int" },
          { name: "ric", dataType: "string" },
        ],
        joinFields: "ric",
        keyField: "ric",
        name: "instruments",
      }),
      (table) => new TestProvider(table, providerProps)
    )
    .asModule();

export interface ProviderProps {
  startEmpty?: boolean;
}

export const defaultProviderProps = {
  startEmpty: false,
};

export function startTestModule(providerProps?: ProviderProps) {
  const httpServerOptions = {};
  const webSocketOptions = {
    webSocketPort: process.env.WEBSOCKET_PORT ?? 8091,
  };

  const config = VuuServerConfig(
    httpServerOptions,
    webSocketOptions
  ).withModule(TestModule(providerProps));

  const vuuServer = new MockVuuServer(config);

  vuuServer.start();

  return vuuServer;
}
