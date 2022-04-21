import * as planner from "./planner";

export interface Payload {
  instancesToCreate?: planner.DeploymentInstanceSpec[];
  instancesToConfigure?: planner.DeploymentInstanceSpec[];
  instancesToUpdate?: planner.DeploymentInstanceSpec[];
  instancesToDelete?: planner.DeploymentInstanceSpec[];
}

export interface Context {
  have?: planner.DeploymentInstanceSpec[];
  want?: planner.DeploymentInstanceSpec[];
}
