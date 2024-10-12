class Viewport extends DataView {}

export class ViewportContainer {
  static #instance: ViewportContainer;
  public static get instance(): ViewportContainer {
    if (!ViewportContainer.#instance) {
      ViewportContainer.#instance = new ViewportContainer();
    }
    return ViewportContainer.#instance;
  }
  private constructor() {
    console.log("create ViewportContainer");
  }

  addViewport() {}
}

export default ViewportContainer.instance;
