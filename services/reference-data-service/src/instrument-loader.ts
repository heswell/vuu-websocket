import type { Table } from "@heswell/vuu-table";
import type { VuuDataRow } from "@vuu-ui/vuu-protocol-types";
import type { InstrumentDto } from "./InstrumentDto";

/**
 * Load instruments from an ndjson file, one {"data": InstrumentDto} record
 * per line, into table. The file is processed a chunk at a time, yielding
 * to the event loop between chunks so the service remains responsive.
 */
export async function loadInstruments(
  table: Table,
  filePath: string,
  log: (message: string) => void = console.log,
) {
  const start = performance.now();
  const columns = table.columns.map(({ name }) => name) as Array<
    keyof InstrumentDto
  >;
  const colCount = columns.length;
  const decoder = new TextDecoder();
  let count = 0;
  let errors = 0;
  let remaining = "";

  const addLine = (line: string) => {
    if (line.length === 0) {
      return;
    }
    try {
      const { data } = JSON.parse(line) as { data: InstrumentDto };
      const row: VuuDataRow = new Array(colCount);
      for (let i = 0; i < colCount; i++) {
        row[i] = data[columns[i]];
      }
      table.insert(row);
      count += 1;
    } catch {
      errors += 1;
    }
  };

  const reader = Bun.file(filePath).stream().getReader();
  for (;;) {
    const { done, value: chunk } = await reader.read();
    if (done) {
      break;
    }
    const lines = (remaining + decoder.decode(chunk, { stream: true })).split(
      "\n",
    );
    remaining = lines.pop() ?? "";
    for (const line of lines) {
      addLine(line.trimEnd());
    }
    await Bun.sleep(0);
  }
  addLine((remaining + decoder.decode()).trim());

  log(
    `loaded ${count} instruments in ${Math.round(performance.now() - start)}ms` +
      (errors > 0 ? `, ${errors} invalid records skipped` : ""),
  );
  return count;
}
