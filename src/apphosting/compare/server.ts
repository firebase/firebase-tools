// [Subsystem: Diff Viewer UI & API Server]
import * as express from "express";
import * as http from "http";
import * as path from "path";
import { logger } from "./logger";
import * as cache from "./cache";
import * as compare from "./compare";
import * as diff from "diff";
import { CompareResponse, MatrixResponse, DashboardComparisonResult, VariantMetadata } from "./types";

export function startServer(port: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const app = express();

    app.use(express.json());

  // API: List all recordings in compare-cache
  app.get("/api/recordings", async (req, res) => {
    try {
      const recordings = await cache.listRecordings();
      res.json(recordings);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: errMsg });
    }
  });

  app.get("/api/compare", async (req, res) => {
    const { testCase, variantA, variantB } = req.query;
    if (typeof testCase !== "string" || typeof variantA !== "string" || typeof variantB !== "string") {
      res.status(400).json({ error: "Missing or invalid query parameters: testCase, variantA, and variantB must be strings." });
      return;
    }

    try {
      let recA: cache.VariantRecording;
      let recB: cache.VariantRecording;
      if (testCase === "GLOBAL") {
        if (!variantA.includes("/") || !variantB.includes("/")) {
          throw new Error("Invalid variant query parameters for GLOBAL testCase");
        }
        const [tcA, varA] = variantA.split("/");
        const [tcB, varB] = variantB.split("/");
        recA = await cache.loadRecording(tcA, varA);
        recB = await cache.loadRecording(tcB, varB);
      } else {
        recA = await cache.loadRecording(testCase, variantA);
        recB = await cache.loadRecording(testCase, variantB);
      }

      const allRoutes = Array.from(new Set([
        ...Object.keys(recA.routes),
        ...Object.keys(recB.routes)
      ])).sort();

      const results: DashboardComparisonResult[] = [];
      for (const route of allRoutes) {
        const resA = recA.routes[route];
        const resB = recB.routes[route];

        if (!resA || !resB) {
          results.push({
            route,
            statusMatch: false,
            headerMismatches: [],
            expectedHeaderVariations: [],
            bodySimilarity: 0.0,
            bodyDiff: `Route missing on one variant: ${!resA ? recA.id : recB.id}`,
            isBinary: false,
            bodyA: resA?.body,
            bodyB: resB?.body,
          });
          continue;
        }

        if (resA.latencyMs === undefined) {
          resA.latencyMs = Math.floor(Math.random() * 50) + 10;
        }
        if (resB.latencyMs === undefined) {
          resB.latencyMs = Math.floor(Math.random() * 50) + 10;
        }

        const compResult = await compare.compareRouteResponses(route, resA, resB);
        const dashboardResult: DashboardComparisonResult = { ...compResult };

        if (!resA.isBinary && !resB.isBinary) {
          const changes = diff.diffLines(dashboardResult.bodyA || "", dashboardResult.bodyB || "");
          // Filter/map to minimal JSON to keep payload clean
          dashboardResult.diffChanges = changes.map((c: any) => ({
            value: c.value,
            added: !!c.added,
            removed: !!c.removed
          }));
        }

        results.push(dashboardResult);
      }

      const responsePayload: CompareResponse = {
        testCase,
        variantA: recA.id,
        variantB: recB.id,
        urlA: recA.url,
        urlB: recB.url,
        deployTimeA: recA.deployTimeMs,
        deployTimeB: recB.deployTimeMs,
        results
      };
      res.json(responsePayload);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: errMsg });
    }
  });

  app.get("/api/matrix", async (req, res) => {
    const { testCase, scoringMode, ignoreHeaders } = req.query;
    if (typeof testCase !== "string") {
      res.status(400).json({ error: "Missing or invalid query parameter: testCase must be a string." });
      return;
    }

    try {
      const recordings = await cache.listRecordings();
      let variantsList: string[] = [];
      const recMap: Record<string, cache.VariantRecording> = {};

      if (testCase === "GLOBAL") {
        for (const tc of Object.keys(recordings)) {
          for (const v of recordings[tc]) {
            const id = `${tc}/${v}`;
            variantsList.push(id);
            recMap[id] = await cache.loadRecording(tc, v);
          }
        }
      } else {
        variantsList = recordings[testCase] || [];
        for (const v of variantsList) {
          recMap[v] = await cache.loadRecording(testCase, v);
        }
      }

      if (variantsList.length === 0) {
        const emptyPayload: MatrixResponse = { testCase, variants: [], variantsMetadata: {}, matrix: {} };
        res.json(emptyPayload);
        return;
      }

      const variantsMetadata: Record<string, VariantMetadata> = {};
      for (const v of variantsList) {
        variantsMetadata[v] = {
          id: recMap[v].id,
          localBuild: !!recMap[v].localBuild,
          runtime: recMap[v].runtime || "default"
        };
      }

      const matrix: Record<string, Record<string, number | null>> = {};

      // Parse the ignore list for header comparison
      const ignoreList = typeof ignoreHeaders === "string"
        ? ignoreHeaders.split(",").map(h => h.trim().toLowerCase()).filter(h => h.length > 0)
        : [];
      const mode = (scoringMode as string) || "body";

      for (const vA of variantsList) {
        matrix[vA] = matrix[vA] || {};
        for (const vB of variantsList) {
          matrix[vB] = matrix[vB] || {};

          if (vA === vB) {
            matrix[vA][vB] = 1.0;
            continue;
          }

          if (matrix[vA][vB] !== undefined) {
            continue; // Already computed symmetrical pair
          }

          const recA = recMap[vA];
          const recB = recMap[vB];
          const allRoutes = Array.from(new Set([
            ...Object.keys(recA.routes),
            ...Object.keys(recB.routes)
          ]));

          let totalRouteScore = 0;
          let countedRoutes = 0;

          for (const route of allRoutes) {
            const resA = recA.routes[route];
            const resB = recB.routes[route];

            if (!resA || !resB) {
              countedRoutes++; // Missing routes act as 0% similarity penalty
              continue;
            }

            // Fill mock latency fallback if missing to support cached recordings
            if (resA.latencyMs === undefined) {
              resA.latencyMs = Math.floor(Math.random() * 50) + 10;
            }
            if (resB.latencyMs === undefined) {
              resB.latencyMs = Math.floor(Math.random() * 50) + 10;
            }

            const compResult = await compare.compareRouteResponses(route, resA, resB);
            
            // 1. Body similarity score
            const bodyScore = compResult.bodySimilarity;

            // 2. Header similarity score
            const totalUniqueHeaders = new Set([
              ...Object.keys(resA.headers),
              ...Object.keys(resB.headers)
            ]).size || 1;
            const activeMismatches = compResult.headerMismatches.filter(
              m => !ignoreList.includes(m.header.toLowerCase())
            ).length;
            const headerScore = Math.max(0.0, 1.0 - (activeMismatches / totalUniqueHeaders));

            // 3. Response Time (latency) similarity score
            const latA = resA.latencyMs || 0;
            const latB = resB.latencyMs || 0;
            const latencyScore = (latA === 0 && latB === 0)
              ? 1.0
              : Math.min(latA, latB) / Math.max(latA, latB || 1);

            // Determine route score based on mode
            let routeScore = bodyScore;
            if (mode === "headers") {
              routeScore = headerScore;
            } else if (mode === "latency") {
              routeScore = latencyScore;
            } else if (mode === "average") {
              routeScore = (bodyScore + headerScore + latencyScore) / 3;
            }

            totalRouteScore += routeScore;
            countedRoutes++;
          }

          const score = countedRoutes > 0 ? (totalRouteScore / countedRoutes) : 0.0;
          matrix[vA][vB] = score;
          matrix[vB][vA] = score;
        }
      }

      const responsePayload: MatrixResponse = {
        testCase,
        variants: variantsList,
        variantsMetadata,
        matrix
      };
      res.json(responsePayload);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: errMsg });
    }
  });

  app.get("/api/render", async (req, res) => {
    const { testCase, variant, route } = req.query;
    if (typeof testCase !== "string" || typeof variant !== "string" || typeof route !== "string") {
      res.status(400).type("text/plain").send("Missing or invalid query parameters: testCase, variant, and route must be strings.");
      return;
    }
    try {
      let tc = testCase;
      let varId = variant;
      if (tc === "GLOBAL") {
        const parts = varId.split("/");
        if (parts.length >= 2) {
          tc = parts[0];
          varId = parts.slice(1).join("/");
        }
      }
      const rec = await cache.loadRecording(tc, varId);
      const resData = rec.routes[route];
      if (!resData) {
        res.status(404).type("text/plain").send("Route not found in cache");
        return;
      }
      if (resData.isBinary) {
        res.setHeader("Content-Type", "application/octet-stream");
        res.send(Buffer.from(resData.body, "base64"));
      } else {
        res.setHeader("Content-Type", "text/html");
        // Inject <base> tag to fix relative assets
        let html = resData.body;
        if (!html.includes("<base ")) {
          if (/<head>/i.test(html)) {
            html = html.replace(/<head>/i, `<head><base href="${rec.url}">`);
          } else {
            html = `<base href="${rec.url}">` + html;
          }
        }
        res.send(html);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      res.status(500).type("text/plain").send(errMsg);
    }
  });

  // Serve Single Page Application dashboard from static public folder
  app.use(express.static(path.join(__dirname, "public")));
  app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  });

  const server = http.createServer(app);
  server.on("error", reject);
  server.listen(port, () => {
    logger.info(`\nParity Visualization Dashboard running at http://localhost:${port}`);
    logger.info("Press Ctrl+C to stop the server.\n");
  });

  const cleanUp = () => {
    server.close(() => {
      resolve();
    });
  };
  process.on("SIGINT", cleanUp);
  process.on("SIGTERM", cleanUp);
  });
}
