import { expect } from "chai";
import { HostingConfig } from "../../../firebaseConfig";

import { convertConfig } from "../../../deploy/hosting/convertConfig";

describe("convertConfig", () => {
  const tests: Array<{ name: string; input: HostingConfig | undefined; want: any }> = [
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
      name: "returns rewrites for glob CF3",
      input: { rewrites: [{ glob: "/foo", function: "foofn" }] },
      want: { rewrites: [{ glob: "/foo", function: "foofn" }] },
    },
    {
      name: "returns rewrites for regex CF3",
      input: { rewrites: [{ regex: "/foo$", function: "foofn" }] },
      want: { rewrites: [{ regex: "/foo$", function: "foofn" }] },
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

  for (const test of tests) {
    it(test.name, () => {
      expect(convertConfig(test.input)).to.deep.equal(test.want);
    });
  }
});
