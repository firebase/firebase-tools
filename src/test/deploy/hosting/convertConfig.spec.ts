import { expect } from "chai";
import { HostingConfig } from "../../../firebaseConfig";
import { convertConfig } from "../../../deploy/hosting/convertConfig";
import * as args from "../../../deploy/functions/args";
import * as backend from "../../../deploy/functions/backend";

const DEFAULT_CONTEXT = {
  loadedExistingBackend: true,
  existingBackend: {
    endpoints: {},
  },
};

const DEFAULT_PAYLOAD = {};

describe("convertConfig", () => {
  const tests: Array<{
    name: string;
    input: HostingConfig | undefined;
    want: any;
    payload?: args.Payload;
    finalize?: boolean;
    context?: any;
  }> = [
    {
      name: "returns nothing if no config is provided",
      input: undefined,
      want: {},
    },
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
      name: "defaults to us-central1 for CF3",
      input: { rewrites: [{ glob: "/foo", function: "foofn" }] },
      want: { rewrites: [{ glob: "/foo", function: "foofn", functionRegion: "us-central1" }] },
    },
    {
      name: "returns rewrites for glob CF3",
      input: { rewrites: [{ glob: "/foo", function: "foofn", region: "europe-west2" }] },
      want: { rewrites: [{ glob: "/foo", function: "foofn", functionRegion: "europe-west2" }] },
    },
    {
      name: "returns rewrites for regex CF3",
      input: { rewrites: [{ regex: "/foo$", function: "foofn", region: "us-central1" }] },
      want: { rewrites: [{ regex: "/foo$", function: "foofn", functionRegion: "us-central1" }] },
    },
    {
      name: "skips functions referencing CF3v2 functions being deployed (during prepare)",
      input: { rewrites: [{ regex: "/foo$", function: "foofn", region: "us-central1" }] },
      payload: {
        functions: {
          default: {
            wantBackend: backend.of({
              id: "foofn",
              project: "my-project",
              entryPoint: "foofn",
              runtime: "nodejs14",
              region: "us-central1",
              platform: "gcfv2",
              httpsTrigger: {},
            }),
            haveBackend: backend.empty(),
          },
        },
      },
      want: { rewrites: [] },
      finalize: false,
    },
    {
      name: "rewrites referencing CF3v2 functions being deployed are changed to Cloud Run (during release)",
      input: { rewrites: [{ regex: "/foo$", function: "foofn", region: "us-central1" }] },
      payload: {
        functions: {
          default: {
            wantBackend: backend.of({
              id: "foofn",
              project: "my-project",
              entryPoint: "foofn",
              runtime: "nodejs14",
              region: "us-central1",
              platform: "gcfv2",
              httpsTrigger: {},
            }),
            haveBackend: backend.empty(),
          },
        },
      },
      want: { rewrites: [{ regex: "/foo$", run: { serviceId: "foofn", region: "us-central1" } }] },
      finalize: true,
    },
    {
      name: "rewrites referencing existing CF3v2 functions are changed to Cloud Run (during prepare)",
      input: { rewrites: [{ regex: "/foo$", function: "foofn", region: "us-central1" }] },
      context: {
        loadedExistingBackend: true,
        existingBackend: {
          endpoints: {
            "us-central1": {
              foofn: { id: "foofn", region: "us-central1", platform: "gcfv2", httpsTrigger: true },
            },
          },
        },
      },
      want: { rewrites: [{ regex: "/foo$", run: { serviceId: "foofn", region: "us-central1" } }] },
      finalize: true,
    },
    {
      name: "rewrites referencing existing CF3v2 functions are changed to Cloud Run (during release)",
      input: { rewrites: [{ regex: "/foo$", function: "foofn", region: "us-central1" }] },
      context: {
        loadedExistingBackend: true,
        existingBackend: {
          endpoints: {
            "us-central1": {
              foofn: { id: "foofn", region: "us-central1", platform: "gcfv2", httpsTrigger: true },
            },
          },
        },
      },
      want: { rewrites: [{ regex: "/foo$", run: { serviceId: "foofn", region: "us-central1" } }] },
      finalize: true,
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
      name: "skips rewrites for Cloud Run instances being deployed (during prepare)",
      input: { rewrites: [{ regex: "/foo$", run: { serviceId: "hello" } }] },
      want: { rewrites: [] },
      payload: {
        functions: {
          default: {
            wantBackend: backend.of({
              id: "hello",
              project: "my-project",
              entryPoint: "hello",
              runtime: "nodejs14",
              region: "us-central1",
              platform: "gcfv2",
              httpsTrigger: {},
            }),
            haveBackend: backend.empty(),
          },
        },
      },
      finalize: false,
    },
    {
      name: "return rewrites for Cloud Run instances being deployed (during release)",
      input: { rewrites: [{ regex: "/foo$", run: { serviceId: "hello" } }] },
      want: { rewrites: [{ regex: "/foo$", run: { region: "us-central1", serviceId: "hello" } }] },
      payload: {
        functions: {
          default: {
            wantBackend: backend.of({
              id: "hello",
              project: "my-project",
              entryPoint: "hello",
              runtime: "nodejs14",
              region: "us-central1",
              platform: "gcfv2",
              httpsTrigger: {},
            }),
            haveBackend: backend.empty(),
          },
        },
      },
      finalize: true,
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
      input: { appAssociation: "myApp" },
      want: { appAssociation: "myApp" },
    },
    // i18n.
    {
      name: "returns i18n as it is set",
      input: { i18n: { root: "bar" } },
      want: { i18n: { root: "bar" } },
    },
  ];

  for (const {
    name,
    context = DEFAULT_CONTEXT,
    input,
    payload = DEFAULT_PAYLOAD,
    want,
    finalize = true,
  } of tests) {
    it(name, async () => {
      const config = await convertConfig(context, payload, input, finalize);
      expect(config).to.deep.equal(want);
    });
  }
});
