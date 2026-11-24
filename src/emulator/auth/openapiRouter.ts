import { Ajv, ErrorObject, Format, ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import * as bodyParser from "body-parser";
import * as express from "express";
import { escapeRegExp } from "lodash";
import {
  OpenAPIObject,
  OperationObject,
  ParameterObject,
  PathItemObject,
  ReferenceObject,
  RequestBodyObject,
  ResponseObject,
  SchemaObject,
  SecuritySchemeObject,
} from "openapi3-ts";
import { BadRequestError, InvalidArgumentError } from "./errors";

const SPEC_SCHEMA_ID = "openapi://auth-emulator";
const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];
const METHODS_WITH_BODY = new Set<string>(["post", "put", "patch", "delete"]);

export interface AuthResult {
  type: "success";
  user: string;
  scopes?: string[];
}

export type Authenticator = (
  ctx: AuthOperationContext,
  info: SecuritySchemeObject,
) => AuthResult | undefined | Promise<AuthResult | undefined>;

export interface AuthOperationContext {
  req: express.Request;
  res: express.Response;
  api: {
    openApiDoc: OpenAPIObject;
    operationObject: OperationObject;
  };
  params: {
    path: Record<string, string>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: Record<string, any>;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  requestBody: any;
  security?: Record<string, AuthResult>;
  user?: string;
}

export type OperationHandler = (ctx: AuthOperationContext) => unknown | Promise<unknown>;

export interface ValidationOutcome {
  errors?: ErrorObject[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BodyValidator = (body: any) => ValidationOutcome;

export interface OpenApiMiddlewareOptions {
  /** Maps OpenAPI `operationId` to handler functions. */
  resolveHandler: (operationId: string) => OperationHandler;
  /** Security scheme authenticators keyed by OpenAPI `components.securitySchemes` name. */
  authenticators: Record<string, Authenticator>;
  /** Called when no security requirement succeeds for an operation that declares security. */
  onUnauthenticated: (ctx: AuthOperationContext) => never;
  /** Optional hook to normalize/coerce and validate parsed request bodies. */
  transformAndValidateBody?: (validate: BodyValidator, body: unknown) => ValidationOutcome;
  /** Called when a 200 response fails OpenAPI schema validation. */
  onResponseValidationError?: (errors: ErrorObject[]) => never;
  /** Additional AJV format validators overriding or extending `ajv-formats`. */
  customFormats?: Record<string, Format>;
  /** Maximum request body size in bytes (default: 100 KB). */
  defaultMaxBodySize?: number;
  /** Compile AJV validators on first request instead of upfront (default: true). */
  lazyCompileValidationSchemas?: boolean;
}

interface CompiledMediaType {
  mimeType: string;
  allowCoercion: boolean;
  validate: () => ValidateFunction | undefined;
}

interface CompiledParameter {
  name: string;
  in: "path" | "query";
  required: boolean;
  validate: () => ValidateFunction | undefined;
}

interface CompiledOperation {
  operationId: string;
  operationObject: OperationObject;
  pathParams: CompiledParameter[];
  queryParams: CompiledParameter[];
  bodyRequired: boolean;
  mediaTypes: Map<string, CompiledMediaType>;
  validateResponse: () => ValidateFunction | undefined;
}

interface CompiledPath {
  template: string;
  operations: Map<HttpMethod, CompiledOperation>;
}

interface DynamicRoute {
  compiledPath: CompiledPath;
  regex: RegExp;
  paramNames: string[];
  staticSegmentCount: number;
  literalLength: number;
}

function isReferenceObject(obj: unknown): obj is ReferenceObject {
  return typeof obj === "object" && obj !== null && "$ref" in obj && typeof obj.$ref === "string";
}

function resolveComponentRef<T>(spec: OpenAPIObject, ref: string): T {
  if (!ref.startsWith("#/")) {
    throw new Error(`Unsupported external OpenAPI $ref: ${ref}`);
  }
  const segments = ref
    .slice(2)
    .split("/")
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
  let current: unknown = spec;
  for (const segment of segments) {
    if (typeof current !== "object" || current === null || !(segment in current)) {
      throw new Error(`Unresolvable OpenAPI $ref: ${ref}`);
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current as T;
}

function resolveMaybeRef<T>(spec: OpenAPIObject, item: T | ReferenceObject): T {
  return isReferenceObject(item) ? resolveComponentRef<T>(spec, item.$ref) : item;
}

function rewriteRelativeRefs(schema: unknown, baseId: string): unknown {
  if (Array.isArray(schema)) {
    return schema.map((entry) => rewriteRelativeRefs(entry, baseId));
  }
  if (typeof schema !== "object" || schema === null) {
    return schema;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "$ref" && typeof value === "string" && value.startsWith("#/")) {
      out[key] = `${baseId}${value}`;
    } else if (key === "example") {
      // Omit example objects so AJV never interprets an example `id` field as a schema ID.
      continue;
    } else {
      out[key] = rewriteRelativeRefs(value, baseId);
    }
  }
  return out;
}

function createAjvInstance(
  spec: OpenAPIObject,
  coerceTypes: boolean,
  customFormats: Record<string, Format>,
): Ajv {
  const ajv = new Ajv({
    strict: false,
    allErrors: false,
    useDefaults: true,
    coerceTypes: coerceTypes ? "array" : false,
    removeAdditional: coerceTypes ? "failing" : false,
  });
  addFormats(ajv);
  ajv.addFormat("password", () => true);
  ajv.addFormat("binary", () => true);
  ajv.addFormat("base64", ajv.formats["byte"] as Format);
  for (const [name, validator] of Object.entries(customFormats)) {
    ajv.addFormat(name, validator);
  }
  ajv.addSchema(
    {
      $id: SPEC_SCHEMA_ID,
      components: {
        schemas: spec.components?.schemas ?? {},
      },
    },
    SPEC_SCHEMA_ID,
  );
  return ajv;
}

function compileTemplate(template: string): Omit<DynamicRoute, "compiledPath"> {
  const paramNames: string[] = [];
  const regexParts: string[] = [];
  const templateRe = /\{([^}]+)\}/g;
  let lastIndex = 0;
  let literalLength = 0;
  let match: RegExpExecArray | null;

  while ((match = templateRe.exec(template)) !== null) {
    const literal = template.slice(lastIndex, match.index);
    literalLength += literal.length;
    regexParts.push(escapeRegExp(literal), "([^/]+)");
    paramNames.push(match[1]);
    lastIndex = match.index + match[0].length;
  }
  const tail = template.slice(lastIndex);
  literalLength += tail.length;
  regexParts.push(escapeRegExp(tail));

  const segments = template.split("/").filter(Boolean);
  const staticSegmentCount = segments.filter((seg) => !seg.includes("{")).length;

  return {
    regex: new RegExp(`^${regexParts.join("")}$`),
    paramNames,
    staticSegmentCount,
    literalLength,
  };
}

function createLazyValidator(
  ajv: Ajv,
  schema: SchemaObject | ReferenceObject | undefined,
  wrapValue: boolean,
  lazy: boolean,
): () => ValidateFunction | undefined {
  if (!schema) {
    return () => undefined;
  }
  const rewritten = rewriteRelativeRefs(schema, SPEC_SCHEMA_ID) as Record<string, unknown>;
  const targetSchema = wrapValue
    ? {
        type: "object",
        properties: {
          value: rewritten,
        },
      }
    : rewritten;

  let compiled: ValidateFunction | undefined;
  const compile = (): ValidateFunction => {
    if (!compiled) {
      compiled = ajv.compile(targetSchema);
    }
    return compiled;
  };
  if (!lazy) {
    compile();
  }
  return compile;
}

function runBodyParser(
  parser: express.RequestHandler,
  req: express.Request,
  res: express.Response,
): Promise<void> {
  return new Promise((resolve, reject) => {
    parser(req, res, (err?: unknown) => {
      if (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      } else {
        resolve();
      }
    });
  });
}

function formatValidationError(firstError: ErrorObject, fallbackPath?: string): string {
  const path = firstError.instancePath || fallbackPath || "";
  const message = firstError.message || "validation failed";
  return path ? `${path} ${message}` : message;
}

function requestHasBody(headers: express.Request["headers"]): boolean {
  if (headers["transfer-encoding"] !== undefined) {
    return true;
  }
  const contentLength = headers["content-length"];
  if (contentLength !== undefined) {
    const parsed = Number(contentLength);
    return !Number.isNaN(parsed) && parsed > 0;
  }
  return false;
}

function normalizeMimeType(contentType: string): string {
  return contentType.split(";")[0].trim().toLowerCase();
}

function validateWrappedValue(
  validate: ValidateFunction | undefined,
  value: unknown,
  paramDescription: string,
  required: boolean,
): unknown {
  if (value === undefined) {
    if (required) {
      throw new InvalidArgumentError(
        `Invalid JSON payload received. Missing required ${paramDescription}`,
      );
    }
    if (!validate) {
      return undefined;
    }
    const wrapper: { value?: unknown } = {};
    validate(wrapper);
    return wrapper.value;
  }
  if (!validate) {
    return value;
  }
  const wrapper: { value: unknown } = { value };
  if (!validate(wrapper) && validate.errors && validate.errors.length > 0) {
    const first = validate.errors[0];
    const strippedPath = first.instancePath.startsWith("/value")
      ? first.instancePath.slice(6)
      : first.instancePath;
    const message = first.message || "validation failed";
    const details = strippedPath ? `${strippedPath} ${message}` : message;
    throw new InvalidArgumentError(`Invalid JSON payload received. ${details}`);
  }
  return wrapper.value;
}

function runBodyValidation(
  validateFn: ValidateFunction | undefined,
  body: unknown,
  transformAndValidateBody?: OpenApiMiddlewareOptions["transformAndValidateBody"],
): unknown {
  if (!validateFn) {
    return body;
  }
  const rawValidator: BodyValidator = (candidate) => {
    const ok = validateFn(candidate);
    if (!ok && validateFn.errors && validateFn.errors.length > 0) {
      return { errors: [...validateFn.errors], value: candidate };
    }
    return { value: candidate };
  };
  const outcome = transformAndValidateBody
    ? transformAndValidateBody(rawValidator, body)
    : rawValidator(body);
  if (outcome.errors && outcome.errors.length > 0) {
    const details = formatValidationError(outcome.errors[0]);
    throw new InvalidArgumentError(`Invalid JSON payload received. ${details}`);
  }
  return outcome.value;
}

/**
 * Builds an Express middleware that routes, authenticates, validates, and dispatches
 * requests defined by an OpenAPI 3.0 document.
 */
export function createOpenApiMiddleware(
  spec: OpenAPIObject,
  options: OpenApiMiddlewareOptions,
): express.RequestHandler {
  const maxBodySize = options.defaultMaxBodySize ?? 100 * 1024;
  const lazy = options.lazyCompileValidationSchemas ?? true;
  const customFormats = options.customFormats ?? {};

  const strictAjv = createAjvInstance(spec, false, customFormats);
  const coercingAjv = createAjvInstance(spec, true, customFormats);

  const jsonParser = bodyParser.json({
    inflate: true,
    limit: maxBodySize,
    type: "*/*",
  });
  const urlEncodedParser = bodyParser.urlencoded({
    extended: false,
    inflate: true,
    limit: maxBodySize,
    type: "*/*",
  });

  const staticRoutes = new Map<string, CompiledPath>();
  const dynamicRoutes: DynamicRoute[] = [];

  for (const [template, rawPathItem] of Object.entries(spec.paths)) {
    const pathItem = rawPathItem as PathItemObject;
    const pathLevelParams = (pathItem.parameters ?? []).map((p) =>
      resolveMaybeRef<ParameterObject>(spec, p),
    );
    const operations = new Map<HttpMethod, CompiledOperation>();

    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!op) {
        continue;
      }
      if (!op.operationId) {
        throw new Error(`OpenAPI operation ${method.toUpperCase()} ${template} lacks operationId`);
      }

      // Merge path-level and operation-level parameters (operation wins on same in+name).
      const mergedParams = new Map<string, ParameterObject>();
      for (const param of pathLevelParams) {
        mergedParams.set(`${param.in}:${param.name}`, param);
      }
      for (const rawParam of op.parameters ?? []) {
        const param = resolveMaybeRef<ParameterObject>(spec, rawParam);
        mergedParams.set(`${param.in}:${param.name}`, param);
      }

      const pathParams: CompiledParameter[] = [];
      const queryParams: CompiledParameter[] = [];
      for (const param of mergedParams.values()) {
        if (param.in !== "path" && param.in !== "query") {
          continue;
        }
        const compiled: CompiledParameter = {
          name: param.name,
          in: param.in,
          required: Boolean(param.required),
          validate: createLazyValidator(coercingAjv, param.schema, true, lazy),
        };
        if (param.in === "path") {
          pathParams.push(compiled);
        } else {
          queryParams.push(compiled);
        }
      }

      const mediaTypes = new Map<string, CompiledMediaType>();
      let bodyRequired = false;
      if (op.requestBody) {
        const reqBody = resolveMaybeRef<RequestBodyObject>(spec, op.requestBody);
        bodyRequired = Boolean(reqBody.required);
        for (const [mimeType, mediaObj] of Object.entries(reqBody.content ?? {})) {
          const normalized = mimeType.toLowerCase();
          const allowCoercion = normalized === "application/x-www-form-urlencoded";
          const validatorAjv = allowCoercion ? coercingAjv : strictAjv;
          mediaTypes.set(normalized, {
            mimeType: normalized,
            allowCoercion,
            validate: createLazyValidator(validatorAjv, mediaObj.schema, false, lazy),
          });
        }
      }

      const okResponse = op.responses?.["200"]
        ? resolveMaybeRef<ResponseObject>(spec, op.responses["200"])
        : undefined;
      const responseMedia =
        okResponse?.content?.["application/json"] ?? okResponse?.content?.["*/*"];
      const validateResponse = createLazyValidator(strictAjv, responseMedia?.schema, false, lazy);

      operations.set(method, {
        operationId: op.operationId,
        operationObject: op,
        pathParams,
        queryParams,
        bodyRequired,
        mediaTypes,
        validateResponse,
      });
    }

    const compiledPath: CompiledPath = { template, operations };
    if (template.includes("{")) {
      dynamicRoutes.push({ compiledPath, ...compileTemplate(template) });
    } else {
      staticRoutes.set(template, compiledPath);
    }
  }

  // Sort dynamic routes by specificity so literal-rich paths (e.g. `/{tenantId}:getIamPolicy`)
  // always match ahead of bare parameter paths (e.g. `/{tenantId}`).
  dynamicRoutes.sort((a, b) => {
    if (b.staticSegmentCount !== a.staticSegmentCount) {
      return b.staticSegmentCount - a.staticSegmentCount;
    }
    return b.literalLength - a.literalLength;
  });

  function resolveRoute(
    pathname: string,
  ): { compiledPath: CompiledPath; rawPathParams: Record<string, string> } | undefined {
    const exact = staticRoutes.get(pathname);
    if (exact) {
      return { compiledPath: exact, rawPathParams: {} };
    }
    for (const route of dynamicRoutes) {
      const match = route.regex.exec(pathname);
      if (!match) {
        continue;
      }
      const rawPathParams: Record<string, string> = {};
      for (let i = 0; i < route.paramNames.length; i++) {
        const raw = match[i + 1];
        try {
          rawPathParams[route.paramNames[i]] = decodeURIComponent(raw);
        } catch {
          rawPathParams[route.paramNames[i]] = raw;
        }
      }
      return { compiledPath: route.compiledPath, rawPathParams };
    }
    return undefined;
  }

  async function authenticate(
    operation: CompiledOperation,
    ctx: AuthOperationContext,
  ): Promise<void> {
    const requirements = operation.operationObject.security ?? spec.security ?? [];
    if (requirements.length === 0) {
      return;
    }

    const securitySchemes = spec.components?.securitySchemes ?? {};
    const tried = new Map<string, AuthResult | undefined>();

    for (const requirement of requirements) {
      const schemeNames = Object.keys(requirement);
      if (schemeNames.length === 0) {
        ctx.security = {};
        return;
      }
      const matched: Record<string, AuthResult> = {};
      let allSucceeded = true;

      for (const schemeName of schemeNames) {
        let authResult: AuthResult | undefined;
        if (tried.has(schemeName)) {
          authResult = tried.get(schemeName);
        } else {
          const authenticator = options.authenticators[schemeName];
          const rawScheme = securitySchemes[schemeName];
          if (!authenticator || !rawScheme) {
            authResult = undefined;
          } else {
            const schemeObj = resolveMaybeRef<SecuritySchemeObject>(spec, rawScheme);
            authResult = await authenticator(ctx, schemeObj);
          }
          tried.set(schemeName, authResult);
        }
        if (!authResult) {
          allSucceeded = false;
          break;
        }
        matched[schemeName] = authResult;
      }

      if (allSucceeded) {
        ctx.security = matched;
        const firstSuccess = Object.values(matched)[0];
        ctx.user = firstSuccess?.user;
        return;
      }
    }

    options.onUnauthenticated(ctx);
  }

  return (req, res, next) => {
    const parsedUrl = new URL(req.url, "http://localhost");
    const resolved = resolveRoute(parsedUrl.pathname);
    if (!resolved) {
      return next();
    }

    const method = req.method.toLowerCase() as HttpMethod;
    const operation = resolved.compiledPath.operations.get(method);
    if (!operation) {
      const allowed = [...resolved.compiledPath.operations.keys()]
        .map((m) => m.toUpperCase())
        .join(",");
      res
        .status(405)
        .set("allow", allowed)
        .json({ message: `Method ${req.method} not allowed for ${req.url}` });
      return;
    }

    const ctx: AuthOperationContext = {
      req,
      res,
      api: {
        openApiDoc: spec,
        operationObject: operation.operationObject,
      },
      params: {
        path: {},
        query: {},
      },
      requestBody: undefined,
    };

    void (async () => {
      await authenticate(operation, ctx);

      // Parse & validate path parameters.
      for (const param of operation.pathParams) {
        const rawValue = resolved.rawPathParams[param.name];
        const validated = validateWrappedValue(
          param.validate(),
          rawValue,
          `path parameter "${param.name}"`,
          param.required,
        );
        if (validated !== undefined) {
          ctx.params.path[param.name] = String(validated);
        }
      }

      // Parse & validate query parameters from req.url so legacy route rewrites are honored.
      const rawQuery = new Map<string, string | string[]>();
      for (const [key, value] of parsedUrl.searchParams.entries()) {
        const existing = rawQuery.get(key);
        if (existing === undefined) {
          rawQuery.set(key, value);
        } else if (Array.isArray(existing)) {
          existing.push(value);
        } else {
          rawQuery.set(key, [existing, value]);
        }
      }
      for (const param of operation.queryParams) {
        const rawValue = rawQuery.get(param.name);
        const validated = validateWrappedValue(
          param.validate(),
          rawValue,
          `query parameter "${param.name}"`,
          param.required,
        );
        if (validated !== undefined) {
          ctx.params.query[param.name] = validated;
        }
      }

      // Parse & validate request body.
      const rawContentType = req.headers["content-type"];
      if (rawContentType) {
        const mimeType = normalizeMimeType(rawContentType);
        const compiledMedia = operation.mediaTypes.get(mimeType) ?? operation.mediaTypes.get("*/*");
        if (!compiledMedia) {
          if (requestHasBody(req.headers) || METHODS_WITH_BODY.has(method)) {
            throw new BadRequestError(`Invalid content-type: ${rawContentType}`, "unknown");
          }
        } else {
          const alreadyParsed = Boolean((req as unknown as { _body?: boolean })._body);
          if (!alreadyParsed) {
            try {
              if (compiledMedia.mimeType === "application/x-www-form-urlencoded") {
                await runBodyParser(urlEncodedParser, req, res);
              } else {
                await runBodyParser(jsonParser, req, res);
              }
            } catch (err: unknown) {
              const parseErr = err as Error & { type?: string };
              if (parseErr.type === "entity.parse.failed") {
                const message = `Invalid JSON payload received. ${parseErr.message}`;
                throw new InvalidArgumentError(message, [
                  {
                    message,
                    domain: "global",
                    reason: "parseError",
                  },
                ]);
              }
              throw err;
            }
          }
          const validatedBody = runBodyValidation(
            compiledMedia.validate(),
            req.body,
            options.transformAndValidateBody,
          );
          ctx.requestBody = req.body = validatedBody;
        }
      } else if (operation.bodyRequired && operation.mediaTypes.size > 0) {
        const expected = [...operation.mediaTypes.keys()].join(", ");
        throw new BadRequestError(`Missing content-type. Expected one of: ${expected}`, "unknown");
      }

      const handler = options.resolveHandler(operation.operationId);
      const result = await handler(ctx);
      if (res.headersSent) {
        return;
      }

      const responseValidator = operation.validateResponse();
      if (responseValidator && options.onResponseValidationError) {
        // Stringify & re-parse before validation to strip `undefined` properties and invoke
        // any `toJSON()` methods, matching what `res.json()` emits on the wire.
        const serialized = JSON.stringify(result);
        const wireBody = serialized === undefined ? undefined : JSON.parse(serialized);
        if (!responseValidator(wireBody) && responseValidator.errors?.length) {
          options.onResponseValidationError(responseValidator.errors);
        }
      }

      res.status(200).json(result);
    })().catch(next);
  };
}
