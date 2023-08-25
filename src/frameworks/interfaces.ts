import { IncomingMessage, ServerResponse } from "http";
import { EmulatorInfo } from "../emulator/types";
import { HostingBase, HostingHeaders, HostingRedirects, HostingRewrites } from "../firebaseConfig";
import { HostingOptions } from "../hosting/options";
import { Options } from "../options";

// These serve as the order of operations for discovery
// E.g, a framework utilizing Vite should be given priority
// over the vite tooling
export const enum FrameworkType {
  Custom = 0, // express
  Monorep, // nx, lerna
  MetaFramework, // next.js, nest.js
  Framework, // angular, react
  Toolchain, // vite
}

export const enum SupportLevel {
  Experimental = "experimental",
  Preview = "preview",
}

export interface Discovery {
  mayWantBackend: boolean;
  publicDirectory: string;
  entryFile?: string;
}

export interface BuildResult {
  rewrites?: HostingRewrites[];
  redirects?: HostingRedirects[];
  headers?: HostingHeaders[];
  wantsBackend?: boolean;
  trailingSlash?: boolean;
  i18n?: boolean;
  baseUrl?: string;
}

export type RequestHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void
) => void | Promise<void>;

export type FrameworksOptions = HostingOptions &
  Options & {
    frameworksDevModeHandle?: RequestHandler;
    nonInteractive?: boolean;
  };

export type FrameworkContext = {
  projectId?: string;
  hostingChannel?: string;
};

interface NodeJSFramework {
  bootstrapScript?: string;
  packageJson: any;
  frameworksEntry?: string;
  dotEnv?: Record<string, string>;
  rewriteSource?: string;
}

interface PythonFramework {
  imports: [string, string];
  requirementsTxt: string;
  rewriteSource?: string;
}

export type DiscoverOptions = {
  plugin?: string;
  npmDependency?: string;
  flaskConfig?: NonNullable<HostingBase["frameworksBackend"]>["flask"];
};
export interface Framework {
  discover: (dir: string, options?: DiscoverOptions) => Promise<Discovery | undefined>;
  type: FrameworkType;
  name: string;
  build: (dir: string, target: string) => Promise<BuildResult | void>;
  support: SupportLevel;
  docsUrl?: string;
  init?: (setup: any, config: any) => Promise<void>;
  getDevModeHandle?: (
    dir: string,
    target: string,
    hostingEmulatorInfo?: EmulatorInfo
  ) => Promise<RequestHandler>;
  ɵcodegenPublicDirectory: (dir: string, options?: CodegenPublicDirectoryOptions) => Promise<void>;
  ɵcodegenFunctionsDirectory?: (
    dir: string,
    options?: CodegenFunctionsDirectoryOptions
  ) => Promise<NodeJSFramework | PythonFramework>;
  getValidBuildTargets?: (purpose: BUILD_TARGET_PURPOSE, dir: string) => Promise<string[]>;
  shouldUseDevModeHandle?: (target: string, dir: string) => Promise<boolean>;
}

export type CodegenFunctionsDirectoryOptions = {
  dest?: string;
  target?: string;
  configuration?: string;
  frameworksBackend?: HostingBase["frameworksBackend"];
};

export type CodegenPublicDirectoryOptions = {
  dest?: string;
  target?: string;
  context?: {
    project: string;
    site: string;
  };
  frameworksBackend?: HostingBase["frameworksBackend"];
};

export type BUILD_TARGET_PURPOSE = "deploy" | "test" | "emulate";

// TODO pull from @firebase/util when published
export interface FirebaseDefaults {
  config?: Object;
  emulatorHosts?: Record<string, string>;
  _authTokenSyncURL?: string;
}
