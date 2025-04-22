import db from "./src/DBConnection.ts";

const result = await db.exec(
  `SELECT * FROM duckdb_schemas() WHERE schema_name = 'refdata'`
);

console.log(`${result.rowCount} rows `);

// connection.run(`CREATE TABLE IF NOT EXISTS instruments (
//     bbg             VARCHAR(8)      NOT NULL,
//     currency        VARCHAR(3)      NOT NULL,
//     description     VARCHAR(128)    NOT NULL,
//     exchange        VARCHAR(20)     NOT NULL,
//     isin            VARCHAR(12)     NOT NULL,
//     lotSize         INTEGER         NOT NULL,
//     ric             VARCHAR(12)     PRIMARY KEY
// )`);
