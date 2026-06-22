import fetch from "node-fetch";
import * as crypto from "crypto";
import { MyersDiffEngine } from "./distance";

export interface ComparisonResult {
  route: string;
  statusMatch: boolean;
  statusA?: number;
  statusB?: number;
  headerMismatches: Array<{ header: string; valA: string; valB: string }>;
  expectedHeaderVariations: Array<{ header: string; valA: string; valB: string }>;
  bodySimilarity: number; // 0.0 to 1.0
  bodyDiff: string;
  isBinary: boolean;
  bodyA?: string;
  bodyB?: string;
  latencyA?: number;
  latencyB?: number;
}


const BINARY_CONTENT_TYPES = [
  "image/",
  "application/pdf",
  "application/zip",
  "application/octet-stream",
];

function isBinaryContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  return BINARY_CONTENT_TYPES.some((type) => normalized.includes(type));
}

/**
 *
 */
export async function compareRoute(
  route: string,
  urlA: string,
  urlB: string,
  options: { headers?: Record<string, string> } = {},
): Promise<ComparisonResult> {
  const fetchOptions = {
    headers: options.headers || {},
    redirect: "manual" as const,
    size: 2 * 1024 * 1024,
  };

  const startA = Date.now();
  const resA = await fetch(`${urlA}${route}`, fetchOptions);
  const latencyA = Date.now() - startA;

  const startB = Date.now();
  const resB = await fetch(`${urlB}${route}`, fetchOptions);
  const latencyB = Date.now() - startB;

  const contentTypeA = resA.headers.get("content-type") || "";
  const contentTypeB = resB.headers.get("content-type") || "";
  const isBinaryA = isBinaryContentType(contentTypeA);
  const isBinaryB = isBinaryContentType(contentTypeB);

  const headersA: Record<string, string> = {};
  resA.headers.forEach((val, key) => { headersA[key.toLowerCase()] = val; });

  const headersB: Record<string, string> = {};
  resB.headers.forEach((val, key) => { headersB[key.toLowerCase()] = val; });

  const responseA: RouteResponse = {
    status: resA.status,
    headers: headersA,
    isBinary: isBinaryA || isBinaryB,
    body: (isBinaryA || isBinaryB) ? (await resA.buffer()).toString("base64") : await resA.text(),
    latencyMs: latencyA,
  };

  const responseB: RouteResponse = {
    status: resB.status,
    headers: headersB,
    isBinary: isBinaryA || isBinaryB,
    body: (isBinaryA || isBinaryB) ? (await resB.buffer()).toString("base64") : await resB.text(),
    latencyMs: latencyB,
  };

  return await compareRouteResponses(route, responseA, responseB);
}

export interface RouteResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  isBinary: boolean;
  latencyMs?: number;
}

/**
 *
 */
export async function compareRouteResponses(
  route: string,
  resA: RouteResponse,
  resB: RouteResponse,
): Promise<ComparisonResult> {
  const result: ComparisonResult = {
    route,
    statusMatch: resA.status === resB.status,
    statusA: resA.status,
    statusB: resB.status,
    headerMismatches: [],
    expectedHeaderVariations: [],
    bodySimilarity: 1.0,
    bodyDiff: "",
    isBinary: resA.isBinary || resB.isBinary,
    latencyA: resA.latencyMs,
    latencyB: resB.latencyMs,
  };

  // 1. Compare Headers
  const normalizedHeadersA: Record<string, string> = {};
  Object.entries(resA.headers).forEach(([k, v]) => { normalizedHeadersA[k.toLowerCase()] = v; });

  const normalizedHeadersB: Record<string, string> = {};
  Object.entries(resB.headers).forEach(([k, v]) => { normalizedHeadersB[k.toLowerCase()] = v; });

  const allHeaderKeys = new Set([
    ...Object.keys(normalizedHeadersA),
    ...Object.keys(normalizedHeadersB),
  ]);

  for (const key of allHeaderKeys) {
    const valA = normalizedHeadersA[key] || "";
    const valB = normalizedHeadersB[key] || "";
    if (valA !== valB) {
      result.headerMismatches.push({ header: key, valA, valB });
    }
  }

  // 2. Compare Binary
  if (result.isBinary) {
    const bufA = Buffer.from(resA.body, "base64");
    const bufB = Buffer.from(resB.body, "base64");

    const sizeA = bufA.length;
    const sizeB = bufB.length;

    if (sizeA !== sizeB) {
      result.bodySimilarity = 0.0;
      result.bodyDiff = `Binary size mismatch: ${sizeA} bytes vs ${sizeB} bytes`;
    } else {
      const hashA = crypto.createHash("sha256").update(bufA).digest("hex");
      const hashB = crypto.createHash("sha256").update(bufB).digest("hex");
      if (hashA === hashB) {
        result.bodySimilarity = 1.0;
      } else {
        result.bodySimilarity = 0.0;
        result.bodyDiff = "Binary content hash mismatch";
      }
    }
    return result;
  }

  // 3. Compare Text Body
  let bodyA = resA.body;
  let bodyB = resB.body;

  const contentType = (resA.headers["content-type"] || resA.headers["Content-Type"] || "").toLowerCase();
  if (contentType.includes("text/html")) {
    try {
      const prettier = require("prettier");
      const formattedA = await prettier.format(bodyA, { parser: "html" });
      const formattedB = await prettier.format(bodyB, { parser: "html" });
      bodyA = formattedA;
      bodyB = formattedB;
    } catch (e: any) {
      // Fallback to advanced tag-based line splitting if prettier fails
      const HTML_SPLIT_REGEX = /(<(script|style)\b[\s\S]*?<\/\2>|<!--[\s\S]*?-->|<[^'">]*(?:"[^"]*"[^'">]*|'[^']*'[^'">]*)*>)\s*(?=<)/gi;
      bodyA = bodyA.replace(HTML_SPLIT_REGEX, "$1\n");
      bodyB = bodyB.replace(HTML_SPLIT_REGEX, "$1\n");
    }
  } else if (contentType.includes("application/json") || route.endsWith(".json")) {
    try {
      bodyA = JSON.stringify(JSON.parse(bodyA), null, 2);
      bodyB = JSON.stringify(JSON.parse(bodyB), null, 2);
    } catch (e: any) {
      // Fallback to raw text
    }
  }

  result.bodyA = bodyA;
  result.bodyB = bodyB;

  if (bodyA !== bodyB) {
    result.bodySimilarity = MyersDiffEngine.getSimilarity(bodyA, bodyB);
    if (result.bodySimilarity < 1.0) {
      result.bodyDiff = "HTML content mismatch";
    }
  }

  return result;
}

