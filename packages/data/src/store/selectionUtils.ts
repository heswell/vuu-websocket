export const identifySelectionChanges = <T extends string | number = number>(
  existingValues: T[],
  newValues: T[]
): [Set<T>, Set<T>] => {
  const existingSet = new Set(existingValues);
  const newSet = new Set(newValues);

  const removedSet = existingSet.difference(newSet);
  const addedSet = newSet.difference(existingSet);

  return [addedSet, removedSet];
};
