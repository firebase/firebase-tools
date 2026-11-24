import { expect } from "chai";
import * as express from "express";
import { OpenAPIObject } from "openapi3-ts";
import * as supertest from "supertest";
import {
  ApiError,
  InternalError,
  NotFoundError,
  PermissionDeniedError,
  UnauthenticatedError,
} from "./errors";
import { createOpenApiMiddleware, OperationHandler } from "./openapiRouter";

function buildTestApp(
  spec: OpenAPIObject,
  handlers: Record<string, OperationHandler>,
  opts: {
    lazyCompileValidationSchemas?: boolean;
    onResponseValidationError?: () => never;
  } = {},
): express.Express {
  const app = express();
  app.use(
    createOpenApiMiddleware(spec, {
      lazyCompileValidationSchemas: opts.lazyCompileValidationSchemas ?? true,
      resolveHandler: (opId) => {
        const handler = handlers[opId];
        if (!handler) {
          throw new Error(`Missing handler: ${opId}`);
        }
        return handler;
      },
      authenticators: {
        apiKeyQuery: (ctx, info) => {
          const val = ctx.req.query[info.name || "key"];
          return typeof val === "string" && val ? { type: "success", user: val } : undefined;
        },
        Oauth2: (ctx) => {
          const auth = ctx.req.headers.authorization;
          if (!auth?.startsWith("Bearer ")) {
            return undefined;
          }
          const tok = auth.slice("Bearer ".length);
          if (tok === "owner") {
            return { type: "success", user: "owner-project", scopes: ["cloud-platform"] };
          }
          throw new UnauthenticatedError("Invalid token", "authError");
        },
      },
      onUnauthenticated: () => {
        throw new PermissionDeniedError("Missing credentials");
      },
      onResponseValidationError:
        opts.onResponseValidationError ??
        (() => {
          throw new InternalError("Response validation failed", "response-validation");
        }),
    }),
  );
  app.use(() => {
    throw new NotFoundError();
  });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use(((err, _req, res, _next) => {
    if (err instanceof ApiError) {
      return res.status(err.code).json({ error: err });
    }
    return res.status(500).json({ error: { message: String(err) } });
  }) as express.ErrorRequestHandler);
  return app;
}

const sampleSpec: OpenAPIObject = {
  openapi: "3.0.3",
  info: { title: "Test API", version: "1.0.0" },
  paths: {
    "/v2/projects/{targetProjectId}/tenants/{tenantId}": {
      get: {
        operationId: "tenants.get",
        parameters: [
          { name: "targetProjectId", in: "path", required: true, schema: { type: "string" } },
          { name: "tenantId", in: "path", required: true, schema: { type: "string" } },
          { name: "pageSize", in: "query", schema: { type: "integer" } },
          { name: "includeDeleted", in: "query", schema: { type: "boolean", default: false } },
        ],
        security: [{ Oauth2: [] }, { apiKeyQuery: [] }],
        responses: {
          "200": {
            description: "ok",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TenantResponse" },
              },
            },
          },
        },
      },
    },
    "/v2/projects/{targetProjectId}/tenants/{tenantId}:getIamPolicy": {
      post: {
        operationId: "tenants.getIamPolicy",
        parameters: [
          { name: "targetProjectId", in: "path", required: true, schema: { type: "string" } },
          { name: "tenantId", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PolicyRequest" },
            },
          },
        },
        security: [{ Oauth2: [] }],
        responses: {
          "200": {
            description: "ok",
            content: {
              "application/json": {
                schema: { type: "object", properties: { policy: { type: "string" } } },
              },
            },
          },
        },
      },
    },
    "/v1/token": {
      post: {
        operationId: "token.exchange",
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TokenRequest" },
            },
            "application/x-www-form-urlencoded": {
              schema: { $ref: "#/components/schemas/TokenRequest" },
            },
          },
        },
        security: [{ apiKeyQuery: [] }],
        responses: {
          "200": {
            description: "ok",
            content: {
              "application/json": {
                schema: { type: "object", properties: { ok: { type: "boolean" } } },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      TenantResponse: {
        type: "object",
        properties: {
          projectId: { type: "string" },
          tenantId: { type: "string" },
          pageSize: { type: "integer" },
          includeDeleted: { type: "boolean" },
          optionalField: { type: "string" },
        },
      },
      PolicyRequest: {
        type: "object",
        properties: {
          nested: {
            type: "object",
            properties: {
              items: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
      TokenRequest: {
        type: "object",
        properties: {
          grantType: { type: "string" },
          expiresIn: { type: "integer" },
        },
      },
    },
    securitySchemes: {
      Oauth2: { type: "oauth2", flows: {} },
      apiKeyQuery: { type: "apiKey", in: "query", name: "key" },
    },
  },
};

describe("openapiRouter", () => {
  it("prioritizes literal colon-suffix routes ahead of bare parameter routes", async () => {
    const app = buildTestApp(sampleSpec, {
      "tenants.get": (ctx) => ({
        projectId: ctx.params.path.targetProjectId,
        tenantId: ctx.params.path.tenantId,
      }),
      "tenants.getIamPolicy": (ctx) => ({
        policy: `${ctx.params.path.targetProjectId}/${ctx.params.path.tenantId}`,
      }),
    });

    const res = await supertest(app)
      .post("/v2/projects/my-proj/tenants/my-tenant:getIamPolicy")
      .set("Authorization", "Bearer owner")
      .send({});
    expect(res.status).to.equal(200);
    expect(res.body).to.deep.equal({ policy: "my-proj/my-tenant" });
  });

  it("decodes path parameters, coerces query params, and applies query defaults", async () => {
    const app = buildTestApp(sampleSpec, {
      "tenants.get": (ctx) => ({
        projectId: ctx.params.path.targetProjectId,
        tenantId: ctx.params.path.tenantId,
        pageSize: ctx.params.query.pageSize,
        includeDeleted: ctx.params.query.includeDeleted,
        optionalField: undefined,
      }),
    });

    const res = await supertest(app)
      .get("/v2/projects/proj%201/tenants/t1")
      .query({ key: "k", pageSize: "25" });
    expect(res.status).to.equal(200);
    expect(res.body).to.deep.equal({
      projectId: "proj 1",
      tenantId: "t1",
      pageSize: 25,
      includeDeleted: false,
    });
  });

  it("returns 405 with Allow header for unsupported methods and 404 for unknown paths", async () => {
    const app = buildTestApp(sampleSpec, {
      "tenants.get": () => ({}),
    });

    const wrongMethod = await supertest(app).delete("/v2/projects/p/tenants/t");
    expect(wrongMethod.status).to.equal(405);
    expect(wrongMethod.header["allow"]).to.equal("GET");

    const notFound = await supertest(app).get("/v2/does-not-exist");
    expect(notFound.status).to.equal(404);
  });

  it("handles authentication failures and authenticator errors", async () => {
    const app = buildTestApp(sampleSpec, {
      "tenants.get": () => ({}),
    });

    const missing = await supertest(app).get("/v2/projects/p/tenants/t");
    expect(missing.status).to.equal(403);

    const badToken = await supertest(app)
      .get("/v2/projects/p/tenants/t")
      .set("Authorization", "Bearer invalid");
    expect(badToken.status).to.equal(401);
  });

  it("rejects malformed JSON, schema violations, and unsupported content-types", async () => {
    const app = buildTestApp(sampleSpec, {
      "tenants.getIamPolicy": () => ({ policy: "ok" }),
    });

    const badJson = await supertest(app)
      .post("/v2/projects/p/tenants/t:getIamPolicy")
      .set("Authorization", "Bearer owner")
      .set("Content-Type", "application/json")
      .send("{not valid json");
    expect(badJson.status).to.equal(400);
    expect(badJson.body.error.message).to.include("Invalid JSON payload received.");

    const badSchema = await supertest(app)
      .post("/v2/projects/p/tenants/t:getIamPolicy")
      .set("Authorization", "Bearer owner")
      .send({ nested: { items: "not-an-array" } });
    expect(badSchema.status).to.equal(400);
    expect(badSchema.body.error.message).to.equal(
      "Invalid JSON payload received. /nested/items must be array",
    );

    const badContentType = await supertest(app)
      .post("/v2/projects/p/tenants/t:getIamPolicy")
      .set("Authorization", "Bearer owner")
      .set("Content-Type", "text/plain")
      .send("hello");
    expect(badContentType.status).to.equal(400);
    expect(badContentType.body.error.message).to.include("Invalid content-type");
  });

  it("parses and coerces application/x-www-form-urlencoded request bodies", async () => {
    let seenBody: unknown;
    const app = buildTestApp(sampleSpec, {
      "token.exchange": (ctx) => {
        seenBody = ctx.requestBody;
        return { ok: true };
      },
    });

    const res = await supertest(app)
      .post("/v1/token")
      .query({ key: "k" })
      .type("form")
      .send({ grantType: "refresh_token", expiresIn: "3600" });
    expect(res.status).to.equal(200);
    expect(seenBody).to.deep.equal({ grantType: "refresh_token", expiresIn: 3600 });
  });

  it("validates 200 responses against the OpenAPI schema", async () => {
    const app = buildTestApp(sampleSpec, {
      "tenants.get": () => ({ pageSize: "not-an-integer" }),
    });

    const res = await supertest(app).get("/v2/projects/p/tenants/t").query({ key: "k" });
    expect(res.status).to.equal(500);
    expect(res.body.error.message).to.equal("Response validation failed");
  });

  it("matches empty path parameter segments (e.g. /tenants//accounts:batchCreate)", async () => {
    const emptyParamSpec: OpenAPIObject = {
      ...sampleSpec,
      paths: {
        "/v1/projects/{targetProjectId}/tenants/{tenantId}/accounts:batchCreate": {
          post: {
            operationId: "accounts.batchCreate",
            parameters: [
              { name: "targetProjectId", in: "path", required: true, schema: { type: "string" } },
              { name: "tenantId", in: "path", required: true, schema: { type: "string" } },
            ],
            security: [{ Oauth2: [] }],
            responses: {
              "200": {
                description: "ok",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        projectId: { type: "string" },
                        tenantId: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const app = buildTestApp(emptyParamSpec, {
      "accounts.batchCreate": (ctx) => ({
        projectId: ctx.params.path.targetProjectId,
        tenantId: ctx.params.path.tenantId,
      }),
    });

    const res = await supertest(app)
      .post("/v1/projects/my-proj/tenants//accounts:batchCreate")
      .set("Authorization", "Bearer owner");
    expect(res.status).to.equal(200);
    expect(res.body).to.deep.equal({ projectId: "my-proj", tenantId: "" });
  });

  it("supports eager schema compilation", async () => {
    const app = buildTestApp(
      sampleSpec,
      { "tenants.get": () => ({ projectId: "p", tenantId: "t" }) },
      { lazyCompileValidationSchemas: false },
    );

    const res = await supertest(app).get("/v2/projects/p/tenants/t").query({ key: "k" });
    expect(res.status).to.equal(200);
    expect(res.body.projectId).to.equal("p");
  });
});
