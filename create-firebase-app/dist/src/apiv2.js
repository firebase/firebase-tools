"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Client = exports.getAccessToken = exports.setAccessToken = exports.setRefreshToken = exports.STANDARD_HEADERS = void 0;
const url_1 = require("url");
const stream_1 = require("stream");
const proxy_agent_1 = require("proxy-agent");
const retry = require("retry");
const abort_controller_1 = require("abort-controller");
const node_fetch_1 = require("node-fetch");
const util_1 = require("util");
const auth = require("./auth");
const error_1 = require("./error");
const logger_1 = require("./logger");
const responseToError_1 = require("./responseToError");
const FormData = require("form-data");
// Using import would require resolveJsonModule, which seems to break the
// build/output format.
const pkg = require("../package.json");
const CLI_VERSION = pkg.version;
exports.STANDARD_HEADERS = {
    Connection: "keep-alive",
    "User-Agent": `FirebaseCLI/${CLI_VERSION}`,
    "X-Client-Version": `FirebaseCLI/${CLI_VERSION}`,
};
const GOOG_QUOTA_USER_HEADER = "x-goog-quota-user";
const GOOG_USER_PROJECT_HEADER = "x-goog-user-project";
const GOOGLE_CLOUD_QUOTA_PROJECT = process.env.GOOGLE_CLOUD_QUOTA_PROJECT;
let accessToken = "";
let refreshToken = "";
/**
 * Sets the refresh token.
 * @param token refresh token.
 */
function setRefreshToken(token = "") {
    refreshToken = token;
}
exports.setRefreshToken = setRefreshToken;
/**
 * Sets the access token.
 * @param token access token.
 */
function setAccessToken(token = "") {
    accessToken = token;
}
exports.setAccessToken = setAccessToken;
/**
 * Gets a singleton access token
 * @returns An access token
 */
async function getAccessToken() {
    const valid = auth.haveValidTokens(refreshToken, []);
    const usingADC = !auth.loggedIn();
    if (accessToken && (valid || usingADC)) {
        return accessToken;
    }
    const data = await auth.getAccessToken(refreshToken, []);
    return data.access_token;
}
exports.getAccessToken = getAccessToken;
function proxyURIFromEnv() {
    return (process.env.HTTPS_PROXY ||
        process.env.https_proxy ||
        process.env.HTTP_PROXY ||
        process.env.http_proxy ||
        undefined);
}
class Client {
    constructor(opts) {
        this.opts = opts;
        if (this.opts.auth === undefined) {
            this.opts.auth = true;
        }
        if (this.opts.urlPrefix.endsWith("/")) {
            this.opts.urlPrefix = this.opts.urlPrefix.substring(0, this.opts.urlPrefix.length - 1);
        }
    }
    get(path, options = {}) {
        const reqOptions = Object.assign(options, {
            method: "GET",
            path,
        });
        return this.request(reqOptions);
    }
    post(path, json, options = {}) {
        const reqOptions = Object.assign(options, {
            method: "POST",
            path,
            body: json,
        });
        return this.request(reqOptions);
    }
    patch(path, json, options = {}) {
        const reqOptions = Object.assign(options, {
            method: "PATCH",
            path,
            body: json,
        });
        return this.request(reqOptions);
    }
    put(path, json, options = {}) {
        const reqOptions = Object.assign(options, {
            method: "PUT",
            path,
            body: json,
        });
        return this.request(reqOptions);
    }
    delete(path, options = {}) {
        const reqOptions = Object.assign(options, {
            method: "DELETE",
            path,
        });
        return this.request(reqOptions);
    }
    options(path, options = {}) {
        const reqOptions = Object.assign(options, {
            method: "OPTIONS",
            path,
        });
        return this.request(reqOptions);
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
     * @param reqOptions request options.
     * @return the response.
     */
    async request(reqOptions) {
        // All requests default to JSON content types.
        if (!reqOptions.responseType) {
            reqOptions.responseType = "json";
        }
        // TODO(bkendall): stream + !resolveOnHTTPError makes for difficult handling.
        //   Figure out if there's a better way to handle streamed >=400 responses.
        if (reqOptions.responseType === "stream" && !reqOptions.resolveOnHTTPError) {
            throw new error_1.FirebaseError("apiv2 will not handle HTTP errors while streaming and you must set `resolveOnHTTPError` and check for res.status >= 400 on your own", { exit: 2 });
        }
        let internalReqOptions = Object.assign(reqOptions, {
            headers: new node_fetch_1.Headers(reqOptions.headers),
        });
        internalReqOptions = this.addRequestHeaders(internalReqOptions);
        if (this.opts.auth) {
            internalReqOptions = await this.addAuthHeader(internalReqOptions);
        }
        try {
            return await this.doRequest(internalReqOptions);
        }
        catch (thrown) {
            if (thrown instanceof error_1.FirebaseError) {
                throw thrown;
            }
            // Though it should never happen in practice, a non-Error type can be thrown
            let err;
            if (thrown instanceof Error) {
                err = thrown;
            }
            else {
                err = new Error(thrown);
            }
            throw new error_1.FirebaseError(`Failed to make request: ${err.message}`, { original: err });
        }
    }
    addRequestHeaders(reqOptions) {
        if (!reqOptions.headers) {
            reqOptions.headers = new node_fetch_1.Headers();
        }
        for (const [h, v] of Object.entries(exports.STANDARD_HEADERS)) {
            if (!reqOptions.headers.has(h)) {
                reqOptions.headers.set(h, v);
            }
        }
        if (!reqOptions.headers.has("Content-Type")) {
            if (reqOptions.responseType === "json") {
                reqOptions.headers.set("Content-Type", "application/json");
            }
        }
        if (!reqOptions.ignoreQuotaProject &&
            GOOGLE_CLOUD_QUOTA_PROJECT &&
            GOOGLE_CLOUD_QUOTA_PROJECT !== "") {
            reqOptions.headers.set(GOOG_USER_PROJECT_HEADER, GOOGLE_CLOUD_QUOTA_PROJECT);
        }
        return reqOptions;
    }
    async addAuthHeader(reqOptions) {
        if (!reqOptions.headers) {
            reqOptions.headers = new node_fetch_1.Headers();
        }
        let token;
        if (isLocalInsecureRequest(this.opts.urlPrefix)) {
            token = "owner";
        }
        else {
            token = await getAccessToken();
        }
        reqOptions.headers.set("Authorization", `Bearer ${token}`);
        return reqOptions;
    }
    requestURL(options) {
        const versionPath = this.opts.apiVersion ? `/${this.opts.apiVersion}` : "";
        return `${this.opts.urlPrefix}${versionPath}${options.path}`;
    }
    async doRequest(options) {
        var _a;
        if (!options.path.startsWith("/")) {
            options.path = "/" + options.path;
        }
        let fetchURL = this.requestURL(options);
        if (options.queryParams) {
            if (!(options.queryParams instanceof url_1.URLSearchParams)) {
                const sp = new url_1.URLSearchParams();
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
        const fetchOptions = {
            headers: options.headers,
            method: options.method,
            redirect: options.redirect,
            compress: options.compress,
        };
        if (proxyURIFromEnv()) {
            fetchOptions.agent = new proxy_agent_1.ProxyAgent();
        }
        if (options.signal) {
            fetchOptions.signal = options.signal;
        }
        let reqTimeout;
        if (options.timeout) {
            const controller = new abort_controller_1.default();
            reqTimeout = setTimeout(() => {
                controller.abort();
            }, options.timeout);
            fetchOptions.signal = controller.signal;
        }
        if (typeof options.body === "string" || isStream(options.body)) {
            fetchOptions.body = options.body;
        }
        else if (options.body !== undefined) {
            fetchOptions.body = JSON.stringify(options.body);
        }
        // TODO(bkendall): Refactor this to use Throttler _or_ refactor Throttle to use `retry`.
        const operationOptions = {
            retries: ((_a = options.retryCodes) === null || _a === void 0 ? void 0 : _a.length) ? 1 : 2,
            minTimeout: 1 * 1000,
            maxTimeout: 5 * 1000,
        };
        if (typeof options.retries === "number") {
            operationOptions.retries = options.retries;
        }
        if (typeof options.retryMinTimeout === "number") {
            operationOptions.minTimeout = options.retryMinTimeout;
        }
        if (typeof options.retryMaxTimeout === "number") {
            operationOptions.maxTimeout = options.retryMaxTimeout;
        }
        const operation = retry.operation(operationOptions);
        return await new Promise((resolve, reject) => {
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            operation.attempt(async (currentAttempt) => {
                var _a;
                let res;
                let body;
                try {
                    if (currentAttempt > 1) {
                        logger_1.logger.debug(`*** [apiv2] Attempting the request again. Attempt number ${currentAttempt}`);
                    }
                    this.logRequest(options);
                    try {
                        res = await (0, node_fetch_1.default)(fetchURL, fetchOptions);
                    }
                    catch (thrown) {
                        const err = thrown instanceof Error ? thrown : new Error(thrown);
                        logger_1.logger.debug(`*** [apiv2] error from fetch(${fetchURL}, ${JSON.stringify(fetchOptions)}): ${err}`);
                        const isAbortError = err.name.includes("AbortError");
                        if (isAbortError) {
                            throw new error_1.FirebaseError(`Timeout reached making request to ${fetchURL}`, {
                                original: err,
                            });
                        }
                        throw new error_1.FirebaseError(`Failed to make request to ${fetchURL}`, { original: err });
                    }
                    finally {
                        // If we succeed or failed, clear the timeout.
                        if (reqTimeout) {
                            clearTimeout(reqTimeout);
                        }
                    }
                    if (options.responseType === "json") {
                        const text = await res.text();
                        // Some responses, such as 204 and occasionally 202s don't have
                        // any content. We can't just rely on response code (202 may have conent)
                        // and unfortuantely res.length is unreliable (many requests return zero).
                        if (!text.length) {
                            body = undefined;
                        }
                        else {
                            try {
                                body = JSON.parse(text);
                            }
                            catch (err) {
                                // JSON-parse errors are useless. Log the response for better debugging.
                                this.logResponse(res, text, options);
                                throw new error_1.FirebaseError(`Unable to parse JSON: ${err}`);
                            }
                        }
                    }
                    else if (options.responseType === "xml") {
                        body = (await res.text());
                    }
                    else if (options.responseType === "stream") {
                        body = res.body;
                    }
                    else {
                        throw new error_1.FirebaseError(`Unable to interpret response. Please set responseType.`, {
                            exit: 2,
                        });
                    }
                }
                catch (err) {
                    return err instanceof error_1.FirebaseError ? reject(err) : reject(new error_1.FirebaseError(`${err}`));
                }
                this.logResponse(res, body, options);
                if (res.status >= 400) {
                    if (res.status === 401 && this.opts.auth) {
                        // If we get a 401, access token is expired or otherwise invalid.
                        // Throw it away and get a new one. We check for validity before using
                        // tokens, so this should not happen.
                        logger_1.logger.debug("Got a 401 Unauthenticated error for a call that required authentication. Refreshing tokens.");
                        setAccessToken();
                        setAccessToken(await getAccessToken());
                    }
                    if ((_a = options.retryCodes) === null || _a === void 0 ? void 0 : _a.includes(res.status)) {
                        const err = (0, responseToError_1.responseToError)({ statusCode: res.status }, body, fetchURL) || undefined;
                        if (operation.retry(err)) {
                            return;
                        }
                    }
                    if (!options.resolveOnHTTPError) {
                        return reject((0, responseToError_1.responseToError)({ statusCode: res.status }, body, fetchURL));
                    }
                }
                resolve({
                    status: res.status,
                    response: res,
                    body,
                });
            });
        });
    }
    logRequest(options) {
        var _a, _b;
        let queryParamsLog = "[none]";
        if (options.queryParams) {
            queryParamsLog = "[omitted]";
            if (!((_a = options.skipLog) === null || _a === void 0 ? void 0 : _a.queryParams)) {
                queryParamsLog =
                    options.queryParams instanceof url_1.URLSearchParams
                        ? options.queryParams.toString()
                        : JSON.stringify(options.queryParams);
            }
        }
        const logURL = this.requestURL(options);
        logger_1.logger.debug(`>>> [apiv2][query] ${options.method} ${logURL} ${queryParamsLog}`);
        const headers = options.headers;
        if (headers && headers.has(GOOG_QUOTA_USER_HEADER)) {
            logger_1.logger.debug(`>>> [apiv2][(partial)header] ${options.method} ${logURL} x-goog-quota-user=${headers.get(GOOG_QUOTA_USER_HEADER) || ""}`);
        }
        if (options.body !== undefined) {
            let logBody = "[omitted]";
            if (!((_b = options.skipLog) === null || _b === void 0 ? void 0 : _b.body)) {
                logBody = bodyToString(options.body);
            }
            logger_1.logger.debug(`>>> [apiv2][body] ${options.method} ${logURL} ${logBody}`);
        }
    }
    logResponse(res, body, options) {
        var _a;
        const logURL = this.requestURL(options);
        logger_1.logger.debug(`<<< [apiv2][status] ${options.method} ${logURL} ${res.status}`);
        let logBody = "[omitted]";
        if (!((_a = options.skipLog) === null || _a === void 0 ? void 0 : _a.resBody)) {
            logBody = bodyToString(body);
        }
        logger_1.logger.debug(`<<< [apiv2][body] ${options.method} ${logURL} ${logBody}`);
    }
}
exports.Client = Client;
function isLocalInsecureRequest(urlPrefix) {
    const u = new url_1.URL(urlPrefix);
    return u.protocol === "http:";
}
function bodyToString(body) {
    if (isStream(body)) {
        // Don't attempt to read any stream type, in case the caller needs it.
        return "[stream]";
    }
    else {
        try {
            return JSON.stringify(body);
        }
        catch (_) {
            return util_1.default.inspect(body);
        }
    }
}
function isStream(o) {
    return o instanceof stream_1.Readable || o instanceof FormData;
}
