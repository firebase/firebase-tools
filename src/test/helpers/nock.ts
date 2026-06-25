/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { MockAgent, setGlobalDispatcher, fetch as undiciFetch } from "undici";

let originalFetch: unknown = undefined;

let mockAgent: MockAgent = new MockAgent();
mockAgent.disableNetConnect();
setGlobalDispatcher(mockAgent);

function resetMockAgent() {
  if (mockAgent) {
    mockAgent.close().catch(() => {});
  }
  mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
}

type ReplyCallback = (this: any, uri: any, body: any, callback?: any) => any;
type BodyCallback = (body: any) => boolean;
type PathCallback = (uri: any) => boolean;

class NockInterceptor {
  private queryObj?: any;
  private persistFlag = false;
  private timesVal = 1;
  private delayVal = 0;
  private scope?: any;

  constructor(
    private clientWrapper: NockClient,
    private client: any,
    private options: { path: any; method: string; body?: any; options?: any },
  ) {
    clientWrapper.registerInterceptor(this);
    if (clientWrapper.isPersistent()) {
      this.persistFlag = true;
    }
  }

  query(q: any) {
    this.queryObj = q;
    return this;
  }

  persist() {
    this.persistFlag = true;
    return this;
  }

  times(t: number) {
    this.timesVal = t;
    return this;
  }

  once() {
    this.timesVal = 1;
    return this;
  }

  twice() {
    this.timesVal = 2;
    return this;
  }

  delay(ms: number) {
    this.delayVal = ms;
    return this;
  }

  matchHeader(_name: string, _value: any) {
    void _name;
    void _value;
    return this;
  }

  done() {
    // No-op
  }

  isDone() {
    if (!this.scope) {
      return true;
    }
    const symbols = Object.getOwnPropertySymbols(this.scope);
    const kMockDispatch = symbols.find((s) => s.toString() === "Symbol(mock dispatch)");
    if (kMockDispatch) {
      const dispatch = this.scope[kMockDispatch];
      return !!dispatch.consumed;
    }
    return true;
  }

  private getInterceptOptions(): any {
    let path = this.options.path;
    let queryObj = this.queryObj;

    if (typeof path === "string" && path.includes("?")) {
      try {
        const url = new URL(path, "http://localhost");
        path = url.pathname;
        const queryParams: Record<string, string> = {};
        url.searchParams.forEach((val, key) => {
          queryParams[key] = val;
        });
        queryObj = queryParams;
      } catch {
        // Fallback to original path if parsing fails
      }
    }

    if ((queryObj === undefined || queryObj === true) && typeof path === "string") {
      path = new RegExp("^" + escapeRegExp(path) + "(\\?|$)");
    }

    let interceptPath = path;
    if (queryObj !== undefined && queryObj !== true) {
      const expectedPath = path;
      const expectedQuery = queryObj;
      interceptPath = (incomingPath: string) => {
        try {
          const url = new URL(incomingPath, "http://localhost");
          if (expectedPath instanceof RegExp) {
            if (!expectedPath.test(url.pathname)) {
              return false;
            }
          } else if (typeof expectedPath === "string") {
            if (url.pathname !== expectedPath) {
              return false;
            }
          } else if (typeof expectedPath === "function") {
            if (!expectedPath(url.pathname)) {
              return false;
            }
          }

          const actualQuery: Record<string, string | string[]> = {};
          url.searchParams.forEach((val, key) => {
            if (key in actualQuery) {
              const prev = actualQuery[key];
              if (Array.isArray(prev)) {
                prev.push(val);
              } else {
                actualQuery[key] = [prev, val];
              }
            } else {
              actualQuery[key] = val;
            }
          });
          if (typeof expectedQuery === "function") {
            return !!expectedQuery(actualQuery);
          }

          const compareValues = (expected: any, actual: any): boolean => {
            if (Array.isArray(expected)) {
              const actualArr = Array.isArray(actual) ? actual : [actual];
              if (expected.length !== actualArr.length) {
                return false;
              }
              const sortedExpected = [...expected].map(String).sort();
              const sortedActual = [...actualArr].map(String).sort();
              for (let i = 0; i < sortedExpected.length; i++) {
                if (sortedExpected[i] !== sortedActual[i]) {
                  return false;
                }
              }
              return true;
            } else {
              if (Array.isArray(actual)) {
                return false;
              }
              return String(expected) === String(actual);
            }
          };

          for (const key of Object.keys(expectedQuery)) {
            const expectedVal = expectedQuery[key];
            const actualVal = actualQuery[key];
            if (!compareValues(expectedVal, actualVal)) {
              return false;
            }
          }

          for (const key of Object.keys(actualQuery)) {
            if (!(key in expectedQuery)) {
              return false;
            }
          }

          return true;
        } catch {
          return false;
        }
      };
    }

    const interceptOptions: any = {
      path: interceptPath,
      method: this.options.method,
    };
    const isAnyStream = (body: any) => {
      return !!(
        body &&
        (typeof body.pipe === "function" ||
          typeof body.on === "function" ||
          typeof body.getReader === "function" ||
          typeof body.pipeTo === "function" ||
          (typeof globalThis.ReadableStream !== "undefined" &&
            body instanceof globalThis.ReadableStream))
      );
    };
    const normalizeBody = (body: any) => {
      if (body && typeof body.toString === "function" && Buffer.isBuffer(body)) {
        return body.toString("utf8");
      }
      return body;
    };

    if (this.options.body !== undefined) {
      let interceptBody = this.options.body;
      if (typeof interceptBody === "function") {
        interceptBody = (body: any) => {
          body = normalizeBody(body);
          if (isAnyStream(body)) {
            return true;
          }
          try {
            const parsed = JSON.parse(body);
            return !!(this.options.body as BodyCallback)(parsed);
          } catch {
            return !!(this.options.body as BodyCallback)(body);
          }
        };
      } else if (interceptBody !== null && typeof interceptBody === "object") {
        if (isAnyStream(interceptBody)) {
          interceptBody = (body: any) => {
            void body;
            return true;
          };
        } else {
          const expectedObj = interceptBody;
          interceptBody = (body: any) => {
            body = normalizeBody(body);
            if (isAnyStream(body)) {
              return true;
            }
            try {
              const parsed = JSON.parse(body);
              return deepEqual(parsed, expectedObj);
            } catch {
              return false;
            }
          };
        }
      } else if (typeof interceptBody === "string") {
        const expectedStr = interceptBody;
        interceptBody = (body: any) => {
          body = normalizeBody(body);
          if (isAnyStream(body)) {
            return true;
          }
          return body === expectedStr;
        };
      }
      interceptOptions.body = interceptBody;
    }

    if (this.options.options?.reqheaders) {
      interceptOptions.headers = this.options.options.reqheaders;
    }
    return interceptOptions;
  }

  reply(callback: ReplyCallback): NockClient;
  reply(
    statusCode: number,
    responseBody?: ReplyCallback | Record<string, any> | string | number | boolean | any[] | null,
    headers?: any,
  ): NockClient;
  reply(statusCode: any, responseBody?: any, headers?: any) {
    const interceptOptions = this.getInterceptOptions();
    const interceptor = this.client.intercept(interceptOptions);
    let scope: any;

    if (typeof statusCode === "function") {
      scope = interceptor.reply((opts: any) => {
        const context = {
          req: {
            headers: opts.headers || {},
            method: opts.method,
            path: opts.path,
          },
        };
        const parsedBody = parseBodyIfNeeded(opts.body);
        const result = (statusCode as ReplyCallback).call(context, opts.path, parsedBody);
        if (Array.isArray(result)) {
          return {
            statusCode: result[0],
            data: result[1] === undefined ? "" : result[1],
            responseOptions: { headers: result[2] },
          };
        }
        return {
          statusCode: 200,
          data: result === undefined ? "" : result,
        };
      });
    } else if (typeof responseBody === "function") {
      scope = interceptor.reply((opts: any) => {
        const parsedBody = parseBodyIfNeeded(opts.body);
        const result = (responseBody as ReplyCallback)(opts.path, parsedBody);
        if (Array.isArray(result)) {
          return {
            statusCode: result[0],
            data: result[1] === undefined ? "" : result[1],
            responseOptions: { headers: result[2] },
          };
        }
        return {
          statusCode,
          data: result === undefined ? "" : result,
          responseOptions: { headers },
        };
      });
    } else {
      scope = interceptor.reply(statusCode, responseBody, { headers });
    }

    if (this.persistFlag) {
      scope.persist();
    } else if (this.timesVal > 1) {
      scope.times(this.timesVal);
    }
    if (this.delayVal > 0) {
      scope.delay(this.delayVal);
    }

    this.scope = scope;
    return this.clientWrapper;
  }

  replyWithError(error: any) {
    const interceptOptions = this.getInterceptOptions();
    const interceptor = this.client.intercept(interceptOptions);
    let err: Error;
    if (error instanceof Error) {
      err = error;
    } else if (typeof error === "object" && error !== null) {
      err = new Error(error.message || "");
      Object.assign(err, error);
    } else {
      err = new Error(String(error));
    }
    const scope = interceptor.replyWithError(err);

    if (this.persistFlag) {
      scope.persist();
    } else if (this.timesVal > 1) {
      scope.times(this.timesVal);
    }
    if (this.delayVal > 0) {
      scope.delay(this.delayVal);
    }

    this.scope = scope;
    return this.clientWrapper;
  }
}

class NockClient {
  private client: any;
  private persistFlag = false;
  private interceptors: NockInterceptor[] = [];
  private host: string;

  constructor(host: string) {
    let urlString = host;
    if (!host.startsWith("http://") && !host.startsWith("https://")) {
      urlString = "https://" + host;
    }
    const parsed = new URL(urlString);
    this.host = parsed.origin;
    this.client = mockAgent.get(this.host);
  }

  getHost() {
    return this.host;
  }

  registerInterceptor(interceptor: NockInterceptor) {
    this.interceptors.push(interceptor);
  }

  isPersistent() {
    return this.persistFlag;
  }

  persist() {
    this.persistFlag = true;
    return this;
  }

  matchHeader(name: string, value: any) {
    void name;
    void value;
    return this;
  }

  done() {
    // No-op
  }

  isDone() {
    if (this.interceptors.length === 0) {
      return true;
    }
    return this.interceptors.every((i) => i.isDone());
  }

  get(path: PathCallback | string | RegExp, options?: any) {
    return new NockInterceptor(this, this.client, { path, method: "GET", options });
  }

  post(
    path: PathCallback | string | RegExp,
    body?: BodyCallback | Record<string, any> | string | any[] | null,
    options?: any,
  ) {
    return new NockInterceptor(this, this.client, { path, method: "POST", body, options });
  }

  put(
    path: PathCallback | string | RegExp,
    body?: BodyCallback | Record<string, any> | string | any[] | null,
    options?: any,
  ) {
    return new NockInterceptor(this, this.client, { path, method: "PUT", body, options });
  }

  patch(
    path: PathCallback | string | RegExp,
    body?: BodyCallback | Record<string, any> | string | any[] | null,
    options?: any,
  ) {
    return new NockInterceptor(this, this.client, { path, method: "PATCH", body, options });
  }

  delete(path: PathCallback | string | RegExp, options?: any) {
    return new NockInterceptor(this, this.client, { path, method: "DELETE", options });
  }
}

function nock(host: string, options?: any): NockClient {
  void options;
  if (originalFetch === undefined) {
    originalFetch = globalThis.fetch;
    globalThis.fetch = undiciFetch as any;
  }
  return new NockClient(host);
}

namespace nock {
  export type Body = any;
  export type ReplyFnContext = any;
  export type ReplyFnResult = any;

  export function cleanAll() {
    resetMockAgent();
    if (originalFetch !== undefined) {
      globalThis.fetch = originalFetch;
      originalFetch = undefined;
    }
  }

  export function isDone() {
    try {
      mockAgent.assertNoPendingInterceptors();
      return true;
    } catch {
      return false;
    }
  }

  export function disableNetConnect() {
    mockAgent.disableNetConnect();
  }

  export function enableNetConnect() {
    mockAgent.enableNetConnect();
  }

  export function pendingMocks() {
    return [];
  }
}

export default nock;

function deepEqual(a: any, b: any): boolean {
  if (b instanceof RegExp) {
    return b.test(String(a));
  }
  if (a instanceof RegExp) {
    return a.test(String(b));
  }
  if (a === b) return true;
  if (a && b && typeof a === "object" && typeof b === "object") {
    if (a.constructor !== b.constructor) return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!deepEqual(a[i], b[i])) return false;
      }
      return true;
    }
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}

function parseBodyIfNeeded(body: any): any {
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  if (body && (body instanceof Uint8Array || Buffer.isBuffer(body))) {
    const str = new TextDecoder().decode(body);
    try {
      return JSON.parse(str);
    } catch {
      return str;
    }
  }
  return body;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
