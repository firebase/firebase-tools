import * as v1 from "./v1";
import * as v2 from "./v2";

export { v1, v2 };

export type Event = v1.Event | v2.Event;
