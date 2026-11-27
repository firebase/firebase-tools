import { RunSingle } from "../../firebaseConfig";
import * as runv2 from "../../gcp/runv2";
import { BuildEnv } from "./buildEnv";

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
  /**
   * Set by prepare: the linked Firebase Web App, if any. Deploy saves `appId` on the service so
   * later deploys reuse it, and sets `firebaseConfig` as the FIREBASE_CONFIG env var, which the
   * Admin SDK reads at runtime.
   */
  autoInit?: { appId: string; firebaseConfig: string };
  /**
   * Set by prepare: the build-time env vars from the service's annotation, each a plain value or
   * a secret. Only local builds can use secrets: builds on Cloud Build only take plain values.
   */
  buildEnv?: BuildEnv;
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
  /** Overrides the service's Firebase Web App ID. null clears it; undefined keeps the current one. */
  appId?: string | null;
}
