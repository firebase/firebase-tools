import type { RoutesManifestRewrite, RoutesManifestRewriteObject } from "../interfaces";
import { supportedPaths, unsupportedPaths } from "./paths";

export const supportedRewritesArray: RoutesManifestRewrite[] = supportedPaths.map((path) => ({
  source: path,
  destination: `/rewrite`,
  regex: "",
}));

export const unsupportedRewritesArray: RoutesManifestRewrite[] = [
  ...unsupportedPaths.map((path) => ({
    source: path,
    destination: `/rewrite`,
    regex: "",
  })),
  ...supportedPaths.map((path) => ({
    source: path,
    destination: `/rewrite?arg=foo`,
    regex: "",
  })),
  // external http URL
  {
    source: "/:path*",
    destination: "http://firebase.google.com",
    regex: "",
  },
  // external https URL
  {
    source: "/:path*",
    destination: "https://firebase.google.com",
    regex: "",
  },
  // with has
  {
    source: "/specific/:path*",
    destination: "/some/specific/:path",
    regex: "",
    has: [
      { type: "query", key: "overrideMe" },
      {
        type: "header",
        key: "x-rewrite-me",
      },
    ],
  },
  // with has
  {
    source: "/specific/:path*",
    destination: "/some/specific/:path",
    regex: "",
    has: [
      {
        type: "query",
        key: "page",
        // the page value will not be available in the
        // destination since value is provided and doesn't
        // use a named capture group e.g. (?<page>home)
        value: "home",
      },
    ],
  },
  // with has
  {
    source: "/specific/:path*",
    destination: "/some/specific/:path",
    regex: "",
    has: [
      {
        type: "cookie",
        key: "authorized",
        value: "true",
      },
    ],
  },
  // with missing
  {
    source: "/specific/:path*",
    destination: "/some/specific/:path",
    regex: "",
    missing: [
      { type: "query", key: "overrideMe" },
      {
        type: "header",
        key: "x-rewrite-me",
      },
    ],
  },
  // with missing
  {
    source: "/specific/:path*",
    destination: "/some/specific/:path",
    regex: "",
    missing: [
      {
        type: "query",
        key: "page",
        // the page value will not be available in the
        // destination since value is provided and doesn't
        // use a named capture group e.g. (?<page>home)
        value: "home",
      },
    ],
  },
  // with missing
  {
    source: "/specific/:path*",
    destination: "/some/specific/:path",
    regex: "",
    missing: [
      {
        type: "cookie",
        key: "authorized",
        value: "true",
      },
    ],
  },
];

export const supportedRewritesObject: RoutesManifestRewriteObject = {
  afterFiles: unsupportedRewritesArray, // should be ignored, only beforeFiles is used
  beforeFiles: supportedRewritesArray,
  fallback: unsupportedRewritesArray, // should be ignored, only beforeFiles is used
};

export const unsupportedRewritesObject: RoutesManifestRewriteObject = {
  afterFiles: unsupportedRewritesArray, // should be ignored, only beforeFiles is used
  beforeFiles: unsupportedRewritesArray,
  fallback: unsupportedRewritesArray, // should be ignored, only beforeFiles is used
};
