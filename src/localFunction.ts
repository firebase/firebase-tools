import * as uuid from "uuid";

import { encodeFirestoreValue } from "./firestore/encodeFirestoreValue";
import * as utils from "./utils";
import { EmulatedTriggerDefinition } from "./emulator/functionsEmulatorShared";
import { FunctionsEmulatorShell } from "./emulator/functionsEmulatorShell";
import { AuthMode, AuthType, EventOptions } from "./emulator/events/types";
import { Client, ClientResponse, ClientVerbOptions } from "./apiv2";

// HTTPS_SENTINEL is sent when a HTTPS call is made via functions:shell.
export const HTTPS_SENTINEL = "Request sent to function.";

/**
 * LocalFunction produces EmulatedTriggerDefinition into a function that can be called inside the nodejs repl.
 */
export default class LocalFunction {
  private url?: string;
  private paramWildcardRegex = new RegExp("{[^/{}]*}", "g");

  constructor(
    private trigger: EmulatedTriggerDefinition,
    urls: Record<string, string>,
    private controller: FunctionsEmulatorShell,
  ) {
    this.url = urls[trigger.id];
  }

  private substituteParams(resource: string, params?: Record<string, string>): string {
    if (!params) {
      return resource;
    }
    return resource.replace(this.paramWildcardRegex, (wildcard: string) => {
      const wildcardNoBraces = wildcard.slice(1, -1); // .slice removes '{' and '}' from wildcard
      const sub = params?.[wildcardNoBraces];
      return sub || wildcardNoBraces + utils.randomInt(1, 9);
    });
  }

  private constructCallableFunc(data: string | object, opts: { instanceIdToken?: string }): void {
    opts = opts || {};

    const headers: Record<string, string> = {};
    if (opts.instanceIdToken) {
      headers["Firebase-Instance-ID-Token"] = opts.instanceIdToken;
    }

    if (!this.url) {
      throw new Error("No URL provided");
    }

    const client = new Client({ urlPrefix: this.url, auth: false });
    void client
      .post<any, any>("", data, { headers })
      .then((res) => {
        this.requestCallBack<any>(undefined, res, res.body);
      })
      .catch((err) => {
        this.requestCallBack(err);
      });
  }

  private constructHttpsFunc(): requestShim {
    if (!this.url) {
      throw new Error("No URL provided");
    }
    const callClient = new Client({ urlPrefix: this.url, auth: false });
    type verbFn = (...args: any) => Promise<string>;
    const verbFactory = (
      hasRequestBody: boolean,
      method: (
        path: string,
        bodyOrOpts?: any,
        opts?: ClientVerbOptions,
      ) => Promise<ClientResponse<any>>,
    ): verbFn => {
      return async (pathOrOptions?: string | HttpsOptions, options?: HttpsOptions) => {
        const { path, opts } = this.extractArgs(pathOrOptions, options);
        try {
          const res = hasRequestBody
            ? await method(path, opts.body, toClientVerbOptions(opts))
            : await method(path, toClientVerbOptions(opts));
          this.requestCallBack(undefined, res, res.body);
        } catch (err) {
          this.requestCallBack(err);
        }
        return HTTPS_SENTINEL;
      };
    };

    const shim = verbFactory(true, (path: string, json?: any, opts?: ClientVerbOptions) => {
      const req = Object.assign(opts || {}, {
        path: path,
        body: json,
        method: opts?.method || "GET",
      });
      return callClient.request(req);
    });
    const verbs: verbMethods = {
      post: verbFactory(true, (path: string, json?: any, opts?: ClientVerbOptions) =>
        callClient.post(path, json, opts),
      ),
      put: verbFactory(true, (path: string, json?: any, opts?: ClientVerbOptions) =>
        callClient.put(path, json, opts),
      ),
      patch: verbFactory(true, (path: string, json?: any, opts?: ClientVerbOptions) =>
        callClient.patch(path, json, opts),
      ),
      get: verbFactory(false, (path: string, opts?: ClientVerbOptions) =>
        callClient.get(path, opts),
      ),
      del: verbFactory(false, (path: string, opts?: ClientVerbOptions) =>
        callClient.delete(path, opts),
      ),
      delete: verbFactory(false, (path: string, opts?: ClientVerbOptions) =>
        callClient.delete(path, opts),
      ),
      options: verbFactory(false, (path: string, opts?: ClientVerbOptions) =>
        callClient.options(path, opts),
      ),
    };
    return Object.assign(shim, verbs);
  }

  private extractArgs(
    pathOrOptions?: string | HttpsOptions,
    options?: HttpsOptions,
  ): { path: string; opts: HttpsOptions } {
    // Case: No arguments provided
    if (!pathOrOptions && !options) {
      return { path: "/", opts: {} };
    }

    // Case: pathOrOptions is provided as a string
    if (typeof pathOrOptions === "string") {
      return { path: pathOrOptions, opts: options || {} };
    }

    // Case: pathOrOptions is an object (HttpsOptions), and options is not provided
    if (typeof pathOrOptions !== "string" && !!pathOrOptions && !options) {
      return { path: "/", opts: pathOrOptions };
    }

    // Error case: Invalid combination of arguments
    if (typeof pathOrOptions !== "string" || !options) {
      throw new Error(
        `Invalid argument combination: Expected a string and/or HttpsOptions, got ${typeof pathOrOptions} and ${typeof options}`,
      );
    }

    // Default return, though this point should not be reached
    return { path: "/", opts: {} };
  }

  constructAuth(auth?: EventOptions["auth"], authType?: AuthType): AuthMode {
    if (auth?.admin || auth?.variable) {
      return {
        admin: auth.admin || false,
        variable: auth.variable,
      }; // User is providing the wire auth format already.
    }
    if (authType) {
      switch (authType) {
        case "USER":
          return {
            admin: false,
            variable: {
              uid: auth?.uid ?? "",
              token: auth?.token ?? {},
            },
          };
        case "ADMIN":
          if (auth?.uid || auth?.token) {
            throw new Error("authType and auth are incompatible.");
          }
          return { admin: true };
        case "UNAUTHENTICATED":
          if (auth?.uid || auth?.token) {
            throw new Error("authType and auth are incompatible.");
          }
          return { admin: false };
        default:
          throw new Error(
            "Unrecognized authType, valid values are: " + "ADMIN, USER, and UNAUTHENTICATED",
          );
      }
    }
    if (auth) {
      return {
        admin: false,
        variable: {
          uid: auth.uid ?? "",
          token: auth.token || {},
        },
      };
    }
    // Default to admin
    return { admin: true };
  }

  makeFirestoreValue(input?: unknown) {
    if (
      typeof input === "undefined" ||
      input === null ||
      (typeof input === "object" && Object.keys(input).length === 0)
    ) {
      // Document does not exist.
      return {};
    }
    if (typeof input !== "object") {
      throw new Error("Firestore data must be key-value pairs.");
    }
    const currentTime = new Date().toISOString();
    return {
      fields: encodeFirestoreValue(input),
      createTime: currentTime,
      updateTime: currentTime,
    };
  }

  private requestCallBack<T>(err: unknown, response?: ClientResponse<T>, body?: string | object) {
    if (err) {
      return console.warn("\nERROR SENDING REQUEST: " + err);
    }
    const status = response ? response.status + ", " : "";

    // If the body is a string we want to check if we can parse it as JSON
    // and pretty-print it. We can't blindly stringify because stringifying
    // a string results in some ugly escaping.
    let bodyString = body;
    if (typeof bodyString === "string") {
      try {
        bodyString = JSON.stringify(JSON.parse(bodyString), null, 2);
      } catch (e) {
        // Ignore
      }
    } else {
      bodyString = JSON.stringify(body, null, 2);
    }

    return console.log("\nRESPONSE RECEIVED FROM FUNCTION: " + status + bodyString);
  }

  private isDatabaseFn(eventTrigger: Required<EmulatedTriggerDefinition>["eventTrigger"]) {
    return utils.getFunctionsEventProvider(eventTrigger.eventType) === "Database";
  }
  private isFirestoreFunc(eventTrigger: Required<EmulatedTriggerDefinition>["eventTrigger"]) {
    return utils.getFunctionsEventProvider(eventTrigger.eventType) === "Firestore";
  }

  private isPubsubFunc(eventTrigger: Required<EmulatedTriggerDefinition>["eventTrigger"]) {
    return utils.getFunctionsEventProvider(eventTrigger.eventType) === "PubSub";
  }

  private triggerEvent(data: unknown, opts?: EventOptions) {
    opts = opts || {};
    let operationType;
    let dataPayload;

    if (this.trigger.httpsTrigger) {
      this.controller.call(this.trigger, data || {}, opts);
    } else if (this.trigger.eventTrigger) {
      if (this.isDatabaseFn(this.trigger.eventTrigger)) {
        operationType = utils.last(this.trigger.eventTrigger.eventType.split("."));
        switch (operationType) {
          case "create":
          case "created":
            dataPayload = {
              data: null,
              delta: data,
            };
            break;
          case "delete":
          case "deleted":
            dataPayload = {
              data: data,
              delta: null,
            };
            break;
          default:
            // 'update', 'updated', 'write', or 'written'
            dataPayload = {
              data: (data as any).before,
              delta: (data as any).after,
            };
        }
        const resource =
          this.trigger.eventTrigger.resource ??
          this.trigger.eventTrigger.eventFilterPathPatterns?.ref;
        opts.resource = this.substituteParams(resource!, opts.params);
        opts.auth = this.constructAuth(opts.auth, opts.authType);
        this.controller.call(this.trigger, dataPayload, opts);
      } else if (this.isFirestoreFunc(this.trigger.eventTrigger)) {
        operationType = utils.last(this.trigger.eventTrigger.eventType.split("."));
        switch (operationType) {
          case "create":
          case "created":
            dataPayload = {
              value: this.makeFirestoreValue(data),
              oldValue: {},
            };
            break;
          case "delete":
          case "deleted":
            dataPayload = {
              value: {},
              oldValue: this.makeFirestoreValue(data),
            };
            break;
          default:
            // 'update', 'updated', 'write' or 'written'
            dataPayload = {
              value: this.makeFirestoreValue((data as any).after),
              oldValue: this.makeFirestoreValue((data as any).before),
            };
        }
        const resource =
          this.trigger.eventTrigger.resource ??
          this.trigger.eventTrigger.eventFilterPathPatterns?.document;
        opts.resource = this.substituteParams(resource!, opts.params);
        this.controller.call(this.trigger, dataPayload, opts);
      } else if (this.isPubsubFunc(this.trigger.eventTrigger)) {
        dataPayload = data;
        if (this.trigger.platform === "gcfv2") {
          dataPayload = { message: { ...(data as any), messageId: uuid.v4() } };
        }
        this.controller.call(this.trigger, dataPayload || {}, opts);
      } else {
        this.controller.call(this.trigger, data || {}, opts);
      }
    }
    return "Successfully invoked function.";
  }

  makeFn() {
    if (this.trigger.httpsTrigger) {
      const isCallable = !!this.trigger.labels?.["deployment-callable"];
      if (isCallable) {
        return (data: any, opt: any) => this.constructCallableFunc(data, opt);
      } else {
        return this.constructHttpsFunc();
      }
    } else {
      return (data: any, opt: any) => this.triggerEvent(data, opt);
    }
  }
}

// requestShim is a minimal implementation of the public API of the deprecated `request` package
// We expose it as part of `functions:shell` so that we can keep the previous API while removing
// our dependency on `request`.
interface requestShim extends verbMethods {
  (...args: any): any;
  // TODO(taeold/blidd/joehan) What other methods do we need to add? form? json? multipart?
}

interface verbMethods {
  get(...args: any): any;
  post(...args: any): any;
  put(...args: any): any;
  patch(...args: any): any;
  del(...args: any): any;
  delete(...args: any): any;
  options(...args: any): any;
}

// HttpsOptions is a subset of request's CoreOptions
// https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/request/index.d.ts#L107
// We intentionally omit options that are likely useless for `functions:shell`
type HttpsOptions = {
  method?: "GET" | "PUT" | "POST" | "DELETE" | "PATCH" | "OPTIONS" | "HEAD";
  headers?: Record<string, any>;
  body?: any;
  qs?: any;
};

function toClientVerbOptions(opts: HttpsOptions): ClientVerbOptions {
  return {
    method: opts.method,
    headers: opts.headers,
    queryParams: opts.qs,
  };
}
