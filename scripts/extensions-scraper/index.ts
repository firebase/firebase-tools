import * as fs from "fs";
import * as path from "path";

export interface ScraperResult {
  extensionRef: string;
  detectedPackage?: string;
  status: "REPLACEMENT_AVAILABLE" | "CONFIRMED_NO_REPLACEMENT" | "PENDING_PUBLISHER";
}

// Case-insensitive, whitespace-lenient HTML comment tag regex
export const REPLACEMENT_TAG_REGEX =
  /<!--\s*FIREBASE_EXTENSION_REPLACEMENT:[\s\S]*?package=["']?([^"'\s>]+)["']?[\s\S]*?-->/i;

/**
 * Extracts replacement package name from raw README markdown string using the machine tag regex.
 */
export function extractReplacementFromReadme(readmeContent: string): string | undefined {
  if (!readmeContent) {
    return undefined;
  }
  const match = REPLACEMENT_TAG_REGEX.exec(readmeContent);
  if (match && match[1]) {
    return match[1].trim();
  }
  return undefined;
}

/**
 * Converts a human-browsable GitHub URL (e.g. github.com/owner/repo/tree/branch/path)
 * into a raw fetchable URL (raw.githubusercontent.com/owner/repo/branch/path).
 */
export function toRawGithubUrl(url: string): string {
  if (url.includes("raw.githubusercontent.com")) {
    return url;
  }
  return url
    .replace(/^https:\/\/github\.com\//, "https://raw.githubusercontent.com/")
    .replace(/\/tree\//, "/")
    .replace(/\/blob\//, "/");
}

/**
 * Resolves the repository URL for an extension.
 * - If entry has explicit "extensionRepositoryUrl", returns that.
 * - For 1P extensions (firebase/*), defaults to firebase/extensions main branch.
 * - For 2P partner extensions (publisher/*), constructs standard GitHub URL.
 */
export function getRepoUrlForExtension(
  extensionRef: string,
  entry?: { extensionRepositoryUrl?: string },
): string {
  if (entry?.extensionRepositoryUrl) {
    return entry.extensionRepositoryUrl;
  }
  const parts = extensionRef.split("/");
  const publisher = parts[0];
  const extensionId = parts[1] || extensionRef;

  if (publisher === "firebase") {
    return `https://github.com/firebase/extensions/tree/main/${extensionId}/README.md`;
  }
  return `https://github.com/${publisher}/${extensionId}/tree/main/README.md`;
}

/**
 * Scans a list of extension README files or content strings and updates the registry object.
 */
export function processExtensionReadmes(
  readmes: Record<string, string>,
  registryData: Record<string, any>,
): { updatedRegistry: Record<string, any>; results: ScraperResult[] } {
  const results: ScraperResult[] = [];
  const updatedRegistry = JSON.parse(JSON.stringify(registryData));

  for (const [extensionRef, content] of Object.entries(readmes)) {
    const detectedPackage = extractReplacementFromReadme(content);
    let status: ScraperResult["status"] = "PENDING_PUBLISHER";

    if (detectedPackage) {
      status = "REPLACEMENT_AVAILABLE";
      updatedRegistry.replacements[extensionRef] = {
        status,
        npmPackage: detectedPackage,
      };
    }

    results.push({
      extensionRef,
      detectedPackage,
      status,
    });
  }

  return { updatedRegistry, results };
}

// Main CLI runner if executed directly
if (require.main === module) {
  const replacementsPath = path.resolve(__dirname, "../../src/extensions/replacements.json");
  console.log(`[Scraper] Reading registry asset from ${replacementsPath}...`);
  if (fs.existsSync(replacementsPath)) {
    const rawData = fs.readFileSync(replacementsPath, "utf-8");
    const registry = JSON.parse(rawData);
    console.log(
      `[Scraper] Successfully loaded ${Object.keys(registry.replacements).length} extension entries.`,
    );
  }
}
