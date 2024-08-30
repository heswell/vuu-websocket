export type RestRange = {
  origin: number;
  limit: number;
};

const getSearchParam = (url: URL, property: string, defaultValue = "") =>
  url.searchParams.get(property) ?? defaultValue;

export const getRestRange = (url: URL) => {
  return {
    origin: parseInt(getSearchParam(url, "origin", "0")),
    limit: parseInt(getSearchParam(url, "limit", "100")),
  } as RestRange;
};
