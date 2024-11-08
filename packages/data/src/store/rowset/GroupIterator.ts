import { VuuRange } from "@vuu-ui/vuu-protocol-types";
import { GroupedStruct } from "./GroupRowSet";
import {
  CursorPosition,
  getRangeSet,
  getRangeSetBounds,
  GroupedItem,
} from "./group-utils";

export class GroupIterator {
  #groupedStruct: GroupedStruct;

  constructor(groupedStruct: GroupedStruct) {
    this.#groupedStruct = groupedStruct;
  }

  allByIndex(rangeSet: number[]) {
    const groupedItems: GroupedItem[] = [];

    if (rangeSet.length === 0) {
      return [];
    }

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
      rangeSet
    );

    return groupedItems;
  }

  next(range: VuuRange): GroupedItem[] {
    return this.allByIndex(getRangeSet(range));
  }
}

const collectChildItems = (
  groupedItems: GroupedItem[],
  cursor: CursorPosition,
  group: GroupedStruct,
  rootKey: string,
  rangeSet: number[]
) => {
  const [startIndex, endIndex] = getRangeSetBounds(rangeSet);
  let { index, groupIndex: startGroupIndex } = cursor;
  const { childCount, childGroupKeys, groups } = group;
  let [firstGroupIndex = 0] = startGroupIndex;

  for (
    let childGroupIndex = firstGroupIndex;
    childGroupIndex < childCount && index < endIndex;
    childGroupIndex++
  ) {
    const groupValue = childGroupKeys[childGroupIndex];
    const childGroup = groups[groupValue];

    const key = `${rootKey}|${groupValue}`;

    // The first test is not strictly needed, but faster than the second
    if (index >= startIndex && rangeSet.includes(index)) {
      // TODO should be remove this item from the rangeset here ?
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
          rangeSet
        ));
        continue;
      } else if (childGroup.leafCount > 0) {
        ({ index } = collectLeafItems(
          groupedItems,
          { ...cursor, index: index + 1 },
          childGroup,
          groupValue,
          key,
          rangeSet
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
  rangeSet: number[]
) => {
  const [startIndex, endIndex] = getRangeSetBounds(rangeSet);
  let { index } = cursor;
  for (
    let leafIndex = 0;
    leafIndex < group.leafCount && index < endIndex;
    leafIndex++
  ) {
    if (index >= startIndex && rangeSet.includes(index)) {
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
