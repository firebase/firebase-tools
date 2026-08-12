import * as fs from "fs";
import * as path from "path";
import { extractReplacementFromReadme, getRepoUrlForExtension, toRawGithubUrl } from "./index";
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

  let detectedCount = 0;
  let pendingCount = 0;
  let noReplacementCount = 0;
  const failedExtensions: Array<{ extRef: string; url: string; reason: string }> = [];

  for (const [extRef, entry] of entries) {
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
    const discoveredPackage = extractReplacementFromReadme(fetchResult.text);

    if (discoveredPackage) {
      detectedCount++;
      registry.replacements[extRef] = {
        ...registry.replacements[extRef],
        status: "REPLACEMENT_AVAILABLE",
        npmPackage: discoveredPackage,
      };
      console.log(`[✓ DETECTED] ${extRef}`);
      console.log(`  Package: ${discoveredPackage}`);
      console.log(`  Web URL: ${webUrl}\n`);
    } else if (!fetchResult.ok && failedExtensions.length < 50) {
      const errReason =
        fetchResult.error ??
        (fetchResult.statusCode ? `HTTP ${fetchResult.statusCode}` : "Unreachable");
      failedExtensions.push({
        extRef,
        url: webUrl,
        reason: errReason,
      });
      console.log(`[✗ UNREACHABLE] ${extRef}`);
      console.log(`  Web URL: ${webUrl}`);
      console.log(`  Error:   ${errReason}\n`);
    } else {
      pendingCount++;
      console.log(`[• PENDING] ${extRef}`);
      console.log(`  Web URL: ${webUrl} (README active, no replacement tag yet)\n`);
    }
  }

  if (detectedCount > 0) {
    fs.writeFileSync(replacementsPath, JSON.stringify(registry, null, 2) + "\n");
    console.log(`[Scraper] Successfully updated ${replacementsPath}\n`);
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
