import * as request from "request";

import { encodeFirestoreValue } from "./firestore/encodeFirestoreValue";
import * as utils from "./utils";
import { EmulatedTriggerDefinition } from "./emulator/functionsEmulatorShared";
import { FunctionsEmulatorShell } from "./emulator/functionsEmulatorShell";
import { AuthMode } from "./emulator/events/types";

/**
 * @class
 * @this LocalFunction
 * @param {object} trigger
 * @param {object=} urls
 * @param {object=} controller
 */
export default class LocalFunctionClass {
  private url?: string;

  constructor(
    private trigger: EmulatedTriggerDefinition,
    urls: Record<string, string>,
    private controller: FunctionsEmulatorShell
  ) {
    this.url = urls[trigger.id];
  }

  private substituteParams(resource: string, params: Record<string, string>) {
    const wildcardRegex = new RegExp("{[^/{}]*}", "g");
    return resource.replace(wildcardRegex, (wildcard: string) => {
      const wildcardNoBraces = wildcard.slice(1, -1); // .slice removes '{' and '}' from wildcard
      const sub = params?.[wildcardNoBraces];
      return sub || wildcardNoBraces + utils.randomInt(1, 9);
    });
  }
  private constructCallableFunc(data: any, opts: any) {
    opts = opts || {};

    const headers: Record<string, string> = {};
    if (opts.instanceIdToken) {
      headers["Firebase-Instance-ID-Token"] = opts.instanceIdToken;
    }

    return request.post({
      callback: (...args) => this.requestCallBack(...args),
      baseUrl: this.url,
      uri: "",
      body: { data: data },
      json: true,
      headers: headers,
    });
  }

  constructAuth(
    authType: "USER" | "ADMIN" | "UNAUTHENTICATED",
    auth?: AuthMode & { uid?: string; token?: object }
  ): AuthMode {
    if (auth?.admin || auth?.variable) {
      return auth; // User is providing the wire auth format already.
    }
    if (typeof authType !== "undefined") {
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
            "Unrecognized authType, valid values are: " + "ADMIN, USER, and UNAUTHENTICATED"
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

  makeFirestoreValue(input?: any) {
    if (typeof input === "undefined" || input === null || Object.keys(input).length === 0) {
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

  private requestCallBack(err: unknown, response: request.Response, body: string | object) {
    if (err) {
      return console.warn("\nERROR SENDING REQUEST: " + err);
    }
    const status = response ? response.statusCode + ", " : "";

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

  private triggerEvent(data: any, opts: any) {
    opts = opts || {};
    let operationType;
    let dataPayload;

    if (this.trigger.httpsTrigger) {
      this.controller.call(this.trigger.name, data || {}, opts);
    } else if (this.trigger.eventTrigger) {
      if (this.isDatabaseFn(this.trigger.eventTrigger)) {
        operationType = utils.last(this.trigger.eventTrigger.eventType.split("."));
        switch (operationType) {
          case "create":
            dataPayload = {
              data: null,
              delta: data,
            };
            break;
          case "delete":
            dataPayload = {
              data: data,
              delta: null,
            };
            break;
          default:
            // 'update' or 'write'
            dataPayload = {
              data: data.before,
              delta: data.after,
            };
        }
        opts.resource = this.substituteParams(this.trigger.eventTrigger.resource!, opts.params);
        opts.auth = this.constructAuth(opts.authType, opts.auth);
        this.controller.call(this.trigger.name, dataPayload, opts);
      } else if (this.isFirestoreFunc(this.trigger.eventTrigger)) {
        operationType = utils.last(this.trigger.eventTrigger.eventType.split("."));
        switch (operationType) {
          case "create":
            dataPayload = {
              value: this.makeFirestoreValue(data),
              oldValue: {},
            };
            break;
          case "delete":
            dataPayload = {
              value: {},
              oldValue: this.makeFirestoreValue(data),
            };
            break;
          default:
            // 'update' or 'write'
            dataPayload = {
              value: this.makeFirestoreValue(data.after),
              oldValue: this.makeFirestoreValue(data.before),
            };
        }
        opts.resource = this.substituteParams(this.trigger.eventTrigger.resource!, opts.params);
        this.controller.call(this.trigger.name, dataPayload, opts);
      } else {
        this.controller.call(this.trigger.name, data || {}, opts);
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
        return request.defaults({
          callback: (...args) => this.requestCallBack(...args),
          baseUrl: this.url,
          uri: "",
        });
      }
    } else {
      return (data: any, opt: any) => this.triggerEvent(data, opt);
    }
  }
}
