import fetch, { Response, RequestInit } from "node-fetch";

import { FirebaseError } from "./error";
import * as logger from "./logger";
import * as responseToError from "./responseToError";

const CLI_VERSION = require("../package.json").version;

type HttpMethod = "GET" | "PUT" | "POST" | "DELETE" | "PATCH";

interface RequestOptions<T> extends VerbOptions<T> {
  method: HttpMethod;
  path: string;
  json?: T;
  responseType?: "json";
}

interface VerbOptions<T> {
  method?: HttpMethod;
  headers?: { [key: string]: string };
  queryParams?: { [key: string]: string | number };
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
      json,
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
      json,
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
  private async request<ReqT, ResT>(
    reqOptions: ClientRequestOptions<ReqT>
  ): Promise<ClientResponse<ResT>> {
    // All requests default to JSON content types.
    if (!reqOptions.responseType) {
      reqOptions.responseType = "json";
    }

    reqOptions = this.addRequestHeaders(reqOptions);

    if (this.opts.auth) {
      reqOptions = await this.addAuthHeader(reqOptions);
    }
    return this.doRequest<ReqT, ResT>(reqOptions);
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
    options: ClientRequestOptions<ReqT>
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

    this.logRequest(options);

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

    this.logResponse(res, body, options);

    if (res.status >= 400) {
      throw responseToError({ statusCode: res.status }, body);
    }

    return {
      status: res.status,
      response: res,
      body,
    };
  }

  private logRequest(fetchOptions: ClientRequestOptions<unknown>): void {
    let searchParamLog = "";
    if (fetchOptions.queryParams) {
      if (!fetchOptions.skipLog?.queryParams) {
        searchParamLog = JSON.stringify(fetchOptions.queryParams);
      } else {
        searchParamLog = "[SEARCH PARAMS OMITTED]";
      }
    }
    const urlLog = `${this.opts.origin}/${this.opts.apiVersion}${fetchOptions.path}`;
    logger.debug("[apiv2] HTTP REQUEST:", fetchOptions.method, urlLog, searchParamLog);
    if (fetchOptions.json) {
      if (!fetchOptions.skipLog?.body) {
        logger.debug("[apiv2] HTTP REQUEST BODY:", JSON.stringify(fetchOptions.json));
      } else {
        logger.debug("[apiv2] HTTP REQUEST BODY OMITTED");
      }
    }
  }

  private logResponse(res: Response, body: unknown, options: ClientRequestOptions<unknown>): void {
    logger.debug("[apiv2] HTTP RESPONSE", res.status);

    if (!options.skipLog?.resBody) {
      logger.debug("[apiv2] HTTP RESPONSE BODY", body);
    }
  }
}
