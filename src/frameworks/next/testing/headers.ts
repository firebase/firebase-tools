import type { RoutesManifestHeader } from "../interfaces";
import { supportedPaths, unsupportedPaths } from "./paths";

export const supportedHeaders: RoutesManifestHeader[] = [
  ...supportedPaths.map((path) => ({
    source: path,
    regex: "",
    headers: [],
  })),
  {
    regex: "",
    source: "/add-header",
    headers: [
      {
        key: "x-custom-header",
        value: "hello world",
      },
      {
        key: "x-another-header",
        value: "hello again",
      },
    ],
  },
  {
    regex: "",
    source: "/my-other-header/:path",
    headers: [
      {
        key: "x-path",
        value: ":path",
      },
      {
        key: "some:path",
        value: "hi",
      },
      {
        key: "x-test",
        value: "some:value*",
      },
      {
        key: "x-test-2",
        value: "value*",
      },
      {
        key: "x-test-3",
        value: ":value?",
      },
      {
        key: "x-test-4",
        value: ":value+",
      },
      {
        key: "x-test-5",
        value: "something https:",
      },
      {
        key: "x-test-6",
        value: ":hello(world)",
      },
      {
        key: "x-test-7",
        value: "hello(world)",
      },
      {
        key: "x-test-8",
        value: "hello{1,}",
      },
      {
        key: "x-test-9",
        value: ":hello{1,2}",
      },
      {
        key: "content-security-policy",
        value:
          "default-src 'self'; img-src *; media-src media1.com media2.com; script-src userscripts.example.com/:path",
      },
    ],
  },
  {
    regex: "",
    source: "/without-params/url",
    headers: [
      {
        key: "x-origin",
        value: "https://example.com",
      },
    ],
  },
  {
    regex: "",
    source: "/with-params/url/:path*",
    headers: [
      {
        key: "x-url",
        value: "https://example.com/:path*",
      },
    ],
  },
  {
    regex: "",
    source: "/with-params/url2/:path*",
    headers: [
      {
        key: "x-url",
        value: "https://example.com:8080?hello=:path*",
      },
    ],
  },
  {
    regex: "",
    source: "/:path*",
    headers: [
      {
        key: "x-something",
        value: "applied-everywhere",
      },
    ],
  },
  {
    regex: "",
    source: "/catchall-header/:path*",
    headers: [
      {
        key: "x-value",
        value: ":path*",
      },
    ],
  },
  {
    regex: "",
    source: "/named-pattern/:path(.*)",
    headers: [
      {
        key: "x-something",
        value: "value=:path",
      },
      {
        key: "path-:path",
        value: "end",
      },
    ],
  },
  {
    regex: "",
    source: "/my-headers/(.*)",
    headers: [
      {
        key: "x-first-header",
        value: "first",
      },
      {
        key: "x-second-header",
        value: "second",
      },
    ],
  },
];

export const unsupportedHeaders: RoutesManifestHeader[] = [
  ...unsupportedPaths.map((path) => ({
    source: path,
    regex: "",
    headers: [],
  })),
  {
    regex: "",
    source: "/has-header-1",
    has: [
      {
        type: "header",
        key: "x-my-header",
        value: "(?<myHeader>.*)",
      },
    ],
    headers: [
      {
        key: "x-another",
        value: "header",
      },
    ],
  },
  {
    regex: "",
    source: "/has-header-2",
    has: [
      {
        type: "query",
        key: "my-query",
      },
    ],
    headers: [
      {
        key: "x-added",
        value: "value",
      },
    ],
  },
  {
    regex: "",
    source: "/has-header-3",
    has: [
      {
        type: "cookie",
        key: "loggedIn",
        value: "true",
      },
    ],
    headers: [
      {
        key: "x-is-user",
        value: "yuuuup",
      },
    ],
  },
  {
    regex: "",
    source: "/has-header-4",
    has: [
      {
        type: "host",
        value: "example.com",
      },
    ],
    headers: [
      {
        key: "x-is-host",
        value: "yuuuup",
      },
    ],
  },
  {
    regex: "",
    source: "/missing-header-1",
    missing: [
      {
        type: "header",
        key: "x-my-header",
        value: "(?<myHeader>.*)",
      },
    ],
    headers: [
      {
        key: "x-another",
        value: "header",
      },
    ],
  },
  {
    regex: "",
    source: "/missing-header-2",
    missing: [
      {
        type: "query",
        key: "my-query",
      },
    ],
    headers: [
      {
        key: "x-added",
        value: "value",
      },
    ],
  },
  {
    regex: "",
    source: "/missing-header-3",
    missing: [
      {
        type: "cookie",
        key: "loggedIn",
        value: "true",
      },
    ],
    headers: [
      {
        key: "x-is-user",
        value: "yuuuup",
      },
    ],
  },
  {
    regex: "",
    source: "/missing-header-4",
    missing: [
      {
        type: "host",
        value: "example.com",
      },
    ],
    headers: [
      {
        key: "x-is-host",
        value: "yuuuup",
      },
    ],
  },
];
