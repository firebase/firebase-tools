import { RunSingle } from "../../firebaseConfig";
import * as runv2 from "../../gcp/runv2";

export interface ServiceDeploy {
  config: RunSingle;
  existing?: runv2.Service;
  baseImage?: string;
  deployed?: runv2.Service;
}

export interface Payload {
  run?: { services: ServiceDeploy[] };
}

export interface Context {
  projectId: string;
  /**
   * Only deploys services in this region. Init sets it so that it deploys just the service it set
   * up, even if another region has a service with the same ID.
   */
  region?: string;
  /** Overrides the service's base image. null clears it; undefined keeps the current one. */
  baseImage?: string | null;
}
