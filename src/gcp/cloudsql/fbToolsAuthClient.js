"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FBToolsAuthClient = void 0;
const google_auth_library_1 = require("google-auth-library");
const apiv2 = __importStar(require("../../apiv2"));
const error_1 = require("../../error");
// FBToolsAuthClient implements google-auth-library.AuthClient
// using apiv2.ts and our normal OAuth2 flow.
class FBToolsAuthClient extends google_auth_library_1.AuthClient {
    async request(opts) {
        if (!opts.url) {
            throw new error_1.FirebaseError("opts.url was undefined");
        }
        const url = new URL(opts.url);
        const client = new apiv2.Client({
            urlPrefix: url.origin,
            auth: true,
        });
        const res = await client.request({
            method: opts.method ?? "POST",
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
        return {
            ...apiv2.STANDARD_HEADERS,
            Authorization: `Bearer ${token.token}`,
        };
    }
}
exports.FBToolsAuthClient = FBToolsAuthClient;
//# sourceMappingURL=fbToolsAuthClient.js.map