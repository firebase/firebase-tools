import * as https from "https";
import * as path from "path";
import * as fs from "fs";
import { extractReplacementFromReadme, getRepoUrlForExtension, toRawGithubUrl } from "./index";

function fetchUrlContent(url: string): Promise<string> {
  return new Promise((resolve) => {
    https
      .get(url, (res) => {
        let data = "";
        // Follow redirects if any
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            fetchUrlContent(redirectUrl).then(resolve);
            return;
          }
        }
        if (res.statusCode !== 200) {
          // If main branch fails or hasn't merged yet, try 'kits' branch
          if (url.includes("/main/")) {
            const kitsUrl = url.replace("/main/", "/kits/");
            https
              .get(kitsUrl, (kitsRes) => {
                if (kitsRes.statusCode === 301 || kitsRes.statusCode === 302) {
                  const redirectUrl = kitsRes.headers.location;
                  if (redirectUrl) {
                    fetchUrlContent(redirectUrl).then(resolve);
                    return;
                  }
                }
                let kitsData = "";
                if (kitsRes.statusCode !== 200) {
                  resolve("");
                  return;
                }
                kitsRes.on("data", (chunk) => (kitsData += chunk));
                kitsRes.on("end", () => resolve(kitsData));
              })
              .on("error", () => resolve(""));
            return;
          }
          resolve("");
          return;
        }
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", () => resolve(""));
  });
}

async function runLiveScan() {
  const replacementsPath = path.resolve(__dirname, "../../src/extensions/replacements.json");
  const rawJson = fs.readFileSync(replacementsPath, "utf-8");
  const registry = JSON.parse(rawJson);

  console.log("\n=======================================================");
  console.log("   LIVE GITHUB SCANNER FOR EXTENSION REPLACEMENTS      ");
  console.log("=======================================================\n");

  const entries = Object.entries(registry.replacements) as [
    string,
    { extensionRepositoryUrl?: string },
  ][];
  console.log(`[Scraper] Scanning ${entries.length} extensions from GitHub...\n`);

  let detectedCount = 0;

  for (const [extRef, entry] of entries) {
    const webUrl = getRepoUrlForExtension(extRef, entry);
    const rawUrl = toRawGithubUrl(webUrl);
    // Support testing against the newly updated kits branch if on main
    const kitsBranchUrl = rawUrl.replace("/main/", "/kits/");

    const readmeContent = await fetchUrlContent(kitsBranchUrl);
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
      console.log(`  Web URL:    ${webUrl}`);
      console.log(`  Raw URL:    ${kitsBranchUrl}\n`);
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

runLiveScan();
