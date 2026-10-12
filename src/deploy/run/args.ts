import { RunSingle } from "../../firebaseConfig";
import * as runv2 from "../../gcp/runv2";

/** A service being deployed. Each field says which step sets it: prepare or deploy. */
export interface ServiceDeploy {
  /** Set by prepare: the service's entry in firebase.json. */
  config: RunSingle;
  /**
   * Set by prepare: the service as it is in Cloud Run before this deploy, or undefined if it
   * doesn't exist yet.
   */
  existing?: runv2.Service;
  /**
   * Set by prepare: the base image to build and run on. It's the service's current one, unless
   * this deploy sets or clears it. Undefined means none, so automatic base image updates are off.
   */
  baseImage?: string;
  /** Set by deploy: the service after the rollout. */
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
