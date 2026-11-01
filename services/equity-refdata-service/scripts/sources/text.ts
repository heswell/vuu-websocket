const ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"',
};

export const decodeXml = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code =
        entity[1].toLowerCase() === "x"
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return String.fromCodePoint(code);
    }
    return ENTITIES[entity] ?? match;
  });

/** Text content of the first <name> element in xml, undefined if absent. */
export const tag = (xml: string, name: string, from = 0) => {
  const open = `<${name}>`;
  const start = xml.indexOf(open, from);
  if (start === -1) {
    return undefined;
  }
  const end = xml.indexOf(`</${name}>`, start);
  return end === -1
    ? undefined
    : decodeXml(xml.slice(start + open.length, end).trim());
};

/** Calls fn with each <name>...</name> element in xml. */
export const forEachElement = (
  xml: string,
  name: string,
  fn: (element: string) => void,
) => {
  const open = `<${name}>`;
  const close = `</${name}>`;
  let pos = xml.indexOf(open);
  while (pos !== -1) {
    const end = xml.indexOf(close, pos);
    if (end === -1) {
      break;
    }
    fn(xml.slice(pos + open.length, end));
    pos = xml.indexOf(open, end + close.length);
  }
};

/** Parse one CSV line, handling quoted fields with "" escapes. */
export const parseCsvLine = (line: string) => {
  const fields: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (line[i] === '"') {
      let value = "";
      i += 1;
      for (;;) {
        const quote = line.indexOf('"', i);
        if (quote === -1) {
          value += line.slice(i);
          i = line.length;
          break;
        }
        value += line.slice(i, quote);
        if (line[quote + 1] === '"') {
          value += '"';
          i = quote + 2;
        } else {
          i = quote + 1;
          break;
        }
      }
      fields.push(value);
      i += 1; // comma
    } else {
      const comma = line.indexOf(",", i);
      const end = comma === -1 ? line.length : comma;
      fields.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return fields;
};
