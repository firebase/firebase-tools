"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = void 0;
const cors = require("cors");
const express = require("express");
const exegesisExpress = require("exegesis-express");
const errors_1 = require("exegesis/lib/errors");
const _ = require("lodash");
const index_1 = require("./index");
const emulatorLogger_1 = require("../emulatorLogger");
const types_1 = require("../types");
const operations_1 = require("./operations");
const state_1 = require("./state");
const apiSpec_1 = require("./apiSpec");
const errors_2 = require("./errors");
const utils_1 = require("./utils");
const lodash_1 = require("lodash");
const handlers_1 = require("./handlers");
const bodyParser = require("body-parser");
const url_1 = require("url");
const jsonwebtoken_1 = require("jsonwebtoken");
const apiSpec = apiSpec_1.default;
const API_SPEC_PATH = "/emulator/openapi.json";
const AUTH_HEADER_PREFIX = "bearer ";
const SERVICE_ACCOUNT_TOKEN_PREFIX = "ya29.";
function specForRouter() {
    const paths = {};
    Object.entries(apiSpec.paths).forEach(([path, pathObj]) => {
        var _a;
        const servers = (_a = pathObj.servers) !== null && _a !== void 0 ? _a : apiSpec.servers;
        if (!servers || !servers.length) {
            throw new Error("No servers defined in API spec.");
        }
        // https://identitytoolkit.googleapis.com/foo => /identitytoolkit.googleapis.com/foo
        // This is safe since the URL always start with https://, no URL parsing needed.
        const pathWithNamespace = servers[0].url.replace("https://", "/") + path;
        paths[pathWithNamespace] = pathObj;
    });
    return Object.assign(Object.assign({}, apiSpec), { paths, 
        // Unset servers so that exegesis do not ignore APIs based on hostname.
        servers: undefined, "x-exegesis-controller": "auth" });
}
function specWithEmulatorServer(protocol, host) {
    const paths = {};
    Object.entries(apiSpec.paths).forEach(([path, pathObj]) => {
        const servers = pathObj.servers;
        if (servers) {
            pathObj = Object.assign(Object.assign({}, pathObj), { servers: serversWithEmulators(servers) });
        }
        paths[path] = pathObj;
    });
    if (!apiSpec.servers) {
        throw new Error("No servers defined in API spec.");
    }
    return Object.assign(Object.assign({}, apiSpec), { servers: serversWithEmulators(apiSpec.servers), paths });
    function serversWithEmulators(servers) {
        const result = [];
        for (const server of servers) {
            result.push({
                url: server.url ? server.url.replace("https://", "{EMULATOR}/") : "{EMULATOR}",
                variables: {
                    EMULATOR: {
                        default: host ? `${protocol}://${host}` : "",
                        description: "The protocol, hostname, and port of Firebase Auth Emulator.",
                    },
                },
            });
            if (server.url) {
                // Keep a copy so that one can also reach production, if they want to.
                result.push(server);
            }
        }
        return result;
    }
}
/**
 * Create an Express app that serves Auth Emulator APIs.
 *
 * @param defaultProjectId used for API endpoints that infer project IDs from
 * API keys / Bearer tokens. The Auth Emulator does NOT validate keys or tokens,
 * and in case targetProjectId is not specified in request body or path (if
 * accepted by the target endpoint), it assumes ALL keys / tokens map to this
 * default project ID.
 * @param projectStateForId a map from projectId to state, injectable for tests
 */
async function createApp(defaultProjectId, singleProjectMode = index_1.SingleProjectMode.NO_WARNING, projectStateForId = new Map()) {
    const app = express();
    app.set("json spaces", 2);
    // Return access-control-allow-private-network heder if requested
    // Enables accessing locahost when site is exposed via tunnel see https://github.com/firebase/firebase-tools/issues/4227
    // Aligns with https://wicg.github.io/private-network-access/#headers
    // Replace with cors option if adopted, see https://github.com/expressjs/cors/issues/236
    app.use("/", (req, res, next) => {
        if (req.headers["access-control-request-private-network"]) {
            res.setHeader("access-control-allow-private-network", "true");
        }
        next();
    });
    // Enable CORS for all APIs, all origins (reflected), and all headers (reflected).
    // This is similar to production behavior. Safe since all APIs are cookieless.
    app.use(cors({ origin: true }));
    // Workaround for clients (e.g. Node.js Admin SDK) that send request bodies
    // with HTTP DELETE requests. Such requests are tolerated by production, but
    // exegesis will reject them without the following hack.
    app.delete("*", (req, _, next) => {
        delete req.headers["content-type"];
        next();
    });
    app.get("/", (req, res) => {
        return res.json({
            authEmulator: {
                ready: true,
                docs: "https://firebase.google.com/docs/emulator-suite",
                apiSpec: API_SPEC_PATH,
            },
        });
    });
    app.get(API_SPEC_PATH, (req, res) => {
        res.json(specWithEmulatorServer(req.protocol, req.headers.host));
    });
    registerLegacyRoutes(app);
    (0, handlers_1.registerHandlers)(app, (apiKey, tenantId) => getProjectStateById(getProjectIdByApiKey(apiKey), tenantId));
    const apiKeyAuthenticator = (ctx, info) => {
        if (!info.name) {
            throw new Error("apiKey param/header name is undefined in API spec.");
        }
        let key;
        const req = ctx.req;
        switch (info.in) {
            case "header":
                key = req.get(info.name);
                break;
            case "query": {
                const q = req.query[info.name];
                key = typeof q === "string" ? q : undefined;
                break;
            }
            default:
                throw new Error('apiKey must be defined as in: "query" or "header" in API spec.');
        }
        if (key) {
            return { type: "success", user: getProjectIdByApiKey(key) };
        }
        else {
            return undefined;
        }
    };
    const oauth2Authenticator = (ctx) => {
        const authorization = ctx.req.headers["authorization"];
        if (!authorization || !authorization.toLowerCase().startsWith(AUTH_HEADER_PREFIX)) {
            return undefined;
        }
        const scopes = Object.keys(ctx.api.openApiDoc.components.securitySchemes.Oauth2.flows.authorizationCode.scopes);
        const token = authorization.substr(AUTH_HEADER_PREFIX.length);
        if (token.toLowerCase() === "owner") {
            // We treat "owner" as a valid account token for the default projectId.
            return { type: "success", user: defaultProjectId, scopes };
        }
        else if (token.startsWith(SERVICE_ACCOUNT_TOKEN_PREFIX) /* case sensitive */) {
            // We have received a production service account token. Since the token is
            // opaque and we cannot infer the projectId without contacting prod, we
            // will also assume that the token belongs to the default projectId.
            emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.AUTH).log("WARN", `Received service account token ${token}. Assuming that it owns project "${defaultProjectId}".`);
            return { type: "success", user: defaultProjectId, scopes };
        }
        throw new errors_2.UnauthenticatedError("Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication credential. See https://developers.google.com/identity/sign-in/web/devconsole-project.", [
            {
                message: "Invalid Credentials",
                domain: "global",
                reason: "authError",
                location: "Authorization",
                locationType: "header",
            },
        ]);
    };
    const apis = await exegesisExpress.middleware(specForRouter(), {
        controllers: { auth: toExegesisController(operations_1.authOperations, getProjectStateById) },
        authenticators: {
            apiKeyQuery: apiKeyAuthenticator,
            apiKeyHeader: apiKeyAuthenticator,
            Oauth2: oauth2Authenticator,
        },
        autoHandleHttpErrors(err) {
            // JSON parsing error thrown by body-parser.
            if (err.type === "entity.parse.failed") {
                const message = `Invalid JSON payload received. ${err.message}`;
                err = new errors_2.InvalidArgumentError(message, [
                    {
                        message,
                        domain: "global",
                        reason: "parseError",
                    },
                ]);
            }
            if (err instanceof errors_1.ValidationError) {
                // TODO: Shall we expose more than the first error?
                const firstError = err.errors[0];
                let details;
                if (firstError.location) {
                    // Add data path into error message, so it is actionable.
                    details = `${firstError.location.path} ${firstError.message}`;
                }
                else {
                    details = firstError.message;
                }
                err = new errors_2.InvalidArgumentError(`Invalid JSON payload received. ${details}`);
            }
            if (err.name === "HttpBadRequestError") {
                err = new errors_2.BadRequestError(err.message, "unknown");
            }
            // Let errors propagate to our universal error handler below.
            throw err;
        },
        defaultMaxBodySize: 1024 * 1024 * 1024,
        validateDefaultResponses: true,
        onResponseValidationError({ errors }) {
            (0, utils_1.logError)(new Error(`An internal error occured when generating response. Details:\n${JSON.stringify(errors)}`));
            throw new errors_2.InternalError("An internal error occured when generating response.", "emulator-response-validation");
        },
        customFormats: {
            "google-datetime"() {
                // TODO
                return true;
            },
            "google-fieldmask"() {
                // TODO
                return true;
            },
            "google-duration"() {
                // TODO
                return true;
            },
            uint64() {
                // TODO
                return true;
            },
            uint32() {
                // TODO
                return true;
            },
            byte() {
                // Disable the "byte" format validation to allow stuffing arbitrary
                // strings in passwordHash etc. Needed because the emulator generates
                // non-base64 hash strings like "fakeHash:salt=foo:password=bar".
                return true;
            },
        },
        plugins: [
            {
                info: { name: "test" },
                makeExegesisPlugin() {
                    return {
                        postSecurity(pluginContext) {
                            wrapValidateBody(pluginContext);
                            return Promise.resolve();
                        },
                        postController(ctx) {
                            if (ctx.res.statusCode === 401) {
                                // Normalize unauthenticated responses to match production.
                                const requirements = ctx.api.operationObject.security;
                                if (requirements === null || requirements === void 0 ? void 0 : requirements.some((req) => req.apiKeyQuery || req.apiKeyHeader)) {
                                    throw new errors_2.PermissionDeniedError("The request is missing a valid API key.");
                                }
                                else {
                                    throw new errors_2.UnauthenticatedError("Request is missing required authentication credential. Expected OAuth 2 access token, login cookie or other valid authentication credential. See https://developers.google.com/identity/sign-in/web/devconsole-project.", [
                                        {
                                            message: "Login Required.",
                                            domain: "global",
                                            reason: "required",
                                            location: "Authorization",
                                            locationType: "header",
                                        },
                                    ]);
                                }
                            }
                        },
                    };
                },
            },
        ],
    });
    app.use(apis);
    // Last catch-all handler. Serves 404. Must be after all routes.
    app.use(() => {
        throw new errors_2.NotFoundError();
    });
    // The function below must have 4 args in order for Express to consider it as
    // an error handler instead of a normal middleware. DO NOT remove unused args!
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    app.use(((err, req, res, next) => {
        let apiError;
        if (err instanceof errors_2.ApiError) {
            apiError = err;
        }
        else if (!err.status || err.status === 500) {
            apiError = new errors_2.UnknownError(err.message || "Unknown error", err.name || "unknown");
        }
        else {
            // This is a non-500 error following the http error convention, should probably just expose it.
            // For example, this may be a 413 Entity Too Large from body-parser.
            return res.status(err.status).json(err);
        }
        if (apiError.code === 500) {
            (0, utils_1.logError)(err);
        }
        return res.status(apiError.code).json({ error: apiError });
    }));
    return app;
    function getProjectIdByApiKey(apiKey) {
        /* unused */ apiKey;
        // We treat any non-empty string as a valid key for the default projectId.
        return defaultProjectId;
    }
    function getProjectStateById(projectId, tenantId) {
        let agentState = projectStateForId.get(projectId);
        if (singleProjectMode !== index_1.SingleProjectMode.NO_WARNING &&
            projectId &&
            defaultProjectId !== projectId) {
            const errorString = `Multiple projectIds are not recommended in single project mode. ` +
                `Requested project ID ${projectId}, but the emulator is configured for ` +
                `${defaultProjectId}. To opt-out of single project mode add/set the ` +
                `\'"singleProjectMode"\' false' property in the firebase.json emulators config.`;
            emulatorLogger_1.EmulatorLogger.forEmulator(types_1.Emulators.AUTH).log("WARN", errorString);
            if (singleProjectMode === index_1.SingleProjectMode.ERROR) {
                throw new errors_2.BadRequestError(errorString);
            }
        }
        if (!agentState) {
            agentState = new state_1.AgentProjectState(projectId);
            projectStateForId.set(projectId, agentState);
        }
        if (!tenantId) {
            return agentState;
        }
        return agentState.getTenantProject(tenantId);
    }
}
exports.createApp = createApp;
function registerLegacyRoutes(app) {
    // These endpoints are provided for SDK compatibility and can be found at:
    // https://www.googleapis.com/discovery/v1/apis/identitytoolkit/v3/rest
    // We do not generate OpenAPI specs for these to reduce bloat. These are not
    // well-documented and the JSON schema definitions are outdated anyway.
    const relyingPartyPrefix = "/www.googleapis.com/identitytoolkit/v3/relyingparty/";
    const v1Prefix = "/identitytoolkit.googleapis.com/v1/";
    for (const [oldPath, newPath] of [
        ["createAuthUri", "accounts:createAuthUri"],
        ["deleteAccount", "accounts:delete"],
        ["emailLinkSignin", "accounts:signInWithEmailLink"],
        ["getAccountInfo", "accounts:lookup"],
        ["getOobConfirmationCode", "accounts:sendOobCode"],
        ["getProjectConfig", "projects"],
        ["getRecaptchaParam", "recaptchaParams"],
        ["publicKeys", "publicKeys"],
        ["resetPassword", "accounts:resetPassword"],
        ["sendVerificationCode", "accounts:sendVerificationCode"],
        ["setAccountInfo", "accounts:update"],
        ["setProjectConfig", "setProjectConfig"],
        ["signupNewUser", "accounts:signUp"],
        ["verifyAssertion", "accounts:signInWithIdp"],
        ["verifyCustomToken", "accounts:signInWithCustomToken"],
        ["verifyPassword", "accounts:signInWithPassword"],
        ["verifyPhoneNumber", "accounts:signInWithPhoneNumber"],
    ]) {
        app.all(`${relyingPartyPrefix}${oldPath}`, (req, _, next) => {
            req.url = `${v1Prefix}${newPath}`;
            next();
        });
    }
    app.post(`${relyingPartyPrefix}signOutUser`, () => {
        throw new errors_2.NotImplementedError(`signOutUser is not implemented in the Auth Emulator.`);
    });
    // Rewrites that require parsing targetProjectId from request body, e.g.
    // /downloadAccount => /v1/projects/{target_project_id}/accounts:batchGet
    for (const [oldPath, newMethod, newPath] of [
        ["downloadAccount", "GET", "accounts:batchGet"],
        ["uploadAccount", "POST", "accounts:batchCreate"],
    ]) {
        app.post(`${relyingPartyPrefix}${oldPath}`, bodyParser.json(), (req, res, next) => {
            req.body = convertKeysToCamelCase(req.body || {});
            const targetProjectId = req.body.targetProjectId;
            if (!targetProjectId) {
                // Matching production behavior when targetProjectId is unspecified.
                return next(new errors_2.BadRequestError("INSUFFICIENT_PERMISSION"));
            }
            delete req.body.targetProjectId;
            req.method = newMethod;
            let qs = req.url.split("?", 2)[1] || "";
            if (newMethod === "GET") {
                Object.assign(req.query, req.body);
                // Update the URL to match query since exegeisis does its own parsing.
                const bodyAsQuery = new url_1.URLSearchParams(req.body).toString();
                qs = qs ? `${qs}&${bodyAsQuery}` : bodyAsQuery;
                delete req.body;
                delete req.headers["content-type"];
            }
            req.url = `${v1Prefix}projects/${encodeURIComponent(targetProjectId)}/${newPath}?${qs}`;
            next();
        });
    }
}
function toExegesisController(ops, getProjectStateById) {
    const result = {};
    processNested(ops, "");
    // Exegesis checks if all operationIds exist in controller on starting, so we
    // need to return a stub for operations that are not implemented in emulator.
    return new Proxy(result, {
        get: (obj, prop) => {
            if (typeof prop !== "string" || prop in obj) {
                // HACK(TS bug): https://github.com/microsoft/TypeScript/issues/1863
                return obj[prop];
            }
            const stub = () => {
                throw new errors_2.NotImplementedError(`${prop} is not implemented in the Auth Emulator.`);
            };
            return stub;
        },
    });
    function processNested(nested, prefix) {
        Object.entries(nested).forEach(([key, value]) => {
            if (typeof value === "function") {
                result[`${prefix}${key}`] = toExegesisOperation(value);
            }
            else {
                processNested(value, `${prefix}${key}.`);
                if (typeof value._ === "function") {
                    result[`${prefix}${key}`] = toExegesisOperation(value._);
                }
            }
        });
    }
    function toExegesisOperation(operation) {
        return (ctx) => {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            let targetProjectId = ctx.params.path.targetProjectId || ((_a = ctx.requestBody) === null || _a === void 0 ? void 0 : _a.targetProjectId);
            if (targetProjectId) {
                if ((_b = ctx.api.operationObject.security) === null || _b === void 0 ? void 0 : _b.some((sec) => sec.Oauth2)) {
                    // Some APIs (e.g. accounts:signUp) may allow either Oauth2
                    // ("authenticated") or apiKey ("unauthenticated"), but only
                    // authenticated requests may specify targetProjectId.
                    (0, errors_2.assert)((_c = ctx.security) === null || _c === void 0 ? void 0 : _c.Oauth2, "INSUFFICIENT_PERMISSION : Only authenticated requests can specify target_project_id.");
                }
            }
            else {
                // If not specified, targetProjectId is inferred from the API key or
                // Oauth2 token (see authenticators implementation above). The Auth
                // Emulator DOES NOT check IAM but assumes all permissions are granted.
                // See: https://cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/signUp
                targetProjectId = ctx.user;
            }
            let targetTenantId = undefined;
            if (ctx.params.path.tenantId && ((_d = ctx.requestBody) === null || _d === void 0 ? void 0 : _d.tenantId)) {
                (0, errors_2.assert)(ctx.params.path.tenantId === ctx.requestBody.tenantId, "TENANT_ID_MISMATCH");
            }
            targetTenantId = ctx.params.path.tenantId || ((_e = ctx.requestBody) === null || _e === void 0 ? void 0 : _e.tenantId);
            // Perform initial token parsing to get correct project state
            if ((_f = ctx.requestBody) === null || _f === void 0 ? void 0 : _f.idToken) {
                const idToken = (_g = ctx.requestBody) === null || _g === void 0 ? void 0 : _g.idToken;
                const decoded = (0, jsonwebtoken_1.decode)(idToken, { complete: true });
                if ((decoded === null || decoded === void 0 ? void 0 : decoded.payload.firebase.tenant) && targetTenantId) {
                    (0, errors_2.assert)((decoded === null || decoded === void 0 ? void 0 : decoded.payload.firebase.tenant) === targetTenantId, "TENANT_ID_MISMATCH");
                }
                targetTenantId = targetTenantId || (decoded === null || decoded === void 0 ? void 0 : decoded.payload.firebase.tenant);
            }
            // Need to check refresh token for tenant ID for grantToken endpoint
            if ((_h = ctx.requestBody) === null || _h === void 0 ? void 0 : _h.refreshToken) {
                const refreshTokenRecord = (0, state_1.decodeRefreshToken)(ctx.requestBody.refreshToken);
                if (refreshTokenRecord.tenantId && targetTenantId) {
                    // Shouldn't ever reach this assertion, but adding for completeness
                    (0, errors_2.assert)(refreshTokenRecord.tenantId === targetTenantId, "TENANT_ID_MISMATCH: ((Refresh token tenant ID does not match target tenant ID.))");
                }
                targetTenantId = targetTenantId || refreshTokenRecord.tenantId;
            }
            return operation(getProjectStateById(targetProjectId, targetTenantId), ctx.requestBody, ctx);
        };
    }
}
function wrapValidateBody(pluginContext) {
    // Apply fixes to body for Google REST API mapping compatibility.
    const op = pluginContext._operation;
    if (op.validateBody && !op._authEmulatorValidateBodyWrapped) {
        const validateBody = op.validateBody.bind(op);
        op.validateBody = (body) => {
            return validateAndFixRestMappingRequestBody(validateBody, body);
        };
        op._authEmulatorValidateBodyWrapped = true;
    }
}
function validateAndFixRestMappingRequestBody(validate, 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
body) {
    var _a;
    body = convertKeysToCamelCase(body);
    // Protobuf JSON parser accepts enum values as either string or int index, but
    // the JSON schema only accepts strings, causing validation errors. We catch
    // these errors and fix the paths. This is needed for e.g. Android SDK.
    // Similarly, convert numbers to strings for e.g. Node Admin SDK.
    let result;
    let keepFixing = false; // Keep fixing issues as long as we can.
    const fixedPaths = new Set();
    do {
        result = validate(body);
        if (!result.errors)
            return result;
        keepFixing = false;
        for (const error of result.errors) {
            const path = (_a = error.location) === null || _a === void 0 ? void 0 : _a.path;
            const ajvError = error.ajvError;
            if (!path || fixedPaths.has(path) || !ajvError) {
                continue;
            }
            const dataPath = jsonPointerToPath(path);
            const value = _.get(body, dataPath);
            if (ajvError.keyword === "type" && ajvError.params.type === "string") {
                if (typeof value === "number") {
                    // Coerce numbers to strings.
                    // Ideally, we should handle enums differently right now, but we don't
                    // know if it is an enum yet (ajvError.schema is somehow undefined).
                    // So we'll just leave it to the next iteration and handle it below.
                    _.set(body, dataPath, value.toString());
                    keepFixing = true;
                }
            }
            else if (ajvError.keyword === "enum") {
                const params = ajvError.params;
                const enumValue = params.allowedValues[value];
                if (enumValue) {
                    _.set(body, dataPath, enumValue);
                    keepFixing = true;
                }
            }
        }
    } while (keepFixing);
    return result;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertKeysToCamelCase(body) {
    if (body == null || typeof body !== "object")
        return body;
    if (Array.isArray(body)) {
        return body.map(convertKeysToCamelCase);
    }
    const result = Object.create(null);
    for (const key of Object.keys(body)) {
        // Google REST API mappings accept both snake_case and camelCase params,
        // so let's normalize it.
        result[(0, lodash_1.camelCase)(key)] = convertKeysToCamelCase(body[key]);
    }
    return result;
}
function jsonPointerToPath(pointer) {
    const path = pointer.split("/").map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
    if (path[0] === "#" || path[0] === "") {
        path.shift();
    }
    return path;
}
