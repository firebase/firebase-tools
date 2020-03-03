import { FunctionsRuntimeBundle } from "./functionsEmulatorShared";

interface RewriteMap {
  [host: string]: {
    protocol: string;
    host: string;
    port: string;
  };
}

function getRewriteMap(frb: FunctionsRuntimeBundle): RewriteMap {
  const rewrites: RewriteMap = {};

  // TODO: non-localhost
  // TODO: other services
  if (frb.ports.firestore) {
    rewrites["firestore.googleapis.com"] = {
      protocol: "http",
      host: "localhost",
      port: `${frb.ports.firestore}`,
    };
  }

  // TODO: remove
  rewrites["example.com"] = {
    protocol: "http",
    host: "localhost",
    port: "4400",
  };

  return rewrites;
}

function rewriteUrl(frb: FunctionsRuntimeBundle, href: string): string {
  const map = getRewriteMap(frb);
  const url = new URL(href);

  const entry = map[url.host];
  if (entry) {
    console.log("Rewriting: ", url.host, JSON.stringify(entry));
    url.protocol = entry.protocol;
    url.host = entry.host;
    url.port = entry.port;
  }

  return url.toString();
}

function rewriteHttpsOptions(frb: FunctionsRuntimeBundle, options: any): any {
  const map = getRewriteMap(frb);

  const entry = map[options.host];
  if (entry) {
    console.log("Rewriting: ", options.host, JSON.stringify(entry));
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
  // TODO: DRY this with the logging
  const modules = {
    "http.get": {
      module: require("http"),
      method: "get",
    },
    "http.request": {
      module: require("http"),
      method: "request",
    },
    "https.get": {
      module: require("https"),
      method: "get",
    },
    "https.request": {
      module: require("https"),
      method: "request",
    },
  };

  for (let [name, bundle] of Object.entries(modules)) {
    let obj = bundle.module;
    let targetMethod = obj[bundle.method].bind(bundle.module);

    /* tslint:disable:only-arrow-functions */
    // This can't be an arrow function because it needs to be new'able
    obj[bundle.method] = function(...args: any[]): any {
      console.log(`Request: ${name}`);
      args = rewriteHttpsRequestArgs(frb, args);

      if (name === "https.request") {
        // TODO: Don't always do this! Only when needed
        const targetModule = modules["http.request"].module;
        targetMethod = targetModule["request"].bind(targetModule);
      }
      if (name === "https.get") {
        // TODO: Don't always do this! Only when needed
        const targetModule = modules["http.get"].module;
        targetMethod = targetModule["get"].bind(targetModule);
      }

      try {
        return targetMethod(...args);
      } catch (e) {
        const newed = new targetMethod(...args);
        return newed;
      }
    };
  }
}
