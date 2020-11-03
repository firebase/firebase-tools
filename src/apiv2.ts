import fetch, { Response, RequestInit } from "node-fetch";

import { FirebaseError } from "./error";
import * as logger from "./logger";
import * as responseToError from "./responseToError";

const CLI_VERSION = require("../package.json").version;

type ClientRequestOptions<T> = {
  method?: "GET" | "PUT" | "POST" | "DELETE" | "PATCH";
  path: string;
  headers?: { [key: string]: string };
  json?: T;
  responseType?: "json";
  queryParams?: { [key: string]: string | number };
};

export type ClientRequestHandlingOptions = {
  log?: {
    queryParams?: boolean;
    body?: boolean;
    resBody?: boolean;
  };
  resolveOnHTTPError?: boolean;
};

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
  origin: string;
  apiVersion: string;
  auth: boolean;
};

export class Client {
  constructor(private opts: ClientOptions) {
    if (this.opts.auth === undefined) {
      this.opts.auth = true;
    }
  }

  get<ResT>(
    options: ClientRequestOptions<unknown> | string,
    handlingOptions: ClientRequestHandlingOptions = {}
  ): Promise<ClientResponse<ResT>> {
    if (typeof options === "string") {
      options = { path: options };
    }
    options.method = "GET";
    return this.request<unknown, ResT>(options, handlingOptions);
  }

  post<ReqT, ResT>(
    options: ClientRequestOptions<ReqT> | string,
    handlingOptions: ClientRequestHandlingOptions = {}
  ): Promise<ClientResponse<ResT>> {
    if (typeof options === "string") {
      options = { path: options };
    }
    options.method = "POST";
    return this.request<ReqT, ResT>(options, handlingOptions);
  }

  patch<ReqT, ResT>(
    options: ClientRequestOptions<ReqT> | string,
    handlingOptions: ClientRequestHandlingOptions = {}
  ): Promise<ClientResponse<ResT>> {
    if (typeof options === "string") {
      options = { path: options };
    }
    options.method = "PATCH";
    return this.request<ReqT, ResT>(options, handlingOptions);
  }

  delete<ResT>(
    options: ClientRequestOptions<unknown> | string,
    handlingOptions: ClientRequestHandlingOptions = {}
  ): Promise<ClientResponse<ResT>> {
    if (typeof options === "string") {
      options = { path: options };
    }
    options.method = "DELETE";
    return this.request<unknown, ResT>(options, handlingOptions);
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
   * @param handlingOptions specific handling options about the request (logging,
   *   auth, etc).
   */
  private async request<ReqT, ResT>(
    reqOptions: ClientRequestOptions<ReqT>,
    handlingOptions: ClientRequestHandlingOptions
  ): Promise<ClientResponse<ResT>> {
    if (!reqOptions.method) {
      reqOptions.method = "GET";
    }

    if (!reqOptions.path) {
      throw new FirebaseError("Will not make a request to an undefined path.", { exit: 2 });
    }

    // All requests default to JSON content types.
    if (!reqOptions.responseType) {
      reqOptions.responseType = "json";
    }

    reqOptions = this.addRequestHeaders(reqOptions);

    if (this.opts.auth) {
      reqOptions = await this.addAuthHeader(reqOptions);
    }
    return this.doRequest<ReqT, ResT>(reqOptions, handlingOptions);
  }

  private addRequestHeaders<T>(reqOptions: ClientRequestOptions<T>): ClientRequestOptions<T> {
    if (!reqOptions.headers) {
      reqOptions.headers = {};
    }
    reqOptions.headers["Connection"] = "keep-alive";
    reqOptions.headers["User-Agent"] = `FirebaseCLI/${CLI_VERSION}`;
    reqOptions.headers["X-Client-Version"] = `FirebaseCLI/${CLI_VERSION}`;
    if (reqOptions.responseType === "json") {
      reqOptions.headers["Content-Type"] = "application/json";
    }
    return reqOptions;
  }

  private async addAuthHeader<T>(
    reqOptions: ClientRequestOptions<T>
  ): Promise<ClientRequestOptions<T>> {
    if (!reqOptions.headers) {
      reqOptions.headers = {};
    }
    const token = await this.getAccessToken();
    reqOptions.headers["Authorization"] = `Bearer ${token}`;
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

  private async doRequest<ReqT, ResT>(
    options: ClientRequestOptions<ReqT>,
    handlingOptions: ClientRequestHandlingOptions
  ): Promise<ClientResponse<ResT>> {
    if (!options.path.startsWith("/")) {
      options.path = "/" + options.path;
    }
    if (this.opts.origin.endsWith("/")) {
      this.opts.origin.substring(0, this.opts.origin.length - 1);
    }

    let fetchURL = `${this.opts.origin}/${this.opts.apiVersion}${options.path}`;
    if (options.queryParams) {
      // TODO(bkendall): replace this half-hearted implementation with
      // URLSearchParams when on node >= 10.
      const sp: string[] = [];
      for (const key of Object.keys(options.queryParams)) {
        const value = options.queryParams[key];
        sp.push(`${key}=${encodeURIComponent(value)}`);
      }
      if (sp.length) {
        fetchURL += "?" + sp.join("&");
      }
    }

    const fetchOptions: RequestInit = {
      headers: options.headers,
      method: options.method,
    };

    if (options.json) {
      fetchOptions.body = JSON.stringify(options.json);
    }

    this.logRequest(options, handlingOptions);

    let res: Response;
    try {
      res = await fetch(fetchURL, fetchOptions);
    } catch (err) {
      throw new FirebaseError(`Failed to make request to ${fetchURL}`, { original: err });
    }

    let body: ResT;
    if (options.responseType === "json") {
      body = await res.json();
    } else {
      // This is how the linter wants the casting to T to work.
      body = ((await res.text()) as unknown) as ResT;
    }

    this.logResponse(res, body, handlingOptions);

    if (res.status >= 400) {
      throw responseToError({ statusCode: res.status }, body);
    }

    return {
      status: res.status,
      response: res,
      body,
    };
  }

  private logRequest(
    fetchOptions: ClientRequestOptions<unknown>,
    handlingOptions: ClientRequestHandlingOptions
  ): void {
    let searchParamLog = "";
    if (fetchOptions.queryParams) {
      if (handlingOptions.log?.queryParams) {
        searchParamLog = JSON.stringify(fetchOptions.queryParams);
      } else {
        searchParamLog = "[SEARCH PARAMS OMITTED]";
      }
    }
    logger.debug(
      "[apiv2] HTTP REQUEST:",
      fetchOptions.method,
      `${this.opts.origin}${fetchOptions.path}`,
      searchParamLog
    );
    if (fetchOptions.json) {
      if (handlingOptions.log?.body) {
        logger.debug("[apiv2] HTTP REQUEST BODY:", JSON.stringify(fetchOptions.json));
      } else {
        logger.debug("[apiv2] HTTP REQUEST BODY OMITTED");
      }
    }
  }

  private logResponse(
    res: Response,
    body: unknown,
    handlingOptions: ClientRequestHandlingOptions
  ): void {
    logger.debug("[apiv2] HTTP RESPONSE", res.status, res.headers);

    if (handlingOptions.log?.resBody) {
      logger.debug("[apiv2] HTTP RESPONSE BODY", body);
    }
  }
}
