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
  return `${r.protocol}://${r.host}:${r.port}`;
}

function getRedirectMap(frb: FunctionsRuntimeBundle): RedirectMap {
  const rewrites: RedirectMap = {};

  // TODO(samstern): other services
  if (frb.emulators.firestore) {
    rewrites["firestore.googleapis.com"] = {
      protocol: "http",
      host: frb.emulators.firestore.host,
      port: `${frb.emulators.firestore.port}`,
    };
  }

  // TODO(samstern): remove
  rewrites["example.com"] = {
    protocol: "http",
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
  const url = new URL(href);

  const entry = map[url.host];
  if (entry) {
    new EmulatorLog(
      "DEBUG",
      "runtime-status",
      `Rewriting URL ${url} (${redirectToAddress(entry)})`
    ).log();
    url.protocol = entry.protocol;
    url.host = entry.host;
    url.port = entry.port;
  }

  return url.toString();
}

function rewriteHttpsOptions(frb: FunctionsRuntimeBundle, options: any): any {
  const map = getRedirectMap(frb);

  const entry = map[options.host];
  if (entry) {
    new EmulatorLog(
      "DEBUG",
      "runtime-status",
      `Rewriting options ${JSON.stringify(options)} (${redirectToAddress(entry)})`
    ).log();
    options.protocol = entry.protocol;
    options.host = entry.host;
    options.port = entry.port;
  }

  return options;
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
      `Redirecting HTTP requests from ${host} to ${redirectToAddress(entry)}`
    ).log();
  });

  // TODO: DRY this with the logging
  const networkMethods = {
    http: {
      module: require("http"),
      method: "request",
    },
    https: {
      module: require("https"),
      method: "request",
    },
  };

  for (let [name, bundle] of Object.entries(networkMethods)) {
    const obj = bundle.module;
    const originalMethod = obj[bundle.method].bind(bundle.module);

    /* tslint:disable:only-arrow-functions */
    // This can't be an arrow function because it needs to be new'able
    obj[bundle.method] = function(...args: any[]): any {
      const dest = getProxyDestination(frb, args);
      if (!dest) {
        return originalMethod(args);
      }

      args = rewriteHttpsRequestArgs(frb, args);

      if (name === "https" && dest.protocol === "http") {
        // TODO(samstern): This don't work
        new EmulatorLog("DEBUG", "runtime-status", "Moving https request to http").log();
        const httpModule = networkMethods.http.module;
        const httpMethod = httpModule[bundle.method].bind(httpModule);
        return httpMethod(...args);
      }

      return originalMethod(...args);
    };
  }
}
