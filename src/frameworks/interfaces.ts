import { IncomingMessage, ServerResponse } from "http";
import { EmulatorInfo } from "../emulator/types";
import { HostingHeaders, HostingRedirects, HostingRewrites } from "../firebaseConfig";
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
  version?: string;
  vite?: boolean;
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
  next: () => void,
) => void | Promise<void>;

export type FrameworksOptions = HostingOptions &
  Options & {
    frameworksDevModeHandle?: RequestHandler;
    nonInteractive?: boolean;
  };

export type FrameworkContext = {
  projectId?: string;
  hostingChannel?: string;
  site?: string;
};

export interface Framework {
  supportedRange?: string;
  discover: (dir: string) => Promise<Discovery | undefined>;
  type: FrameworkType;
  name: string;
  build: (dir: string, target: string, context?: FrameworkContext) => Promise<BuildResult | void>;
  support: SupportLevel;
  docsUrl?: string;
  init?: (setup: any, config: any) => Promise<void>;
  getDevModeHandle?: (
    dir: string,
    target: string,
    hostingEmulatorInfo?: EmulatorInfo,
  ) => Promise<RequestHandler>;
  ɵcodegenPublicDirectory: (
    dir: string,
    dest: string,
    target: string,
    context: {
      project: string;
      site: string;
    },
  ) => Promise<void>;
  ɵcodegenFunctionsDirectory?: (
    dir: string,
    dest: string,
    target: string,
    context?: FrameworkContext,
  ) => Promise<{
    bootstrapScript?: string;
    packageJson: any;
    frameworksEntry?: string;
    dotEnv?: Record<string, string>;
    rewriteSource?: string;
  }>;
  getValidBuildTargets?: (purpose: BUILD_TARGET_PURPOSE, dir: string) => Promise<string[]>;
  shouldUseDevModeHandle?: (target: string, dir: string) => Promise<boolean>;
}

export type BUILD_TARGET_PURPOSE = "deploy" | "test" | "emulate";

// TODO pull from @firebase/util when published
export interface FirebaseDefaults {
  config?: Object;
  emulatorHosts?: Record<string, string>;
  _authTokenSyncURL?: string;
}

// Only the fields being used are defined here
export interface PackageJson {
  main: string;
  type?: "commonjs" | "module";
}
