import * as planner from "./planner";

export interface Payload {
  instancesToCreate?: planner.InstanceSpec[];
  instancesToConfigure?: planner.InstanceSpec[];
  instancesToUpdate?: planner.InstanceSpec[];
  instancesToDelete?: planner.InstanceSpec[];
}

export interface Context {
  have?: planner.InstanceSpec[];
  want?: planner.InstanceSpec[];
}
