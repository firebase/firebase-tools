import { HostingResolved } from "../../hosting/config";
import { Context as FunctionsContext } from "../functions/args";

export interface HostingDeploy {
  // Note: a HostingMultiple[number] is a stronger guarantee than a HostingSingle
  // because at least one of site and target must exist.
  config: HostingResolved;
  version: string;
}

export interface Context extends FunctionsContext {
  hosting?: {
    deploys: HostingDeploy[];
  };

  // Set as a global in hosting-channel-deploy.ts
  hostingChannel?: string;
}
