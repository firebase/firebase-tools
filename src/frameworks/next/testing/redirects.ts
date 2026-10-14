import type { RoutesManifestRedirect } from "../interfaces";
import { supportedPaths, unsupportedPaths } from "./paths";

export const supportedRedirects: RoutesManifestRedirect[] = supportedPaths.map((path) => ({
  source: path,
  destination: `/redirect`,
  regex: "",
  statusCode: 301,
}));

export const unsupportedRedirects: RoutesManifestRedirect[] = [
  ...unsupportedPaths.map((path) => ({
    source: path,
    destination: `/redirect`,
    regex: "",
    statusCode: 301,
  })),
  {
    source: "/has-redirect-1",
    has: [
      {
        type: "header",
        key: "x-my-header",
        value: "(?<myHeader>.*)",
      },
    ],
    destination: "/another?myHeader=:myHeader",
    statusCode: 307,
    regex: "",
  },
  {
    source: "/has-redirect-2",
    has: [
      {
        type: "query",
        key: "my-query",
      },
    ],
    destination: "/another?value=:myquery",
    statusCode: 307,
    regex: "",
  },
  {
    source: "/has-redirect-3",
    has: [
      {
        type: "cookie",
        key: "loggedIn",
        value: "true",
      },
    ],
    destination: "/another?authorized=1",
    statusCode: 307,
    regex: "",
  },
  {
    source: "/has-redirect-4",
    has: [
      {
        type: "host",
        value: "example.com",
      },
    ],
    destination: "/another?host=1",
    statusCode: 307,
    regex: "",
  },
  {
    source: "/:path/has-redirect-5",
    has: [
      {
        type: "header",
        key: "x-test-next",
      },
    ],
    destination: "/somewhere",
    statusCode: 307,
    regex: "",
  },
  {
    source: "/has-redirect-6",
    has: [
      {
        type: "host",
        value: "(?<subdomain>.*)-test.example.com",
      },
    ],
    destination: "https://:subdomain.example.com/some-path/end?a=b",
    statusCode: 307,
    regex: "",
  },
  {
    source: "/has-redirect-7",
    has: [
      {
        type: "query",
        key: "hello",
        value: "(?<hello>.*)",
      },
    ],
    destination: "/somewhere?value=:hello",
    statusCode: 307,
    regex: "",
  },
  {
    source: "/internal-redirect-1",
    internal: true,
    destination: "/somewhere?value=:hello",
    statusCode: 307,
    regex: "",
  },
  {
    source: "/missing-redirect-1",
    missing: [
      {
        type: "header",
        key: "x-my-header",
        value: "(?<myHeader>.*)",
      },
    ],
    destination: "/another?myHeader=:myHeader",
    statusCode: 307,
    regex: "",
  },
  {
    source: "/missing-redirect-2",
    missing: [
      {
        type: "query",
        key: "my-query",
      },
    ],
    destination: "/another?value=:myquery",
    statusCode: 307,
    regex: "",
  },
  {
    source: "/missing-redirect-3",
    missing: [
      {
        type: "cookie",
        key: "loggedIn",
        value: "true",
      },
    ],
    destination: "/another?authorized=1",
    statusCode: 307,
    regex: "",
  },
  {
    source: "/missing-redirect-4",
    missing: [
      {
        type: "host",
        value: "example.com",
      },
    ],
    destination: "/another?host=1",
    statusCode: 307,
    regex: "",
  },
  {
    source: "/:path/missing-redirect-5",
    missing: [
      {
        type: "header",
        key: "x-test-next",
      },
    ],
    destination: "/somewhere",
    statusCode: 307,
    regex: "",
  },
  {
    source: "/missing-redirect-6",
    missing: [
      {
        type: "host",
        value: "(?<subdomain>.*)-test.example.com",
      },
    ],
    destination: "https://:subdomain.example.com/some-path/end?a=b",
    statusCode: 307,
    regex: "",
  },
  {
    source: "/missing-redirect-7",
    missing: [
      {
        type: "query",
        key: "hello",
        value: "(?<hello>.*)",
      },
    ],
    destination: "/somewhere?value=:hello",
    statusCode: 307,
    regex: "",
  },
];
