import type { Manifest } from "../../../../frameworks/next/interfaces";
import { supportedPaths, unsupportedPaths } from "./paths";

export const supportedRedirects: NonNullable<Manifest["redirects"]> = supportedPaths.map(
  (path) => ({
    source: path,
    destination: `${path}/redirect`,
    regex: "",
    statusCode: 301,
  })
);

export const unsupportedRedirects: NonNullable<Manifest["redirects"]> = [
  ...unsupportedPaths.map((path) => ({
    source: path,
    destination: `/${path}/redirect`,
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
    permanent: false,
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
    permanent: false,
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
    permanent: false,
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
    permanent: false,
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
    permanent: false,
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
    permanent: false,
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
    permanent: false,
    regex: "",
  },
];
