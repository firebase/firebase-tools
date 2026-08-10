import { ReplacementRegistrySchema } from "../../src/extensions/replacementRegistry";

export interface ScraperResult {
  extensionRef: string;
  detectedPackage?: string;
  status: "REPLACEMENT_AVAILABLE" | "PENDING_PUBLISHER";
}

/**
 * Extracts replacement npm package name from extension README markdown content.
 * Checks for machine tag:
 *   <!-- FIREBASE_EXTENSION_REPLACEMENT: extension="publisher/extension-name" package="@scope/package-name" -->
 * or single-quoted:
 *   <!-- FIREBASE_EXTENSION_REPLACEMENT: package='@scope/package-name' -->
 */
export function extractReplacementFromReadme(readmeContent: string): string | undefined {
  if (!readmeContent) {
    return undefined;
  }

  // Regex matching machine-readable replacement tag
  const tagRegex =
    /<!--\s*FIREBASE_EXTENSION_REPLACEMENT:\s*(?:(?:extension=["'][^"']+["']\s*)?package=["']([^"']+)["']|(?:package=["']([^"']+)["']\s*)?extension=["'][^"']+["'])\s*-->/i;
  const match = tagRegex.exec(readmeContent);

  if (match) {
    return match[1] || match[2];
  }

  return undefined;
}

/**
 * Converts a human-browsable GitHub URL (e.g. github.com/owner/repo/tree/branch/path)
 * into a raw fetchable URL (raw.githubusercontent.com/owner/repo/branch/path).
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
  } catch {
    // Return unchanged if not a valid URL
  }
  return url;
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
  registryData: ReplacementRegistrySchema,
): { updatedRegistry: ReplacementRegistrySchema; results: ScraperResult[] } {
  const results: ScraperResult[] = [];
  const updatedRegistry: ReplacementRegistrySchema = JSON.parse(
    JSON.stringify(registryData),
  ) as ReplacementRegistrySchema;
  if (!updatedRegistry.replacements) {
    updatedRegistry.replacements = {};
  }

  for (const [extensionRef, content] of Object.entries(readmes)) {
    const detectedPackage = extractReplacementFromReadme(content);
    let status: ScraperResult["status"] = "PENDING_PUBLISHER";

    if (detectedPackage) {
      status = "REPLACEMENT_AVAILABLE";
      updatedRegistry.replacements[extensionRef] = {
        ...updatedRegistry.replacements[extensionRef],
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
