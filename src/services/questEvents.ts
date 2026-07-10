import { EventEmitter } from "events";

export const questBus = new EventEmitter();
questBus.setMaxListeners(30);
