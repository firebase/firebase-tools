import { HostingResolved } from "../../firebaseConfig";
import { Context as FunctionsContext } from "../functions/args";

export interface HostingDeploy {
  config: HostingResolved;
  site: string;
  version?: string;
}

export interface Context extends FunctionsContext {
  hosting?: {
    deploys: HostingDeploy[];
  };

  // Set as a global in hosting-channel-deploy.ts
  hostingChannel?: string;
}
