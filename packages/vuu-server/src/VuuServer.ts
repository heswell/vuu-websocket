import { Module } from "./Module";
import { type VuuServerConfig } from "./VuuServerConfig";
import run from "./server";

export class VuuServer {
  #modules: Module[];
  constructor({ modules, ...rest }: VuuServerConfig) {
    console.log("[VuuServer] new");
    this.#modules = modules;
  }
  start() {
    console.log("[VuuServer] start");
    this.#modules.forEach((module) => module.start());
    run();
  }
}
