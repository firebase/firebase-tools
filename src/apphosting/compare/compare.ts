import fetch from "node-fetch";
import * as crypto from "crypto";
import { MyersDiffEngine } from "./distance";

export interface ComparisonResult {
  route: string;
  statusMatch: boolean;
  headerMismatches: Array<{ header: string; valA: string; valB: string }>;
  expectedHeaderVariations: Array<{ header: string; valA: string; valB: string }>;
  bodySimilarity: number; // 0.0 to 1.0
  bodyDiff: string;
  isBinary: boolean;
}

const BEHAVIORAL_HEADERS = [
  "cache-control",
  "content-security-policy",
  "content-type",
  "content-encoding",
  "location",
  "strict-transport-security"
];

const BINARY_CONTENT_TYPES = [
  "image/",
  "application/pdf",
  "application/zip",
  "application/octet-stream"
];

function isBinaryContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  return BINARY_CONTENT_TYPES.some(type => normalized.includes(type));
}

export async function compareRoute(
  route: string,
  urlA: string,
  urlB: string,
  options: { headers?: Record<string, string> } = {}
): Promise<ComparisonResult> {
  const fetchOptions = {
    headers: options.headers || {},
    redirect: "manual" as const
  };

  const [resA, resB] = await Promise.all([
    fetch(`${urlA}${route}`, fetchOptions),
    fetch(`${urlB}${route}`, fetchOptions)
  ]);

  const result: ComparisonResult = {
    route,
    statusMatch: resA.status === resB.status,
    headerMismatches: [],
    expectedHeaderVariations: [],
    bodySimilarity: 1.0,
    bodyDiff: "",
    isBinary: false
  };

  // 1. Compare Headers
  const allHeaderKeys = new Set([
    ...Array.from(resA.headers.keys()),
    ...Array.from(resB.headers.keys())
  ]);

  for (const key of allHeaderKeys) {
    const valA = resA.headers.get(key) || "";
    const valB = resB.headers.get(key) || "";
    if (valA !== valB) {
      if (BEHAVIORAL_HEADERS.includes(key.toLowerCase())) {
        result.headerMismatches.push({ header: key, valA, valB });
      } else {
        result.expectedHeaderVariations.push({ header: key, valA, valB });
      }
    }
  }

  // 2. Detect Binary
  const contentTypeA = resA.headers.get("content-type") || "";
  const contentTypeB = resB.headers.get("content-type") || "";
  if (isBinaryContentType(contentTypeA) || isBinaryContentType(contentTypeB)) {
    result.isBinary = true;
    
    const bufA = await resA.buffer();
    const bufB = await resB.buffer();
    
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
  const bodyA = await resA.text();
  const bodyB = await resB.text();

  if (bodyA !== bodyB) {
    result.bodySimilarity = MyersDiffEngine.getSimilarity(bodyA, bodyB);
    if (result.bodySimilarity < 1.0) {
      result.bodyDiff = "HTML content mismatch";
    }
  }

  return result;
}
