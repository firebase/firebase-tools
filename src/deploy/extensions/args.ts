import * as planner from "./planner";

export interface Payload {
  instancesToCreate?: planner.InstanceSpec[];
  instancesToUpdate?: planner.InstanceSpec[];
  instancesToDelete?: planner.InstanceSpec[];
}
