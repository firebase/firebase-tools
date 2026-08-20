import * as fs from "fs";
import * as path from "path";

import {
  ReplacementInfo,
  ReplacementRegistrySchema,
} from "../../src/extensions/replacementRegistry";

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
 *
 * Throws an Error if the URL is not a recognized GitHub host or has invalid format.
 */
export function toRawGithubUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "raw.githubusercontent.com") {
      return url;
    }
    if (parsed.hostname === "github.com") {
      const pathname = parsed.pathname.replace(/\/tree\//, "/").replace(/\/blob\//, "/");
      return `https://raw.githubusercontent.com${pathname}`;
    }
    throw new Error(`Unsupported host: ${parsed.hostname}`);
  } catch (err: unknown) {
    throw new Error(`Failed to convert to raw GitHub URL: ${String(err)} (${url})`);
  }
}

/**
 * Resolves the repository URL for an extension from its mandatory registry entry.
 */
export function getRepoUrlForExtension(entry: ReplacementInfo): string {
  return entry.extensionRepositoryUrl;
}

/**
 * Scans a list of extension README files or content strings and updates the registry object.
 */
export function processExtensionReadmes(
  readmes: Record<string, string>,
  registryData: ReplacementRegistrySchema,
): { updatedRegistry: ReplacementRegistrySchema; results: ScraperResult[] } {
  const results: ScraperResult[] = [];
  const updatedRegistry: ReplacementRegistrySchema = JSON.parse(
    JSON.stringify(registryData),
  ) as ReplacementRegistrySchema;

  for (const [extensionRef, content] of Object.entries(readmes)) {
    const detectedPackage = extractReplacementFromReadme(content);
    const existingEntry = updatedRegistry.replacements[extensionRef];
    const repoUrl = getRepoUrlForExtension(existingEntry);

    if (detectedPackage) {
      const updatedInfo: ReplacementInfo = {
        status: "REPLACEMENT_AVAILABLE",
        npmPackage: detectedPackage,
        extensionRepositoryUrl: repoUrl,
      };
      updatedRegistry.replacements[extensionRef] = updatedInfo;
      results.push({
        extensionRef,
        detectedPackage,
        status: "REPLACEMENT_AVAILABLE",
      });
    } else if (
      existingEntry &&
      existingEntry.status === "REPLACEMENT_AVAILABLE" &&
      existingEntry.npmPackage
    ) {
      // Preserve existing verified / pre-seeded replacement
      results.push({
        extensionRef,
        detectedPackage: existingEntry.npmPackage,
        status: "REPLACEMENT_AVAILABLE",
      });
    } else {
      const updatedInfo: ReplacementInfo = {
        status: "PENDING_PUBLISHER",
        extensionRepositoryUrl: repoUrl,
      };
      updatedRegistry.replacements[extensionRef] = updatedInfo;
      results.push({
        extensionRef,
        status: "PENDING_PUBLISHER",
      });
    }
  }

  return { updatedRegistry, results };
}

// Main CLI runner if executed directly
if (require.main === module) {
  const replacementsPath = path.resolve(__dirname, "../../src/extensions/replacements.json");
  console.log(`[Scraper] Reading registry asset from ${replacementsPath}...`);
  if (fs.existsSync(replacementsPath)) {
    const rawData = fs.readFileSync(replacementsPath, "utf-8");
    const registry = JSON.parse(rawData) as ReplacementRegistrySchema;
    console.log(
      `[Scraper] Successfully loaded ${Object.keys(registry.replacements).length} extension entries.`,
    );
  }
}
