import { Viewport } from "./ViewportContainer";
import { SelectionEventHandler } from "@heswell/data/src/store/DataView";

export class RuntimeVisualLink {
  #childColumnName: string;
  #childViewport: Viewport | undefined;
  #parentColumnName: string;
  #parentViewport: Viewport | undefined;

  constructor(
    childViewport: Viewport,
    parentViewport: Viewport,
    childColumnName: string,
    parentColumnName: string
  ) {
    this.#childColumnName = childColumnName;
    this.#childViewport = childViewport;
    this.#parentColumnName = parentColumnName;
    this.#parentViewport = parentViewport;

    parentViewport.on("row-selection", this.handleSelectionEvent);
  }

  remove() {
    this.#parentViewport?.removeListener(
      "row-selection",
      this.handleSelectionEvent
    );
    // TODO if there is a filter in effect, remove it
    // this.#childViewport.baseFilter = { filter: "" };
    this.#childViewport = undefined;
    this.#parentViewport = undefined;
  }

  handleSelectionEvent: SelectionEventHandler = () => {
    if (this.#childViewport && this.#parentViewport) {
      const [key] = this.#parentViewport.selectedKeys;
      //todo simple if the targetColumnName os the key. If it isn't we need
      // to find each row and determine the foreign key value
      const filter = `${this.#childColumnName} = "${key}"`;
      // TODO need a way to ensure that this triggers update
      console.log(`set filter ${filter}`);
      const dataResponse = this.#childViewport.filter({ filter });
      if (dataResponse) {
        const { rows, size } = dataResponse;
        this.#childViewport.enqueueDataMessages(rows, size);
      }

      // const selectedValues = this.pickUniqueSelectedValues(selection);
      // if (selectedValues.length === 0) {
      //   this.#childViewport.baseFilter = undefined;
      // } else if (selectedValues.length === 1) {
      //   this.#childViewport.baseFilter = {
      //     filter: `${this.#childColumnName} = "${selectedValues[0]}"`,
      //   };
      // } else {
      //   this.#childViewport.baseFilter = {
      //     filter: `${this.#childColumnName} in ["${selectedValues.join(
      //       '","'
      //     )}"]`,
      //   };
      // }
    }
  };
}
