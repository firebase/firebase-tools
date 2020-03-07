import { FunctionsRuntimeBundle } from "./functionsEmulatorShared";
import { EmulatorLog } from "./types";

interface Redirect {
  protocol: string;
  host: string;
  port: string;
}

interface RedirectMap {
  [host: string]: Redirect;
}

function redirectToAddress(r: Redirect) {
  return `${r.protocol}//${r.host}:${r.port}`;
}

function getRedirectMap(frb: FunctionsRuntimeBundle): RedirectMap {
  const rewrites: RedirectMap = {};

  // TODO(samstern): What about RTDB, etc?
  if (frb.emulators.firestore) {
    rewrites["firestore.googleapis.com"] = {
      protocol: "http:",
      host: frb.emulators.firestore.host,
      port: `${frb.emulators.firestore.port}`,
    };
  }

  // TODO: Real ports
  rewrites["emulator-hub"] = {
    protocol: "http:",
    host: "localhost",
    port: "4400",
  };

  return rewrites;
}

function getProxyDestination(frb: FunctionsRuntimeBundle, args: any[]): Redirect | undefined {
  const map = getRedirectMap(frb);

  if (typeof args[0] === "string") {
    const url = new URL(args[0]);
    return map[url.host];
  }

  if (typeof args[0] === "object" && args[0].host) {
    return map[args[0].host];
  }

  if (args.length >= 2 && typeof args[1] === "object" && args[1].host) {
    return map[args[1].host];
  }

  return undefined;
}

function rewriteUrl(frb: FunctionsRuntimeBundle, href: string): string {
  const map = getRedirectMap(frb);
  const newUrl = new URL(href);

  const entry = map[newUrl.host];
  if (entry) {
    newUrl.protocol = entry.protocol;
    newUrl.host = entry.host;
    newUrl.port = entry.port;
  }

  return newUrl.toString();
}

function rewriteHttpsOptions(frb: FunctionsRuntimeBundle, options: any): any {
  const map = getRedirectMap(frb);

  const newOptions = Object.assign({}, options);

  const entry = map[options.host];
  if (entry) {
    newOptions.protocol = entry.protocol;
    newOptions.host = entry.host;
    newOptions.port = entry.port;
  }

  return newOptions;
}

function rewriteHttpsRequestArgs(frb: FunctionsRuntimeBundle, args: any[]): any[] {
  // https://nodejs.org/api/https.html#https_https_request_url_options_callback
  if (typeof args[0] === "string") {
    args[0] = rewriteUrl(frb, args[0]);
  }

  if (typeof args[0] === "object") {
    args[0] = rewriteHttpsOptions(frb, args[0]);
  }

  if (args.length >= 2 && typeof args[1] === "object") {
    args[1] = rewriteHttpsOptions(frb, args[1]);
  }

  return args;
}

export function initializeNetworkRedirects(frb: FunctionsRuntimeBundle): void {
  const map = getRedirectMap(frb);
  Object.keys(map).forEach((host) => {
    const entry = map[host];
    new EmulatorLog(
      "WARN_ONCE",
      "runtime-status",
      `Redirecting requests from ${host} to ${redirectToAddress(entry)}`
    ).log();
  });

  // TODO: DRY this with the existing network warnings code
  const networkModules = {
    http: {
      module: require("http"),
      methods: ["request", "get"],
    },
    https: {
      module: require("https"),
      methods: ["request", "get"],
    },
  };

  for (let [moduleName, bundle] of Object.entries(networkModules)) {
    for (const methodName of bundle.methods) {
      const originalMethod = bundle.module[methodName].bind(bundle.module);

      /* tslint:disable:only-arrow-functions */
      // This can't be an arrow function because it needs to be new'able
      bundle.module[methodName] = function(...args: any[]): any {
        const dest = getProxyDestination(frb, args);
        if (!dest) {
          return originalMethod(args);
        }

        const originalArgs = Array.from(args);
        if (moduleName === "https" && dest.protocol === "http:") {
          EmulatorLog.dbg(`Switching http to https: ${JSON.stringify(originalArgs)}`);
          const httpModule = networkModules.http.module;
          const httpMethod = httpModule[methodName].bind(httpModule);
          return httpMethod(...originalArgs);
        }

        const newArgs = rewriteHttpsRequestArgs(frb, args);

        const fullName = `${moduleName}.${methodName}`;
        EmulatorLog.dbg(
          `${fullName}: ${JSON.stringify(originalArgs)} -> ${JSON.stringify(newArgs)}`
        );

        return originalMethod(...newArgs);
      };
    }
  }
}
