"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FBToolsAuthClient = void 0;
const google_auth_library_1 = require("google-auth-library");
const apiv2 = require("../../apiv2");
const error_1 = require("../../error");
// FBToolsAuthClient implements google-auth-library.AuthClient
// using apiv2.ts and our normal OAuth2 flow.
class FBToolsAuthClient extends google_auth_library_1.AuthClient {
    async request(opts) {
        var _a;
        if (!opts.url) {
            throw new error_1.FirebaseError("opts.url was undefined");
        }
        const url = new URL(opts.url);
        const client = new apiv2.Client({
            urlPrefix: url.origin,
            auth: true,
        });
        const res = await client.request({
            method: (_a = opts.method) !== null && _a !== void 0 ? _a : "POST",
            path: url.pathname,
            queryParams: opts.params,
            body: opts.data,
            responseType: opts.responseType,
        });
        return {
            config: opts,
            status: res.status,
            statusText: res.response.statusText,
            data: res.body,
            headers: res.response.headers,
            request: {},
        };
    }
    async getAccessToken() {
        return { token: await apiv2.getAccessToken() };
    }
    async getRequestHeaders() {
        const token = await this.getAccessToken();
        return Object.assign(Object.assign({}, apiv2.STANDARD_HEADERS), { Authorization: `Bearer ${token.token}` });
    }
}
exports.FBToolsAuthClient = FBToolsAuthClient;
