import { expect } from "chai";
import * as sinon from "sinon";

import { convertConfig } from "../../../deploy/hosting/convertConfig";
import * as backend from "../../../deploy/functions/backend";
import { Context, HostingDeploy } from "../../../deploy/hosting/context";
import { HostingSingle } from "../../../firebaseConfig";
import * as api from "../../../hosting/api";
import { FirebaseError } from "../../../error";
import { Payload } from "../../../deploy/functions/args";
import * as runTags from "../../../hosting/runTags";
import * as experiments from "../../../experiments";

const FUNCTION_ID = "functionId";
const SERVICE_ID = "function-id";
const PROJECT_ID = "project";
const REGION = "region";

function endpoint(opts?: Partial<backend.Endpoint>): backend.Endpoint {
  // Create a type that allows us to not have a trigger
  const ret: Omit<backend.Endpoint, "httpsTrigger"> & { httpsTrigger?: backend.HttpsTrigger } = {
    id: FUNCTION_ID,
    project: PROJECT_ID,
    entryPoint: FUNCTION_ID,
    region: REGION,
    runtime: "nodejs16",
    platform: "gcfv1",
    ...opts,
  };
  if (
    !(
      "httpsTrigger" in ret ||
      "eventTrigger" in ret ||
      "callableTrigger" in ret ||
      "scheduledTrigger" in ret ||
      "taskQueueTrigger" in ret ||
      "blockingTrigger" in ret
    )
  ) {
    ret.httpsTrigger = {};
  }
  if (opts?.platform === "gcfv2") {
    ret.runServiceId = opts?.id ?? SERVICE_ID;
  }
  return ret as backend.Endpoint;
}

describe("convertConfig", () => {
  let setRewriteTagsStub: sinon.SinonStub;

  let wasPinTagsEnabled: boolean;
  before(() => {
    wasPinTagsEnabled = experiments.isEnabled("pintags");
    experiments.setEnabled("pintags", true);
  });

  after(() => {
    experiments.setEnabled("pintags", wasPinTagsEnabled);
  });

  beforeEach(() => {
    setRewriteTagsStub = sinon.stub(runTags, "setRewriteTags");
    setRewriteTagsStub.resolves();
  });

  afterEach(() => {
    setRewriteTagsStub.restore();
  });

  const tests: Array<{
    name: string;
    input: HostingSingle;
    want: api.ServingConfig;
    functionsPayload?: Payload;
    existingBackend?: backend.Backend;
  }> = [
    // Rewrites.
    {
      name: "returns rewrites for glob destination",
      input: { rewrites: [{ glob: "/foo", destination: "https://example.com" }] },
      want: { rewrites: [{ glob: "/foo", path: "https://example.com" }] },
    },
    {
      name: "returns rewrites for regex destination",
      input: { rewrites: [{ glob: "/foo$", destination: "https://example.com" }] },
      want: { rewrites: [{ glob: "/foo$", path: "https://example.com" }] },
    },
    {
      name: "checks for function region if unspecified",
      input: { rewrites: [{ glob: "/foo", function: { functionId: FUNCTION_ID } }] },
      want: {
        rewrites: [
          {
            glob: "/foo",
            function: FUNCTION_ID,
            functionRegion: "us-central2",
          },
        ],
      },
      functionsPayload: {
        functions: {
          default: {
            wantBackend: backend.of({
              id: FUNCTION_ID,
              project: PROJECT_ID,
              entryPoint: FUNCTION_ID,
              runtime: "nodejs16",
              region: "us-central2",
              platform: "gcfv1",
              httpsTrigger: {},
            }),
            haveBackend: backend.empty(),
          },
        },
      },
    },
    {
      name: "discovers the function region of a callable function",
      input: { rewrites: [{ glob: "/foo", function: { functionId: FUNCTION_ID } }] },
      want: { rewrites: [{ glob: "/foo", function: FUNCTION_ID, functionRegion: "us-central2" }] },
      functionsPayload: {
        functions: {
          default: {
            wantBackend: backend.of({
              id: FUNCTION_ID,
              project: PROJECT_ID,
              entryPoint: FUNCTION_ID,
              runtime: "nodejs16",
              region: "us-central2",
              platform: "gcfv1",
              httpsTrigger: {},
            }),
            haveBackend: backend.empty(),
          },
        },
      },
    },
    {
      name: "returns rewrites for glob CF3",
      input: {
        rewrites: [{ glob: "/foo", function: { functionId: FUNCTION_ID, region: "europe-west2" } }],
      },
      want: { rewrites: [{ glob: "/foo", function: FUNCTION_ID, functionRegion: "europe-west2" }] },
      functionsPayload: {
        functions: {
          default: {
            wantBackend: backend.of(
              {
                id: FUNCTION_ID,
                project: PROJECT_ID,
                entryPoint: FUNCTION_ID,
                runtime: "nodejs16",
                region: "europe-west2",
                platform: "gcfv1",
                httpsTrigger: {},
              },
              {
                id: FUNCTION_ID,
                project: PROJECT_ID,
                entryPoint: FUNCTION_ID,
                runtime: "nodejs16",
                region: "us-central1",
                platform: "gcfv2",
                httpsTrigger: {},
              },
            ),
            haveBackend: backend.empty(),
          },
        },
      },
    },
    {
      name: "defaults to a us-central1 rewrite if one is avaiable, v1 edition",
      input: { rewrites: [{ glob: "/foo", function: { functionId: FUNCTION_ID } }] },
      want: { rewrites: [{ glob: "/foo", function: FUNCTION_ID, functionRegion: "us-central1" }] },
      functionsPayload: {
        functions: {
          default: {
            wantBackend: backend.of(
              {
                id: FUNCTION_ID,
                project: PROJECT_ID,
                entryPoint: FUNCTION_ID,
                runtime: "nodejs16",
                region: "europe-west2",
                platform: "gcfv1",
                httpsTrigger: {},
              },
              {
                id: FUNCTION_ID,
                project: PROJECT_ID,
                entryPoint: FUNCTION_ID,
                runtime: "nodejs16",
                region: "us-central1",
                platform: "gcfv1",
                httpsTrigger: {},
              },
            ),
            haveBackend: backend.empty(),
          },
        },
      },
    },
    {
      name: "defaults to a us-central1 rewrite if one is avaiable, v2 edition",
      input: { rewrites: [{ glob: "/foo", function: { functionId: FUNCTION_ID } }] },
      want: {
        rewrites: [{ glob: "/foo", run: { region: "us-central1", serviceId: SERVICE_ID } }],
      },
      functionsPayload: {
        functions: {
          default: {
            wantBackend: backend.of(
              {
                id: FUNCTION_ID,
                project: PROJECT_ID,
                entryPoint: FUNCTION_ID,
                runtime: "nodejs16",
                region: "europe-west2",
                platform: "gcfv2",
                httpsTrigger: {},
                runServiceId: SERVICE_ID,
              },
              {
                id: FUNCTION_ID,
                project: PROJECT_ID,
                entryPoint: FUNCTION_ID,
                runtime: "nodejs16",
                region: "us-central1",
                platform: "gcfv2",
                httpsTrigger: {},
                runServiceId: SERVICE_ID,
              },
            ),
            haveBackend: backend.empty(),
          },
        },
      },
    },
    {
      name: "returns rewrites for regex CF3",
      input: {
        rewrites: [{ regex: "/foo$", function: { functionId: FUNCTION_ID, region: REGION } }],
      },
      want: {
        rewrites: [{ regex: "/foo$", function: FUNCTION_ID, functionRegion: REGION }],
      },
      functionsPayload: {
        functions: {
          default: {
            wantBackend: backend.of({
              id: FUNCTION_ID,
              project: PROJECT_ID,
              entryPoint: FUNCTION_ID,
              runtime: "nodejs16",
              region: REGION,
              platform: "gcfv1",
              httpsTrigger: {},
            }),
            haveBackend: backend.empty(),
          },
        },
      },
    },
    {
      name: "rewrites referencing CF3v2 functions being deployed are changed to Cloud Run (during release)",
      input: { rewrites: [{ regex: "/foo$", function: { functionId: FUNCTION_ID } }] },
      want: { rewrites: [{ regex: "/foo$", run: { serviceId: SERVICE_ID, region: REGION } }] },
      functionsPayload: {
        functions: {
          default: {
            wantBackend: backend.of({
              id: FUNCTION_ID,
              project: PROJECT_ID,
              entryPoint: FUNCTION_ID,
              runtime: "nodejs16",
              region: REGION,
              platform: "gcfv2",
              httpsTrigger: {},
              runServiceId: SERVICE_ID,
            }),
            haveBackend: backend.empty(),
          },
        },
      },
    },
    {
      name: "rewrites referencing existing CF3v2 functions are changed to Cloud Run (during prepare)",
      input: {
        rewrites: [
          { regex: "/foo$", function: { functionId: FUNCTION_ID, region: "us-central1" } },
        ],
      },
      want: {
        rewrites: [{ regex: "/foo$", run: { serviceId: SERVICE_ID, region: "us-central1" } }],
      },
      existingBackend: backend.of(endpoint({ platform: "gcfv2", region: "us-central1" })),
    },
    {
      name: "rewrites referencing existing CF3v2 functions are changed to Cloud Run (during release)",
      input: {
        rewrites: [
          { regex: "/foo$", function: { functionId: FUNCTION_ID, region: "us-central1" } },
        ],
      },
      existingBackend: backend.of(endpoint({ platform: "gcfv2", region: "us-central1" })),
      want: {
        rewrites: [{ regex: "/foo$", run: { serviceId: SERVICE_ID, region: "us-central1" } }],
      },
    },
    {
      name: "returns rewrites for glob Run",
      input: { rewrites: [{ glob: "/foo", run: { serviceId: "hello" } }] },
      want: { rewrites: [{ glob: "/foo", run: { region: "us-central1", serviceId: "hello" } }] },
    },
    {
      name: "returns rewrites for regex Run",
      input: { rewrites: [{ regex: "/foo$", run: { serviceId: "hello" } }] },
      want: { rewrites: [{ regex: "/foo$", run: { region: "us-central1", serviceId: "hello" } }] },
    },
    {
      name: "return rewrites for Cloud Run instances being deployed (during release)",
      input: { rewrites: [{ regex: "/foo$", run: { serviceId: "hello" } }] },
      want: { rewrites: [{ regex: "/foo$", run: { region: "us-central1", serviceId: "hello" } }] },
    },
    {
      name: "returns the specified rewrite even if it's not found",
      input: { rewrites: [{ glob: "/foo", function: { functionId: FUNCTION_ID } }] },
      want: { rewrites: [{ glob: "/foo", function: FUNCTION_ID }] },
      existingBackend: backend.empty(),
    },
    {
      name: "returns rewrites for Run with specified regions",
      input: { rewrites: [{ glob: "/foo", run: { serviceId: "hello", region: "us-midwest" } }] },
      want: { rewrites: [{ glob: "/foo", run: { region: "us-midwest", serviceId: "hello" } }] },
    },
    {
      name: "returns rewrites for glob Dynamic Links",
      input: { rewrites: [{ glob: "/foo", dynamicLinks: true }] },
      want: { rewrites: [{ glob: "/foo", dynamicLinks: true }] },
    },
    {
      name: "returns rewrites for regex Dynamic Links",
      input: { rewrites: [{ regex: "/foo$", dynamicLinks: true }] },
      want: { rewrites: [{ regex: "/foo$", dynamicLinks: true }] },
    },
    // Redirects.
    {
      name: "returns glob redirects without a specified code/type",
      input: { redirects: [{ glob: "/foo", destination: "https://example.com" }] },
      want: { redirects: [{ glob: "/foo", location: "https://example.com" }] },
    },
    {
      name: "returns regex redirects without a specified code/type",
      input: { redirects: [{ regex: "/foo$", destination: "https://example.com" }] },
      want: { redirects: [{ regex: "/foo$", location: "https://example.com" }] },
    },
    {
      name: "returns glob redirects with a specified code/type",
      input: { redirects: [{ glob: "/foo", destination: "https://example.com", type: 301 }] },
      want: { redirects: [{ glob: "/foo", location: "https://example.com", statusCode: 301 }] },
    },
    // Headers.
    {
      name: "returns no headers if they weren't specified",
      input: { headers: [{ glob: "/foo", headers: [] }] },
      want: { headers: [{ glob: "/foo", headers: {} }] },
    },
    {
      name: "returns glob headers as a map",
      input: {
        headers: [
          {
            glob: "/foo",
            headers: [
              { key: "x-foo", value: "bar" },
              { key: "x-baz", value: "zap" },
            ],
          },
        ],
      },
      want: { headers: [{ glob: "/foo", headers: { "x-foo": "bar", "x-baz": "zap" } }] },
    },
    {
      name: "returns regex headers as a map",
      input: {
        headers: [
          {
            regex: "/foo&",
            headers: [
              { key: "x-foo", value: "bar" },
              { key: "x-baz", value: "zap" },
            ],
          },
        ],
      },
      want: { headers: [{ regex: "/foo&", headers: { "x-foo": "bar", "x-baz": "zap" } }] },
    },
    // Clean URLs.
    {
      name: "returns clean URLs when it is false",
      input: { cleanUrls: false },
      want: { cleanUrls: false },
    },
    {
      name: "returns clean URLs when it is true",
      input: { cleanUrls: true },
      want: { cleanUrls: true },
    },
    // Trailing Slash.
    {
      name: "returns trailing slash as ADD when true",
      input: { trailingSlash: true },
      want: { trailingSlashBehavior: "ADD" },
    },
    {
      name: "returns trailing slash as REMOVE when false",
      input: { trailingSlash: false },
      want: { trailingSlashBehavior: "REMOVE" },
    },
    // App Association.
    {
      name: "returns app association as it is set",
      input: { appAssociation: "AUTO" },
      want: { appAssociation: "AUTO" },
    },
    // i18n.
    {
      name: "returns i18n as it is set",
      input: { i18n: { root: "bar" } },
      want: { i18n: { root: "bar" } },
    },
    // Tag pinning.
    {
      name: "rewrites v2 functions tags",
      input: { rewrites: [{ glob: "**", function: { functionId: FUNCTION_ID, pinTag: true } }] },
      want: {
        rewrites: [
          {
            glob: "**",
            run: { serviceId: SERVICE_ID, region: REGION, tag: runTags.TODO_TAG_NAME },
          },
        ],
      },
      existingBackend: backend.of({
        id: FUNCTION_ID,
        project: PROJECT_ID,
        entryPoint: FUNCTION_ID,
        runtime: "nodejs16",
        region: REGION,
        platform: "gcfv2",
        httpsTrigger: {},
        runServiceId: SERVICE_ID,
      }),
    },
    {
      name: "rewrites run tags",
      input: { rewrites: [{ glob: "**", run: { serviceId: SERVICE_ID, pinTag: true } }] },
      want: {
        rewrites: [
          {
            glob: "**",
            run: { serviceId: SERVICE_ID, region: "us-central1", tag: runTags.TODO_TAG_NAME },
          },
        ],
      },
    },
  ];

  for (const { name, input, existingBackend, want, functionsPayload } of tests) {
    it(name, async () => {
      const context: Context = {
        projectId: PROJECT_ID,
        loadedExistingBackend: true,
        existingBackend: existingBackend || backend.empty(),
        unreachableRegions: {
          gcfV1: [],
          gcfV2: [],
        },
      };
      const deploy: HostingDeploy = {
        config: { site: "site", ...input },
        version: "version",
      };
      const config = await convertConfig(context, functionsPayload || {}, deploy);
      expect(config).to.deep.equal(want);
    });
  }

  describe("rewrites errors", () => {
    let existingBackendStub: sinon.SinonStub;

    beforeEach(() => {
      existingBackendStub = sinon
        .stub(backend, "existingBackend")
        .rejects(
          new FirebaseError("Some permissions 403 error (that should be caught)", { status: 403 }),
        );
    });

    afterEach(() => {
      existingBackendStub.restore();
    });

    it("should throw when rewrite points to function in the wrong region", async () => {
      await expect(
        convertConfig(
          { projectId: "1" },
          {
            functions: {
              default: {
                wantBackend: backend.of({
                  id: FUNCTION_ID,
                  project: PROJECT_ID,
                  entryPoint: FUNCTION_ID,
                  runtime: "nodejs16",
                  region: "europe-west1",
                  platform: "gcfv1",
                  httpsTrigger: {},
                }),
                haveBackend: backend.empty(),
              },
            },
          },
          {
            config: {
              site: "foo",
              rewrites: [
                { glob: "/foo", function: { functionId: FUNCTION_ID, region: "asia-northeast1" } },
              ],
            },
            version: "14",
          },
        ),
      ).to.eventually.be.rejectedWith(FirebaseError);
    });
    it("should throw when rewrite points to function being deleted", async () => {
      await expect(
        convertConfig(
          { projectId: "1" },
          {
            functions: {
              default: {
                wantBackend: backend.of({
                  id: FUNCTION_ID,
                  project: PROJECT_ID,
                  entryPoint: FUNCTION_ID,
                  runtime: "nodejs16",
                  region: "europe-west1",
                  platform: "gcfv1",
                  httpsTrigger: {},
                }),
                haveBackend: backend.of({
                  id: FUNCTION_ID,
                  project: PROJECT_ID,
                  entryPoint: FUNCTION_ID,
                  runtime: "nodejs16",
                  region: "asia-northeast1",
                  platform: "gcfv1",
                  httpsTrigger: {},
                }),
              },
            },
          },
          {
            config: {
              site: "foo",
              rewrites: [
                { glob: "/foo", function: { functionId: FUNCTION_ID, region: "asia-northeast1" } },
              ],
            },
            version: "14",
          },
        ),
      ).to.eventually.be.rejectedWith(FirebaseError);
    });
  });

  describe("with permissions issues", () => {
    let existingBackendStub: sinon.SinonStub;

    beforeEach(() => {
      existingBackendStub = sinon
        .stub(backend, "existingBackend")
        .rejects("existingBackend unspecified behavior");
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should not throw when resolving backends", async () => {
      existingBackendStub.rejects(
        new FirebaseError("Some permissions 403 error (that should be caught)", { status: 403 }),
      );

      await expect(
        convertConfig(
          { projectId: "1" },
          {},
          {
            config: {
              site: "foo",
              rewrites: [{ glob: "/foo", function: { functionId: FUNCTION_ID } }],
            },
            version: "14",
          },
        ),
      ).to.not.be.rejected;
    });
  });
});
