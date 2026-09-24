import * as fs from "fs";
import * as path from "path";
import { getRepoUrlForExtension, processExtensionReadmes, toRawGithubUrl } from "./index";
import { ReplacementRegistrySchema } from "../../src/extensions/replacementRegistry";

interface FetchResult {
  ok: boolean;
  statusCode?: number;
  text: string;
  error?: string;
}

async function fetchUrlContent(url: string): Promise<FetchResult> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
    if (!res.ok) {
      return { ok: false, statusCode: res.status, text: "", error: `HTTP ${res.status}` };
    }
    const text = await res.text();
    return { ok: true, statusCode: res.status, text };
  } catch (err: unknown) {
    return { ok: false, text: "", error: String(err) };
  }
}

async function runLiveScan(): Promise<void> {
  const replacementsPath = path.resolve(__dirname, "../../src/extensions/replacements.json");
  const rawJson = fs.readFileSync(replacementsPath, "utf-8");
  const registry = JSON.parse(rawJson) as ReplacementRegistrySchema;

  console.log("\n=======================================================");
  console.log("   FIREBASE EXTENSIONS REPLACEMENTS LIVE SCANNER       ");
  console.log("=======================================================");

  const entries = Object.entries(registry.replacements);
  console.log(`\n[Scraper] Starting live scan for ${entries.length} extensions...\n`);

  let noReplacementCount = 0;
  const fetchedReadmes: Record<string, string> = {};
  const failedExtensions: Array<{ extRef: string; url: string; reason: string }> = [];

  for (const [extRef, entry] of entries) {
    // Skip fetching extensions that are already marked as having no replacement planned
    if (entry.status === "CONFIRMED_NO_REPLACEMENT") {
      noReplacementCount++;
      console.log(`[⊘ NO REPLACEMENT] ${extRef}`);
      console.log(`  Status:  Confirmed no replacement planned\n`);
      continue;
    }

    const webUrl = getRepoUrlForExtension(entry);
    let rawUrl: string;

    try {
      rawUrl = toRawGithubUrl(webUrl);
    } catch (err: unknown) {
      failedExtensions.push({
        extRef,
        url: webUrl,
        reason: `Invalid URL format: ${String(err)}`,
      });
      console.log(`[✗ ERROR] ${extRef}`);
      console.log(`  Reason:  Invalid URL (${webUrl})\n`);
      continue;
    }

    const fetchResult = await fetchUrlContent(rawUrl);

    // Guard against unreachable URLs early to ensure only successful fetches are processed
    if (!fetchResult.ok) {
      const errReason =
        fetchResult.error ??
        (fetchResult.statusCode ? `HTTP ${fetchResult.statusCode}` : "Unreachable");
      failedExtensions.push({
        extRef,
        url: webUrl,
        reason: errReason,
      });
      console.log(`[✗ UNREACHABLE] ${extRef} (Skipped registry update due to fetch failure)`);
      console.log(`  Web URL: ${webUrl}`);
      console.log(`  Error:   ${errReason}\n`);
      continue;
    }

    // Collect fetched README content for centralized processing
    fetchedReadmes[extRef] = fetchResult.text;
  }

  // Deduplicate registry mutations by delegating to processExtensionReadmes()
  const { updatedRegistry, results } = processExtensionReadmes(fetchedReadmes, registry);

  let detectedCount = 0;
  let pendingCount = 0;

  for (const r of results) {
    const entry = updatedRegistry.replacements[r.extensionRef];
    const webUrl = entry?.extensionRepositoryUrl ?? "";

    if (r.status === "REPLACEMENT_AVAILABLE") {
      detectedCount++;
      console.log(`[✓ DETECTED] ${r.extensionRef}`);
      console.log(`  Package: ${r.detectedPackage}`);
      console.log(`  Web URL: ${webUrl}\n`);
    } else if (r.status === "PENDING_PUBLISHER") {
      pendingCount++;
      console.log(`[• PENDING] ${r.extensionRef}`);
      console.log(`  Web URL: ${webUrl} (README active, no replacement tag yet)\n`);
    }
  }

  // Guard against completely offline or empty runs overwriting the file
  if (detectedCount > 0 || pendingCount > 0) {
    fs.writeFileSync(replacementsPath, JSON.stringify(updatedRegistry, null, 2) + "\n");
    console.log(`[Scraper] Successfully updated ${replacementsPath}\n`);
  } else {
    console.log(`[Scraper] No updates processed (scan was offline or empty). File unchanged.\n`);
  }

  console.log("=======================================================");
  console.log("   SCAN SUMMARY                                        ");
  console.log("=======================================================");
  console.log(`   Total Extensions Cataloged:   ${entries.length}`);
  console.log(`   ✓ Replacements Available:     ${detectedCount}`);
  console.log(`   • Pending Publisher Tags:     ${pendingCount}`);
  console.log(`   ⊘ Confirmed No Replacement:   ${noReplacementCount}`);
  console.log(`   ✗ Unreachable / Errors:       ${failedExtensions.length}`);
  console.log("=======================================================\n");

  if (failedExtensions.length > 0) {
    console.log("⚠️ FAILED / UNREACHABLE EXTENSIONS:");
    for (const f of failedExtensions) {
      console.log(`  - ${f.extRef}`);
      console.log(`    URL:    ${f.url}`);
      console.log(`    Reason: ${f.reason}\n`);
    }
  }
}

void runLiveScan();
