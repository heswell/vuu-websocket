import { parseArgs as parse, ParseArgsOptionsConfig } from "util";

export type { ParseArgsOptionsConfig };

export const parseArgs = (options: ParseArgsOptionsConfig) => {
  const { values, positionals } = parse({
    args: Bun.argv,
    options,
    strict: true,
    allowPositionals: true,
  });

  return values;
};
