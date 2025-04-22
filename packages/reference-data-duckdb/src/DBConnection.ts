import duckdb from "@duckdb/node-api";
import { DuckDBInstance } from "@duckdb/node-api";

// TODO search for a duckdb file if not in .env
const databasePath = process.env.DATABASE;

console.log(
  `hello duckdb, version ${duckdb.version()}, database '${databasePath}'`
);

class DuckDBConnection {
  static #instance: DuckDBConnection;
  public static get instance(): DuckDBConnection {
    if (!DuckDBConnection.#instance) {
      DuckDBConnection.#instance = new DuckDBConnection();
    }
    return DuckDBConnection.#instance;
  }

  #connection: Promise<duckdb.DuckDBConnection>;

  private constructor() {
    console.log("create DuckDBConnection");
    const { promise, resolve } =
      Promise.withResolvers<duckdb.DuckDBConnection>();
    this.#connection = promise;
    //TODO how to configure db
    DuckDBInstance.create(databasePath).then((instance) => {
      instance.connect().then(resolve);
    });
  }

  async exec(sql: string) {
    return (await this.#connection).run(sql);
  }
}

export default DuckDBConnection.instance;
