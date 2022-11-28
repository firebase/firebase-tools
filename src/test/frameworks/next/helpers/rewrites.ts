import type {
  RoutesManifestRewrite,
  RoutesManifestRewriteObject,
} from "../../../../frameworks/next/interfaces";
import { supportedPaths, unsupportedPaths } from "./paths";

export const supportedRewritesArray: RoutesManifestRewrite[] = supportedPaths.map((path) => ({
  source: path,
  destination: `${path}/rewrite`,
  regex: "",
}));

export const unsupportedRewritesArray: RoutesManifestRewrite[] = [
  ...unsupportedPaths.map((path) => ({
    source: path,
    destination: `/${path}/rewrite`,
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
