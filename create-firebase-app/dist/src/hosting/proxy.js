"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorRequestHandler = exports.proxyRequestHandler = void 0;
const lodash_1 = require("lodash");
const node_fetch_1 = require("node-fetch");
const stream_1 = require("stream");
const url_1 = require("url");
const apiv2_1 = require("../apiv2");
const error_1 = require("../error");
const logger_1 = require("../logger");
const REQUIRED_VARY_VALUES = ["Accept-Encoding", "Authorization", "Cookie"];
function makeVary(vary = "") {
    if (!vary) {
        return "Accept-Encoding, Authorization, Cookie";
    }
    const varies = vary.split(/, ?/).map((v) => {
        return v
            .split("-")
            .map((part) => (0, lodash_1.capitalize)(part))
            .join("-");
    });
    REQUIRED_VARY_VALUES.forEach((requiredVary) => {
        if (!(0, lodash_1.includes)(varies, requiredVary)) {
            varies.push(requiredVary);
        }
    });
    return varies.join(", ");
}
/**
 * Returns an Express RequestHandler that will proxy the given request to a new
 * URL. Provide a rewriteIdentifier to help identify what triggered the proxy
 * when writing out logs or errors.  This makes some minor changes to headers,
 * cookies, and caching similar to the behavior of the production version of
 * the Firebase Hosting origin.
 */
function proxyRequestHandler(url, rewriteIdentifier, options = {}) {
    return async (req, res, next) => {
        var _a;
        logger_1.logger.info(`[hosting] Rewriting ${req.url} to ${url} for ${rewriteIdentifier}`);
        // Extract the __session cookie from headers to forward it to the
        // functions cookie is not a string[].
        const cookie = req.headers.cookie || "";
        const sessionCookie = cookie.split(/; ?/).find((c) => {
            return c.trim().startsWith("__session=");
        });
        // req.url is just the full path (e.g. /foo?key=value; no origin).
        const u = new url_1.URL(url + req.url);
        const c = new apiv2_1.Client({ urlPrefix: u.origin, auth: false });
        let passThrough;
        if (req.method && !["GET", "HEAD"].includes(req.method)) {
            passThrough = new stream_1.PassThrough();
            req.pipe(passThrough);
        }
        const headers = new node_fetch_1.Headers({
            "X-Forwarded-Host": req.headers.host || "",
            "X-Original-Url": req.url || "",
            Pragma: "no-cache",
            "Cache-Control": "no-cache, no-store",
            // forward the parsed __session cookie if any
            Cookie: sessionCookie || "",
        });
        // Skip particular header keys:
        // - using x-forwarded-host, don't need to keep `host` in the headers.
        const headersToSkip = new Set(["host"]);
        for (const key of Object.keys(req.headers)) {
            if (headersToSkip.has(key)) {
                continue;
            }
            const value = req.headers[key];
            if (value === undefined) {
                headers.delete(key);
            }
            else if (Array.isArray(value)) {
                headers.delete(key);
                for (const v of value) {
                    headers.append(key, v);
                }
            }
            else {
                headers.set(key, value);
            }
        }
        let proxyRes;
        try {
            proxyRes = await c.request({
                method: (req.method || "GET"),
                path: u.pathname,
                queryParams: u.searchParams,
                headers,
                resolveOnHTTPError: true,
                responseType: "stream",
                redirect: "manual",
                body: passThrough,
                timeout: 60000,
                compress: false,
            });
        }
        catch (err) {
            const isAbortError = err instanceof error_1.FirebaseError && ((_a = err.original) === null || _a === void 0 ? void 0 : _a.name.includes("AbortError"));
            const isTimeoutError = err instanceof error_1.FirebaseError &&
                err.original instanceof node_fetch_1.FetchError &&
                err.original.code === "ETIMEDOUT";
            const isSocketTimeoutError = err instanceof error_1.FirebaseError &&
                err.original instanceof node_fetch_1.FetchError &&
                err.original.code === "ESOCKETTIMEDOUT";
            if (isAbortError || isTimeoutError || isSocketTimeoutError) {
                res.statusCode = 504;
                return res.end("Timed out waiting for function to respond.\n");
            }
            res.statusCode = 500;
            return res.end(`An internal error occurred while proxying for ${rewriteIdentifier}\n`);
        }
        if (proxyRes.status === 404) {
            // x-cascade is not a string[].
            const cascade = proxyRes.response.headers.get("x-cascade");
            if (options.forceCascade || (cascade && cascade.toUpperCase() === "PASS")) {
                return next();
            }
        }
        // default to private cache
        if (!proxyRes.response.headers.get("cache-control")) {
            proxyRes.response.headers.set("cache-control", "private");
        }
        // don't allow cookies to be set on non-private cached responses
        const cc = proxyRes.response.headers.get("cache-control");
        if (cc && !cc.includes("private")) {
            proxyRes.response.headers.delete("set-cookie");
        }
        proxyRes.response.headers.set("vary", makeVary(proxyRes.response.headers.get("vary")));
        // Fix the location header that `node-fetch` attempts to helpfully fix:
        // https://github.com/node-fetch/node-fetch/blob/4abbfd231f4bce7dbe65e060a6323fc6917fd6d9/src/index.js#L117-L120
        // Filed a bug in `node-fetch` to either document the change or fix it:
        // https://github.com/node-fetch/node-fetch/issues/1086
        const location = proxyRes.response.headers.get("location");
        if (location) {
            // If parsing the URL fails, it may be because the location header
            // isn't a helpeful resolved URL (if node-fetch changes behavior). This
            // try is a preventative measure to ensure such a change shouldn't break
            // our emulator.
            try {
                const locationURL = new url_1.URL(location);
                // Only assume we can fix the location header if the origin of the
                // "fixed" header is the same as the origin of the outbound request.
                if (locationURL.origin === u.origin) {
                    const unborkedLocation = location.replace(locationURL.origin, "");
                    proxyRes.response.headers.set("location", unborkedLocation);
                }
            }
            catch (e) {
                logger_1.logger.debug(`[hosting] had trouble parsing location header, but this may be okay: "${location}"`);
            }
        }
        for (const [key, value] of Object.entries(proxyRes.response.headers.raw())) {
            res.setHeader(key, value);
        }
        res.statusCode = proxyRes.status;
        proxyRes.response.body.pipe(res);
    };
}
exports.proxyRequestHandler = proxyRequestHandler;
/**
 * Returns an Express RequestHandler that will both log out the error and
 * return an internal HTTP error response.
 */
function errorRequestHandler(error) {
    return (req, res) => {
        res.statusCode = 500;
        const out = `A problem occurred while trying to handle a proxied rewrite: ${error}`;
        logger_1.logger.error(out);
        res.end(out);
    };
}
exports.errorRequestHandler = errorRequestHandler;
