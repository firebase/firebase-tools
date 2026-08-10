import * as https from "https";
import * as path from "path";
import * as fs from "fs";
import { getRepoUrlForExtension, processExtensionReadmes, toRawGithubUrl } from "./index";
import {
  ReplacementInfo,
  ReplacementRegistrySchema,
} from "../../src/extensions/replacementRegistry";

interface FetchResult {
  content: string;
  statusCode?: number;
  error?: string;
}

function fetchUrlContent(url: string, maxRedirects = 5): Promise<FetchResult> {
  return new Promise((resolve) => {
    if (maxRedirects < 0) {
      resolve({ content: "", error: "Exceeded maximum redirect limit (5)" });
      return;
    }
    try {
      const req = https.get(url, { timeout: 10000 }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirectUrl = res.headers.location;
          res.resume();
          if (redirectUrl) {
            try {
              const absoluteUrl = new URL(redirectUrl, url).toString();
              void fetchUrlContent(absoluteUrl, maxRedirects - 1).then(resolve);
            } catch (err: unknown) {
              resolve({
                content: "",
                error: `Invalid redirect URL: ${String(err)}`,
              });
            }
            return;
          }
        }
        if (res.statusCode !== 200) {
          res.resume();
          resolve({
            content: "",
            statusCode: res.statusCode,
            error: `HTTP ${res.statusCode ?? "unknown"}`,
          });
          return;
        }
        let data = "";
        res.on("data", (chunk: string | Buffer) => (data += chunk.toString()));
        res.on("end", () => resolve({ content: data, statusCode: 200 }));
      });

      req.on("timeout", () => {
        req.destroy();
        resolve({ content: "", error: "Request timed out (10s)" });
      });

      req.on("error", (err) => {
        resolve({ content: "", error: err.message });
      });
    } catch (err: unknown) {
      resolve({ content: "", error: String(err) });
    }
  });
}

async function runLiveScan(): Promise<void> {
  const replacementsPath = path.resolve(__dirname, "../../src/extensions/replacements.json");
  const rawJson = fs.readFileSync(replacementsPath, "utf-8");
  const registry: ReplacementRegistrySchema = JSON.parse(rawJson) as ReplacementRegistrySchema;

  console.log("\n=======================================================");
  console.log("   LIVE GITHUB SCANNER FOR EXTENSION REPLACEMENTS      ");
  console.log("=======================================================\n");

  const entries: [string, ReplacementInfo][] = Object.entries(registry.replacements);
  console.log(`[Scraper] Scanning ${entries.length} extensions from GitHub...\n`);

  const fetchedReadmes: Record<string, string> = {};
  const scanErrors: Array<{ extensionRef: string; url: string; error: string }> = [];

  for (const [extRef, entry] of entries) {
    const webUrl = getRepoUrlForExtension(extRef, entry);
    const rawUrl = toRawGithubUrl(webUrl);

    const result = await fetchUrlContent(rawUrl);

    if (result.error) {
      scanErrors.push({ extensionRef: extRef, url: webUrl, error: result.error });
      console.log(`[⚠ FAILED] ${extRef}`);
      console.log(`  Reason:  ${result.error}`);
      console.log(`  Web URL: ${webUrl}\n`);
    } else {
      fetchedReadmes[extRef] = result.content;
    }
  }

  // Use processExtensionReadmes from index.ts to update registry
  const { updatedRegistry, results } = processExtensionReadmes(fetchedReadmes, registry);

  let detectedCount = 0;
  let pendingCount = 0;

  for (const item of results) {
    const webUrl = getRepoUrlForExtension(
      item.extensionRef,
      registry.replacements[item.extensionRef],
    );
    if (item.status === "REPLACEMENT_AVAILABLE" && item.detectedPackage) {
      detectedCount++;
      console.log(`[✓ DETECTED] ${item.extensionRef}`);
      console.log(`  Target Package: ${item.detectedPackage}`);
      console.log(`  Web URL:        ${webUrl}\n`);
    } else if (!scanErrors.some((e) => e.extensionRef === item.extensionRef)) {
      pendingCount++;
      console.log(`[PENDING] ${item.extensionRef}`);
      console.log(`  Web URL: ${webUrl} (No tag present)\n`);
    }
  }

  if (detectedCount > 0) {
    fs.writeFileSync(replacementsPath, JSON.stringify(updatedRegistry, null, 2) + "\n");
    console.log(`[Scraper] Saved updated registry to ${replacementsPath}\n`);
  }

  console.log("=======================================================");
  console.log(`   SCAN SUMMARY:`);
  console.log(`   - Detected Replacements: ${detectedCount}`);
  console.log(`   - Pending Notices:       ${pendingCount}`);
  console.log(`   - Failed / Errors:       ${scanErrors.length}`);
  console.log("=======================================================\n");

  if (scanErrors.length > 0) {
    console.log("Failed Scans Detail:");
    for (const err of scanErrors) {
      console.log(` - ${err.extensionRef}: ${err.error} (${err.url})`);
    }
    console.log("");
  }
}

void runLiveScan();
