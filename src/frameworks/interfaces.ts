import { IncomingMessage, ServerResponse } from "http";
import { EmulatorInfo } from "../emulator/types";
import { HostingHeaders, HostingRedirects, HostingRewrites } from "../firebaseConfig";

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
}

export interface BuildResult {
  rewrites?: HostingRewrites[];
  redirects?: HostingRedirects[];
  headers?: HostingHeaders[];
  wantsBackend?: boolean;
  trailingSlash?: boolean;
  i18n?: boolean;
}

export interface Framework {
  discover: (dir: string) => Promise<Discovery | undefined>;
  type: FrameworkType;
  name: string;
  build: (dir: string) => Promise<BuildResult | void>;
  support: SupportLevel;
  docsUrl?: string;
  init?: (setup: any, config: any) => Promise<void>;
  getDevModeHandle?: (
    dir: string,
    hostingEmulatorInfo?: EmulatorInfo
  ) => Promise<(req: IncomingMessage, res: ServerResponse, next: () => void) => void>;
  ɵcodegenPublicDirectory: (
    dir: string,
    dest: string,
    context: {
      project: string;
      site: string;
    }
  ) => Promise<void>;
  ɵcodegenFunctionsDirectory?: (
    dir: string,
    dest: string
  ) => Promise<{
    bootstrapScript?: string;
    packageJson: any;
    frameworksEntry?: string;
    baseUrl?: string;
    dotEnv?: Record<string, string>;
    rewriteSource?: string;
  }>;
}

// TODO pull from @firebase/util when published
export interface FirebaseDefaults {
  config?: Object;
  emulatorHosts?: Record<string, string>;
  _authTokenSyncURL?: string;
}
