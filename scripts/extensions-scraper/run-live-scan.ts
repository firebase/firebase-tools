import * as https from "https";
import * as path from "path";
import * as fs from "fs";
import { extractReplacementFromReadme, getRepoUrlForExtension, toRawGithubUrl } from "./index";
import {
  ReplacementInfo,
  ReplacementRegistrySchema,
} from "../../src/extensions/replacementRegistry";

function fetchUrlContent(url: string, maxRedirects = 5): Promise<string> {
  return new Promise((resolve) => {
    if (maxRedirects < 0) {
      resolve("");
      return;
    }
    try {
      https
        .get(url, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            const redirectUrl = res.headers.location;
            res.resume();
            if (redirectUrl) {
              try {
                const absoluteUrl = new URL(redirectUrl, url).toString();
                void fetchUrlContent(absoluteUrl, maxRedirects - 1).then(resolve);
              } catch {
                resolve("");
              }
              return;
            }
          }
          if (res.statusCode !== 200) {
            res.resume();
            resolve("");
            return;
          }
          let data = "";
          res.on("data", (chunk: string | Buffer) => (data += chunk.toString()));
          res.on("end", () => resolve(data));
        })
        .on("error", () => resolve(""));
    } catch {
      resolve("");
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

  let detectedCount = 0;

  for (const [extRef, entry] of entries) {
    const webUrl = getRepoUrlForExtension(extRef, entry);
    const rawUrl = toRawGithubUrl(webUrl);

    const readmeContent = await fetchUrlContent(rawUrl);
    const discoveredPackage = extractReplacementFromReadme(readmeContent);

    if (discoveredPackage) {
      detectedCount++;
      registry.replacements[extRef] = {
        ...registry.replacements[extRef],
        status: "REPLACEMENT_AVAILABLE",
        npmPackage: discoveredPackage,
      };
      console.log(`[✓ DETECTED] ${extRef}`);
      console.log(`  Target Package: ${discoveredPackage}`);
      console.log(`  Web URL:    ${webUrl}\n`);
    } else {
      console.log(`[PENDING] ${extRef}`);
      console.log(`  Web URL:    ${webUrl} (No tag present)\n`);
    }
  }

  if (detectedCount > 0) {
    fs.writeFileSync(replacementsPath, JSON.stringify(registry, null, 2) + "\n");
    console.log(`[Scraper] Saved updated registry to ${replacementsPath}\n`);
  }

  console.log("=======================================================");
  console.log(`   SCAN COMPLETE: ${detectedCount} / ${entries.length} REPLACEMENTS FOUND`);
  console.log("=======================================================\n");
}

void runLiveScan();
