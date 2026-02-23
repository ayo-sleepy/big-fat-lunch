import { EventEmitter } from "node:events";

class CommanderBus extends EventEmitter {
  constructor() {
    super();
    this._outputHandler = null;
  }

  setOutputHandler(fn) {
    this._outputHandler = fn;
  }

  push(line) {
    this.emit("output", line);
    if (this._outputHandler) this._outputHandler(line);
  }

  clearOutput() {
    this.emit("clear");
  }
}

export const commanderBus = new CommanderBus();
