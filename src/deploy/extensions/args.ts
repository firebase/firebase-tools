import * as planner from "./planner";

export interface Payload {
  instancesToCreate?: planner.Deployable[];
  instancesToUpdate?: planner.Deployable[];
  instancesToDelete?: planner.Deployable[];
}
