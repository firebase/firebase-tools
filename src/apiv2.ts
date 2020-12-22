import fetch, { HeadersInit, Response, RequestInit, Headers } from "node-fetch";
import { AbortSignal } from "abort-controller";
import { Readable } from "stream";
import { URLSearchParams } from "url";

import { FirebaseError } from "./error";
import * as logger from "./logger";
import * as responseToError from "./responseToError";

const CLI_VERSION = require("../package.json").version;

export type HttpMethod = "GET" | "PUT" | "POST" | "DELETE" | "PATCH";

interface RequestOptions<T> extends VerbOptions<T> {
  method: HttpMethod;
  path: string;
  body?: T | string | NodeJS.ReadableStream;
  responseType?: "json" | "stream";
  redirect?: "error" | "follow" | "manual";
  signal?: AbortSignal;
}

interface VerbOptions<T> {
  method?: HttpMethod;
  headers?: HeadersInit;
  queryParams?: URLSearchParams | { [key: string]: string | number };
}

interface ClientHandlingOptions {
  skipLog?: {
    queryParams?: boolean;
    body?: boolean;
    resBody?: boolean;
  };
  resolveOnHTTPError?: boolean;
}

export type ClientRequestOptions<T> = RequestOptions<T> & ClientVerbOptions<T>;

interface InternalClientRequestOptions<T> extends ClientRequestOptions<T> {
  headers?: Headers;
}

export type ClientVerbOptions<T> = VerbOptions<T> & ClientHandlingOptions;

export type ClientResponse<T> = {
  status: number;
  response: Response;
  body: T;
};

let accessToken = "";
let refreshToken = "";

/**
 * Sets the refresh token.
 * @param token refresh token.
 */
export function setRefreshToken(token = ""): void {
  refreshToken = token;
}

/**
 * Sets the access token.
 * @param token access token.
 */
export function setAccessToken(token = ""): void {
  accessToken = token;
}

export type ClientOptions = {
  urlPrefix: string;
  apiVersion?: string;
  auth?: boolean;
};

export class Client {
  constructor(private opts: ClientOptions) {
    if (this.opts.auth === undefined) {
      this.opts.auth = true;
    }
    if (this.opts.urlPrefix.endsWith("/")) {
      this.opts.urlPrefix = this.opts.urlPrefix.substring(0, this.opts.urlPrefix.length - 1);
    }
  }

  get<ResT>(path: string, options: ClientVerbOptions<unknown> = {}): Promise<ClientResponse<ResT>> {
    const reqOptions: ClientRequestOptions<unknown> = Object.assign(options, {
      method: "GET",
      path,
    });
    return this.request<unknown, ResT>(reqOptions);
  }

  post<ReqT, ResT>(
    path: string,
    json?: ReqT,
    options: ClientVerbOptions<ReqT> = {}
  ): Promise<ClientResponse<ResT>> {
    const reqOptions: ClientRequestOptions<ReqT> = Object.assign(options, {
      method: "POST",
      path,
      body: json,
    });
    return this.request<ReqT, ResT>(reqOptions);
  }

  patch<ReqT, ResT>(
    path: string,
    json?: ReqT,
    options: ClientVerbOptions<ReqT> = {}
  ): Promise<ClientResponse<ResT>> {
    const reqOptions: ClientRequestOptions<ReqT> = Object.assign(options, {
      method: "PATCH",
      path,
      body: json,
    });
    return this.request<ReqT, ResT>(reqOptions);
  }

  put<ReqT, ResT>(
    path: string,
    json?: ReqT,
    options: ClientVerbOptions<ReqT> = {}
  ): Promise<ClientResponse<ResT>> {
    const reqOptions: ClientRequestOptions<ReqT> = Object.assign(options, {
      method: "PUT",
      path,
      body: json,
    });
    return this.request<ReqT, ResT>(reqOptions);
  }

  delete<ResT>(
    path: string,
    options: ClientVerbOptions<unknown> = {}
  ): Promise<ClientResponse<ResT>> {
    const reqOptions: ClientRequestOptions<unknown> = Object.assign(options, {
      method: "DELETE",
      path,
    });
    return this.request<unknown, ResT>(reqOptions);
  }

  /**
   * Makes a request as specified by the options.
   * By default, this will:
   *   - use content-type: application/json
   *   - assume the HTTP GET method
   *
   * @example
   * const res = apiv2.request<ResourceType>({
   *   method: "POST",
   *   path: "/some/resource",
   *   queryParams: { updateMask: "key" },
   *   json: { name: "resource-name", key: "updated-value" }
   * });
   * // typeof res.body === ResourceType
   *
   * @param reqOptions request options.
   */
  async request<ReqT, ResT>(reqOptions: ClientRequestOptions<ReqT>): Promise<ClientResponse<ResT>> {
    // All requests default to JSON content types.
    if (!reqOptions.responseType) {
      reqOptions.responseType = "json";
    }

    // TODO(bkendall): stream + !resolveOnHTTPError makes for difficult handling.
    //   Figure out if there's a better way to handle streamed >=400 responses.
    if (reqOptions.responseType === "stream" && !reqOptions.resolveOnHTTPError) {
      throw new FirebaseError(
        "apiv2 will not handle HTTP errors while streaming and you must set `resolveOnHTTPError` and check for res.status >= 400 on your own",
        { exit: 2 }
      );
    }

    let internalReqOptions: InternalClientRequestOptions<ReqT> = Object.assign(reqOptions, {
      headers: new Headers(reqOptions.headers),
    });

    internalReqOptions = this.addRequestHeaders(internalReqOptions);

    if (this.opts.auth) {
      internalReqOptions = await this.addAuthHeader(internalReqOptions);
    }
    try {
      return await this.doRequest<ReqT, ResT>(internalReqOptions);
    } catch (err) {
      if (err instanceof FirebaseError) {
        throw err;
      }
      throw new FirebaseError(`Failed to make request: ${err}`, { original: err });
    }
  }

  private addRequestHeaders<T>(
    reqOptions: InternalClientRequestOptions<T>
  ): InternalClientRequestOptions<T> {
    if (!reqOptions.headers) {
      reqOptions.headers = new Headers();
    }
    reqOptions.headers.set("Connection", "keep-alive");
    reqOptions.headers.set("User-Agent", `FirebaseCLI/${CLI_VERSION}`);
    reqOptions.headers.set("X-Client-Version", `FirebaseCLI/${CLI_VERSION}`);
    if (reqOptions.responseType === "json") {
      reqOptions.headers.set("Content-Type", "application/json");
    }
    return reqOptions;
  }

  private async addAuthHeader<T>(
    reqOptions: InternalClientRequestOptions<T>
  ): Promise<InternalClientRequestOptions<T>> {
    if (!reqOptions.headers) {
      reqOptions.headers = new Headers();
    }
    const token = await this.getAccessToken();
    reqOptions.headers.set("Authorization", `Bearer ${token}`);
    return reqOptions;
  }

  private async getAccessToken(): Promise<string> {
    // Runtime fetch of Auth singleton to prevent circular module dependencies
    if (accessToken) {
      return accessToken;
    }
    const data = await require("./auth").getAccessToken(refreshToken, []);
    return data.access_token;
  }

  private requestURL(options: InternalClientRequestOptions<unknown>): string {
    const versionPath = this.opts.apiVersion ? `/${this.opts.apiVersion}` : "";
    return `${this.opts.urlPrefix}${versionPath}${options.path}`;
  }

  private async doRequest<ReqT, ResT>(
    options: InternalClientRequestOptions<ReqT>
  ): Promise<ClientResponse<ResT>> {
    if (!options.path.startsWith("/")) {
      options.path = "/" + options.path;
    }

    let fetchURL = this.requestURL(options);
    if (options.queryParams) {
      if (!(options.queryParams instanceof URLSearchParams)) {
        const sp = new URLSearchParams();
        for (const key of Object.keys(options.queryParams)) {
          const value = options.queryParams[key];
          sp.append(key, `${value}`);
        }
        options.queryParams = sp;
      }
      const queryString = options.queryParams.toString();
      if (queryString) {
        fetchURL += `?${queryString}`;
      }
    }

    const fetchOptions: RequestInit = {
      headers: options.headers,
      method: options.method,
      redirect: options.redirect,
      signal: options.signal,
    };

    if (typeof options.body === "string" || isStream(options.body)) {
      fetchOptions.body = options.body;
    } else if (options.body !== undefined) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    this.logRequest(options);

    let res: Response;
    try {
      res = await fetch(fetchURL, fetchOptions);
    } catch (err) {
      throw new FirebaseError(`Failed to make request to ${fetchURL}`, { original: err });
    }

    let body: ResT;
    if (options.responseType === "json") {
      // 204 statuses have no content. Don't try to `json` it.
      if (res.status === 204) {
        body = (undefined as unknown) as ResT;
      } else {
        body = await res.json();
      }
    } else if (options.responseType === "stream") {
      body = (res.body as unknown) as ResT;
    } else {
      throw new FirebaseError(`Unable to interpret response. Please set responseType.`, {
        exit: 2,
      });
    }

    this.logResponse(res, body, options);

    if (res.status >= 400) {
      if (!options.resolveOnHTTPError) {
        throw responseToError({ statusCode: res.status }, body);
      }
    }

    return {
      status: res.status,
      response: res,
      body,
    };
  }

  private logRequest(options: InternalClientRequestOptions<unknown>): void {
    let queryParamsLog = "[none]";
    if (options.queryParams) {
      queryParamsLog = "[omitted]";
      if (!options.skipLog?.queryParams) {
        queryParamsLog =
          options.queryParams instanceof URLSearchParams
            ? options.queryParams.toString()
            : JSON.stringify(options.queryParams);
      }
    }
    const logURL = this.requestURL(options);
    logger.debug(`>>> [apiv2][query] ${options.method} ${logURL} ${queryParamsLog}`);
    if (options.body !== undefined) {
      let logBody = "[omitted]";
      if (!options.skipLog?.body) {
        logBody = bodyToString(options.body);
      }
      logger.debug(`>>> [apiv2][body] ${options.method} ${logURL} ${logBody}`);
    }
  }

  private logResponse(
    res: Response,
    body: unknown,
    options: InternalClientRequestOptions<unknown>
  ): void {
    const logURL = this.requestURL(options);
    logger.debug(`<<< [apiv2][status] ${options.method} ${logURL} ${res.status}`);
    let logBody = "[omitted]";
    if (!options.skipLog?.resBody) {
      logBody = bodyToString(body);
    }
    logger.debug(`<<< [apiv2][body] ${options.method} ${logURL} ${logBody}`);
  }
}

function bodyToString(body: unknown): string {
  if (isStream(body)) {
    // Don't attempt to read any stream type, in case the caller needs it.
    return "[stream]";
  } else {
    try {
      return JSON.stringify(body);
    } catch (_) {
      return `${body}`;
    }
  }
}

function isStream(o: unknown): o is NodeJS.ReadableStream {
  return o instanceof Readable;
}
