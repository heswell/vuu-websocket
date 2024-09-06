import { VuuRange } from "@vuu-ui/vuu-protocol-types";
import { GroupedStruct } from "./GroupRowSet";
import { CursorPosition, GroupedItem } from "./group-utils";

export class GroupIterator {
  #groupedStruct: GroupedStruct;

  constructor(groupedStruct: GroupedStruct) {
    this.#groupedStruct = groupedStruct;
  }

  next(range: VuuRange): GroupedItem[] {
    const groupedItems: GroupedItem[] = [];

    const cursor: CursorPosition = {
      groupIndex: [],
      index: 0,
      leafIndex: -1,
    };
    collectChildItems(
      groupedItems,
      cursor,
      this.#groupedStruct,
      "$root",
      range
    );

    return groupedItems;
  }
}

const collectChildItems = (
  groupedItems: GroupedItem[],
  cursor: CursorPosition,
  group: GroupedStruct,
  rootKey: string,
  range: VuuRange
) => {
  const { from: startIndex, to: endIndex } = range;
  let { index, groupIndex: startGroupIndex } = cursor;
  const { childCount, childGroupKeys, groups } = group;
  let [firstGroupIndex = 0, ...nextGroupIndex] = startGroupIndex;

  for (
    let childGroupIndex = firstGroupIndex;
    childGroupIndex < childCount && index < endIndex;
    childGroupIndex++
  ) {
    const groupValue = childGroupKeys[childGroupIndex];
    const childGroup = groups[groupValue];

    const key = `${rootKey}|${groupValue}`;

    if (index >= startIndex) {
      groupedItems.push({
        group: childGroup,
        groupValue,
        index,
        leafIndex: -1,
        key,
      });
    }

    if (childGroup.expanded) {
      // we can skip the whole child if rowCount still doesn't reach startIndex

      if (childGroup.childCount > 0) {
        ({ index } = collectChildItems(
          groupedItems,
          { ...cursor, index: index + 1 },
          childGroup,
          key,
          range
        ));
        continue;
      } else if (childGroup.leafCount > 0) {
        ({ index } = collectLeafItems(
          groupedItems,
          { ...cursor, index: index + 1 },
          childGroup,
          groupValue,
          key,
          range
        ));
        continue;
      }
    }
    index += 1;
  }

  return { ...cursor, index };
};

const collectLeafItems = (
  groupedItems: GroupedItem[],
  cursor: CursorPosition,
  group: GroupedStruct,
  groupValue: string,
  key: string,
  range: VuuRange
) => {
  const { from: startIndex, to: endIndex } = range;
  let { index } = cursor;

  for (
    let leafIndex = 0;
    leafIndex < group.leafCount && index < endIndex;
    leafIndex++
  ) {
    if (index >= startIndex) {
      groupedItems.push({
        group,
        groupValue,
        leafIndex,
        index,
        key,
      });
    }

    index += 1;
  }

  return { ...cursor, index };
};
