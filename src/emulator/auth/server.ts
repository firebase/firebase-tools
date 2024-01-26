import * as cors from "cors";
import * as express from "express";
import * as exegesisExpress from "exegesis-express";
import { ValidationError } from "exegesis/lib/errors";
import * as _ from "lodash";
import { SingleProjectMode } from "./index";
import { OpenAPIObject, PathsObject, ServerObject, OperationObject } from "openapi3-ts";
import { EmulatorLogger } from "../emulatorLogger";
import { Emulators } from "../types";
import { authOperations, AuthOps, AuthOperation, FirebaseJwtPayload } from "./operations";
import { AgentProjectState, decodeRefreshToken, ProjectState } from "./state";
import apiSpecUntyped from "./apiSpec";
import {
  PromiseController,
  ExegesisContext,
  PromiseAuthenticator,
  ExegesisPluginContext,
  ValidatorFunction,
} from "exegesis-express";
import {
  PermissionDeniedError,
  UnauthenticatedError,
  ApiError,
  InvalidArgumentError,
  NotFoundError,
  UnknownError,
  NotImplementedError,
  InternalError,
  BadRequestError,
  assert,
} from "./errors";
import { logError } from "./utils";
import { camelCase } from "lodash";
import { registerHandlers } from "./handlers";
import * as bodyParser from "body-parser";
import { URLSearchParams } from "url";
import { decode, JwtHeader } from "jsonwebtoken";
const apiSpec = apiSpecUntyped as OpenAPIObject;

const API_SPEC_PATH = "/emulator/openapi.json";

const AUTH_HEADER_PREFIX = "bearer ";
const SERVICE_ACCOUNT_TOKEN_PREFIX = "ya29.";

function specForRouter(): OpenAPIObject {
  const paths: PathsObject = {};
  Object.entries(apiSpec.paths).forEach(([path, pathObj]) => {
    const servers = (pathObj as { servers?: { url: string }[] }).servers ?? apiSpec.servers;
    if (!servers || !servers.length) {
      throw new Error("No servers defined in API spec.");
    }
    // https://identitytoolkit.googleapis.com/foo => /identitytoolkit.googleapis.com/foo
    // This is safe since the URL always start with https://, no URL parsing needed.
    const pathWithNamespace = servers[0].url.replace("https://", "/") + path;
    paths[pathWithNamespace] = pathObj;
  });
  return {
    ...apiSpec,
    paths,
    // Unset servers so that exegesis do not ignore APIs based on hostname.
    servers: undefined,
    "x-exegesis-controller": "auth",
  };
}

function specWithEmulatorServer(protocol: string, host: string | undefined): OpenAPIObject {
  const paths: PathsObject = {};
  Object.entries(apiSpec.paths).forEach(([path, pathObj]) => {
    const servers = (pathObj as { servers?: { url: string }[] }).servers;
    if (servers) {
      pathObj = {
        ...pathObj,
        servers: serversWithEmulators(servers),
      };
    }
    paths[path] = pathObj;
  });
  if (!apiSpec.servers) {
    throw new Error("No servers defined in API spec.");
  }
  return {
    ...apiSpec,
    servers: serversWithEmulators(apiSpec.servers),
    paths,
  };

  function serversWithEmulators(servers: ServerObject[]): ServerObject[] {
    const result: ServerObject[] = [];
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
export async function createApp(
  defaultProjectId: string,
  singleProjectMode = SingleProjectMode.NO_WARNING,
  projectStateForId = new Map<string, AgentProjectState>(),
): Promise<express.Express> {
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
  registerHandlers(app, (apiKey, tenantId) =>
    getProjectStateById(getProjectIdByApiKey(apiKey), tenantId),
  );

  const apiKeyAuthenticator: PromiseAuthenticator = (ctx, info) => {
    if (!info.name) {
      throw new Error("apiKey param/header name is undefined in API spec.");
    }

    let key: string | undefined;
    const req = ctx.req as express.Request;
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
    } else {
      return undefined;
    }
  };

  const oauth2Authenticator: PromiseAuthenticator = (ctx) => {
    const authorization = ctx.req.headers["authorization"];
    if (!authorization || !authorization.toLowerCase().startsWith(AUTH_HEADER_PREFIX)) {
      return undefined;
    }
    const scopes = Object.keys(
      ctx.api.openApiDoc.components.securitySchemes.Oauth2.flows.authorizationCode.scopes,
    );
    const token = authorization.substr(AUTH_HEADER_PREFIX.length);
    if (token.toLowerCase() === "owner") {
      // We treat "owner" as a valid account token for the default projectId.
      return { type: "success", user: defaultProjectId, scopes };
    } else if (token.startsWith(SERVICE_ACCOUNT_TOKEN_PREFIX) /* case sensitive */) {
      // We have received a production service account token. Since the token is
      // opaque and we cannot infer the projectId without contacting prod, we
      // will also assume that the token belongs to the default projectId.
      EmulatorLogger.forEmulator(Emulators.AUTH).log(
        "WARN",
        `Received service account token ${token}. Assuming that it owns project "${defaultProjectId}".`,
      );
      return { type: "success", user: defaultProjectId, scopes };
    }
    throw new UnauthenticatedError(
      "Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication credential. See https://developers.google.com/identity/sign-in/web/devconsole-project.",
      [
        {
          message: "Invalid Credentials",
          domain: "global",
          reason: "authError",
          location: "Authorization",
          locationType: "header",
        },
      ],
    );
  };
  const apis = await exegesisExpress.middleware(specForRouter(), {
    controllers: { auth: toExegesisController(authOperations, getProjectStateById) },
    authenticators: {
      apiKeyQuery: apiKeyAuthenticator,
      apiKeyHeader: apiKeyAuthenticator,
      Oauth2: oauth2Authenticator,
    },
    autoHandleHttpErrors(err) {
      // JSON parsing error thrown by body-parser.
      if ((err as { type?: string }).type === "entity.parse.failed") {
        const message = `Invalid JSON payload received. ${err.message}`;
        err = new InvalidArgumentError(message, [
          {
            message,
            domain: "global",
            reason: "parseError",
          },
        ]);
      }
      if (err instanceof ValidationError) {
        // TODO: Shall we expose more than the first error?
        const firstError = err.errors[0];
        let details;
        if (firstError.location) {
          // Add data path into error message, so it is actionable.
          details = `${firstError.location.path} ${firstError.message}`;
        } else {
          details = firstError.message;
        }
        err = new InvalidArgumentError(`Invalid JSON payload received. ${details}`);
      }
      if (err.name === "HttpBadRequestError") {
        err = new BadRequestError(err.message, "unknown");
      }
      // Let errors propagate to our universal error handler below.
      throw err;
    },
    defaultMaxBodySize: 1024 * 1024 * 1024, // 1GB instead of the default 10k.
    validateDefaultResponses: true,
    onResponseValidationError({ errors }) {
      logError(
        new Error(
          `An internal error occured when generating response. Details:\n${JSON.stringify(errors)}`,
        ),
      );
      throw new InternalError(
        "An internal error occured when generating response.",
        "emulator-response-validation",
      );
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
            postSecurity(pluginContext: ExegesisPluginContext): Promise<void> {
              wrapValidateBody(pluginContext);
              return Promise.resolve();
            },
            postController(ctx: ExegesisContext) {
              if (ctx.res.statusCode === 401) {
                // Normalize unauthenticated responses to match production.
                const requirements = (ctx.api.operationObject as OperationObject).security;
                if (requirements?.some((req) => req.apiKeyQuery || req.apiKeyHeader)) {
                  throw new PermissionDeniedError("The request is missing a valid API key.");
                } else {
                  throw new UnauthenticatedError(
                    "Request is missing required authentication credential. Expected OAuth 2 access token, login cookie or other valid authentication credential. See https://developers.google.com/identity/sign-in/web/devconsole-project.",
                    [
                      {
                        message: "Login Required.",
                        domain: "global",
                        reason: "required",
                        location: "Authorization",
                        locationType: "header",
                      },
                    ],
                  );
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
    throw new NotFoundError();
  });

  // The function below must have 4 args in order for Express to consider it as
  // an error handler instead of a normal middleware. DO NOT remove unused args!
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use(((err, req, res, next) => {
    let apiError;
    if (err instanceof ApiError) {
      apiError = err;
    } else if (!err.status || err.status === 500) {
      apiError = new UnknownError(err.message || "Unknown error", err.name || "unknown");
    } else {
      // This is a non-500 error following the http error convention, should probably just expose it.
      // For example, this may be a 413 Entity Too Large from body-parser.
      return res.status(err.status).json(err);
    }
    if (apiError.code === 500) {
      logError(err);
    }
    return res.status(apiError.code).json({ error: apiError });
  }) as express.ErrorRequestHandler);
  return app;

  function getProjectIdByApiKey(apiKey: string): string {
    /* unused */ apiKey;
    // We treat any non-empty string as a valid key for the default projectId.
    return defaultProjectId;
  }

  function getProjectStateById(projectId: string, tenantId?: string): ProjectState {
    let agentState = projectStateForId.get(projectId);

    if (
      singleProjectMode !== SingleProjectMode.NO_WARNING &&
      projectId &&
      defaultProjectId !== projectId
    ) {
      const errorString =
        `Multiple projectIds are not recommended in single project mode. ` +
        `Requested project ID ${projectId}, but the emulator is configured for ` +
        `${defaultProjectId}. To opt-out of single project mode add/set the ` +
        `\'"singleProjectMode"\' false' property in the firebase.json emulators config.`;
      EmulatorLogger.forEmulator(Emulators.AUTH).log("WARN", errorString);
      if (singleProjectMode === SingleProjectMode.ERROR) {
        throw new BadRequestError(errorString);
      }
    }
    if (!agentState) {
      agentState = new AgentProjectState(projectId);
      projectStateForId.set(projectId, agentState);
    }
    if (!tenantId) {
      return agentState;
    }

    return agentState.getTenantProject(tenantId);
  }
}

function registerLegacyRoutes(app: express.Express): void {
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
    throw new NotImplementedError(`signOutUser is not implemented in the Auth Emulator.`);
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
        return next(new BadRequestError("INSUFFICIENT_PERMISSION"));
      }

      delete req.body.targetProjectId;
      req.method = newMethod;
      let qs = req.url.split("?", 2)[1] || "";
      if (newMethod === "GET") {
        Object.assign(req.query, req.body);

        // Update the URL to match query since exegeisis does its own parsing.
        const bodyAsQuery = new URLSearchParams(req.body).toString();
        qs = qs ? `${qs}&${bodyAsQuery}` : bodyAsQuery;
        delete req.body;
        delete req.headers["content-type"];
      }
      req.url = `${v1Prefix}projects/${encodeURIComponent(targetProjectId)}/${newPath}?${qs}`;
      next();
    });
  }
}

function toExegesisController(
  ops: AuthOps,
  getProjectStateById: (projectId: string, tenantId?: string) => ProjectState,
): Record<string, PromiseController> {
  const result: Record<string, PromiseController> = {};
  processNested(ops, "");

  // Exegesis checks if all operationIds exist in controller on starting, so we
  // need to return a stub for operations that are not implemented in emulator.
  return new Proxy(result, {
    get: (obj, prop) => {
      if (typeof prop !== "string" || prop in obj) {
        // HACK(TS bug): https://github.com/microsoft/TypeScript/issues/1863
        return obj[prop as string];
      }
      const stub: PromiseController = () => {
        throw new NotImplementedError(`${prop} is not implemented in the Auth Emulator.`);
      };
      return stub;
    },
  });

  function processNested(nested: AuthOps, prefix: string): void {
    Object.entries(nested).forEach(([key, value]) => {
      if (typeof value === "function") {
        result[`${prefix}${key}`] = toExegesisOperation(value);
      } else {
        processNested(value, `${prefix}${key}.`);
        if (typeof value._ === "function") {
          result[`${prefix}${key}`] = toExegesisOperation(value._);
        }
      }
    });
  }

  function toExegesisOperation(operation: AuthOperation): PromiseController {
    return (ctx) => {
      let targetProjectId: string =
        ctx.params.path.targetProjectId || ctx.requestBody?.targetProjectId;
      if (targetProjectId) {
        if ((ctx.api.operationObject as OperationObject).security?.some((sec) => sec.Oauth2)) {
          // Some APIs (e.g. accounts:signUp) may allow either Oauth2
          // ("authenticated") or apiKey ("unauthenticated"), but only
          // authenticated requests may specify targetProjectId.
          assert(
            ctx.security?.Oauth2,
            "INSUFFICIENT_PERMISSION : Only authenticated requests can specify target_project_id.",
          );
        }
      } else {
        // If not specified, targetProjectId is inferred from the API key or
        // Oauth2 token (see authenticators implementation above). The Auth
        // Emulator DOES NOT check IAM but assumes all permissions are granted.
        // See: https://cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/signUp
        targetProjectId = ctx.user;
      }

      let targetTenantId: string | undefined = undefined;
      if (ctx.params.path.tenantId && ctx.requestBody?.tenantId) {
        assert(ctx.params.path.tenantId === ctx.requestBody.tenantId, "TENANT_ID_MISMATCH");
      }
      targetTenantId = ctx.params.path.tenantId || ctx.requestBody?.tenantId;

      // Perform initial token parsing to get correct project state
      if (ctx.requestBody?.idToken) {
        const idToken = ctx.requestBody?.idToken;
        const decoded = decode(idToken, { complete: true }) as {
          header: JwtHeader;
          payload: FirebaseJwtPayload;
        } | null;
        if (decoded?.payload.firebase.tenant && targetTenantId) {
          assert(decoded?.payload.firebase.tenant === targetTenantId, "TENANT_ID_MISMATCH");
        }
        targetTenantId = targetTenantId || decoded?.payload.firebase.tenant;
      }

      // Need to check refresh token for tenant ID for grantToken endpoint
      if (ctx.requestBody?.refreshToken) {
        const refreshTokenRecord = decodeRefreshToken(ctx.requestBody!.refreshToken);
        if (refreshTokenRecord.tenantId && targetTenantId) {
          // Shouldn't ever reach this assertion, but adding for completeness
          assert(
            refreshTokenRecord.tenantId === targetTenantId,
            "TENANT_ID_MISMATCH: ((Refresh token tenant ID does not match target tenant ID.))",
          );
        }
        targetTenantId = targetTenantId || refreshTokenRecord.tenantId;
      }

      return operation(getProjectStateById(targetProjectId, targetTenantId), ctx.requestBody, ctx);
    };
  }
}

function wrapValidateBody(pluginContext: ExegesisPluginContext): void {
  // Apply fixes to body for Google REST API mapping compatibility.
  const op = (
    pluginContext as unknown as {
      _operation: {
        validateBody?: ValidatorFunction;
        _authEmulatorValidateBodyWrapped?: true;
      };
    }
  )._operation;
  if (op.validateBody && !op._authEmulatorValidateBodyWrapped) {
    const validateBody = op.validateBody.bind(op);
    op.validateBody = (body) => {
      return validateAndFixRestMappingRequestBody(validateBody, body);
    };
    op._authEmulatorValidateBodyWrapped = true;
  }
}

function validateAndFixRestMappingRequestBody(
  validate: ValidatorFunction,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any,
): ReturnType<ValidatorFunction> {
  body = convertKeysToCamelCase(body);

  // Protobuf JSON parser accepts enum values as either string or int index, but
  // the JSON schema only accepts strings, causing validation errors. We catch
  // these errors and fix the paths. This is needed for e.g. Android SDK.
  // Similarly, convert numbers to strings for e.g. Node Admin SDK.
  let result: ReturnType<ValidatorFunction>;
  let keepFixing = false; // Keep fixing issues as long as we can.
  const fixedPaths = new Set<string>();
  do {
    result = validate(body);
    if (!result.errors) return result;
    keepFixing = false;
    for (const error of result.errors) {
      const path = error.location?.path;
      const ajvError = error.ajvError;
      if (!path || fixedPaths.has(path) || !ajvError) {
        continue;
      }
      const dataPath = jsonPointerToPath(path);
      const value = _.get(body, dataPath);
      if (ajvError.keyword === "type" && (ajvError.params as { type: string }).type === "string") {
        if (typeof value === "number") {
          // Coerce numbers to strings.
          // Ideally, we should handle enums differently right now, but we don't
          // know if it is an enum yet (ajvError.schema is somehow undefined).
          // So we'll just leave it to the next iteration and handle it below.
          _.set(body, dataPath, value.toString());
          keepFixing = true;
        }
      } else if (ajvError.keyword === "enum") {
        const params = ajvError.params as { allowedValues: string[] };
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
function convertKeysToCamelCase(body: any): any {
  if (body == null || typeof body !== "object") return body;

  if (Array.isArray(body)) {
    return body.map(convertKeysToCamelCase);
  }
  const result = Object.create(null);
  for (const key of Object.keys(body)) {
    // Google REST API mappings accept both snake_case and camelCase params,
    // so let's normalize it.
    result[camelCase(key)] = convertKeysToCamelCase(body[key]);
  }
  return result;
}

function jsonPointerToPath(pointer: string): string[] {
  const path = pointer.split("/").map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
  if (path[0] === "#" || path[0] === "") {
    path.shift();
  }
  return path;
}
