import { RunSingle } from "../../firebaseConfig";
import * as runv2 from "../../gcp/runv2";

/** A service being deployed. prepare fills in the first fields, and deploy sets `deployed`. */
export interface ServiceDeploy {
  config: RunSingle;
  /** The service as it is in Cloud Run before this deploy, or undefined if it doesn't exist yet. */
  existing?: runv2.Service;
  /**
   * The base image to build and run on: the service's current one, unless this deploy sets or
   * clears it. Undefined means none, so automatic base image updates are off.
   */
  baseImage?: string;
  /** The service after the rollout. */
  deployed?: runv2.Service;
}

export interface Payload {
  run?: { services: ServiceDeploy[] };
}

export interface Context {
  projectId: string;
  /** Overrides the service's base image. null clears it; undefined keeps the current one. */
  baseImage?: string | null;
}
