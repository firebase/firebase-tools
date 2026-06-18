import * as express from "express";
import * as http from "http";
import { logger } from "../../logger";
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
        results
      };
      res.json(responsePayload);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: errMsg });
    }
  });

  app.get("/api/matrix", async (req, res) => {
    const { testCase } = req.query;
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

          // Compute average body similarity across all shared routes
          const recA = recMap[vA];
          const recB = recMap[vB];
          const allRoutes = Array.from(new Set([
            ...Object.keys(recA.routes),
            ...Object.keys(recB.routes)
          ]));

          let totalSimilarity = 0;
          let countedRoutes = 0;

          for (const route of allRoutes) {
            const resA = recA.routes[route];
            const resB = recB.routes[route];

            if (!resA || !resB) {
              countedRoutes++; // Missing routes act as 0% similarity penalty
              continue;
            }

            const compResult = await compare.compareRouteResponses(route, resA, resB);
            totalSimilarity += compResult.bodySimilarity;
            countedRoutes++;
          }

          const score = countedRoutes > 0 ? (totalSimilarity / countedRoutes) : 0.0;
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

  // Serve Single Page Application dashboard
  app.get("/", (req, res) => {
    res.send(getDashboardHtml());
  });

  const server = http.createServer(app);
  server.on("error", reject);
  server.listen(port, () => {
    logger.info(`\n🚀 Parity Visualization Dashboard running at http://localhost:${port}`);
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

function getDashboardHtml(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Parity Comparison Dashboard</title>
  <!-- Google Fonts: Inter -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">

  <style>
    :root {
      --bg-dark: #0f172a;
      --bg-panel: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #3b82f6;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --font-family: 'Inter', sans-serif;
    }

    body {
      background-color: var(--bg-dark);
      color: var(--text);
      font-family: var(--font-family);
      margin: 0;
      padding: 0;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    header {
      background-color: var(--bg-panel);
      border-bottom: 1px solid var(--border);
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    header h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      letter-spacing: -0.025em;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    header h1 span {
      background: linear-gradient(135deg, #60a5fa, #3b82f6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    main {
      flex: 1;
      display: flex;
      overflow: hidden;
    }

    /* Sidebar */
    .sidebar {
      width: 320px;
      background-color: var(--bg-panel);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      padding: 20px;
      box-sizing: border-box;
      gap: 24px;
    }

    .section-title {
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 8px;
    }

    .list-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .list-item {
      padding: 12px;
      background-color: rgba(255,255,255,0.02);
      border: 1px solid var(--border);
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s ease;
    }

    .list-item:hover, .list-item.active {
      background-color: rgba(59, 130, 246, 0.1);
      border-color: var(--accent);
    }

    .list-item.active {
      font-weight: 600;
    }

    /* Comparison selector */
    .compare-select {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    select {
      width: 100%;
      background-color: var(--bg-dark);
      color: var(--text);
      border: 1px solid var(--border);
      padding: 10px;
      border-radius: 6px;
      font-size: 14px;
      outline: none;
    }

    button.btn {
      background-color: var(--accent);
      color: white;
      border: none;
      padding: 10px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      font-size: 14px;
      transition: background-color 0.2s;
    }

    button.btn:hover {
      background-color: #2563eb;
    }

    /* Content Area */
    .content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      padding: 24px;
      box-sizing: border-box;
      gap: 20px;
    }

    .card {
      background-color: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .card-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      font-weight: 600;
      font-size: 16px;
    }

    /* Routes List */
    .routes-list {
      flex: 1;
      overflow-y: auto;
    }

    .route-item {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .route-item:hover {
      background-color: rgba(255,255,255,0.02);
    }

    .route-item.active {
      background-color: rgba(59, 130, 246, 0.05);
    }

    .route-path {
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
    }

    .badges {
      display: flex;
      gap: 8px;
    }

    .badge {
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 9999px;
      font-weight: 600;
    }

    .badge.success { background-color: rgba(16, 185, 129, 0.15); color: var(--success); }
    .badge.warning { background-color: rgba(245, 158, 11, 0.15); color: var(--warning); }
    .badge.danger { background-color: rgba(239, 68, 68, 0.15); color: var(--danger); }

    /* Split Details View */
    .details-view {
      flex: 1;
      display: flex;
      gap: 20px;
      overflow: hidden;
    }

    .details-left {
      width: 40%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .details-right {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .panel-body {
      padding: 20px;
      overflow-y: auto;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .table-container {
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      text-align: left;
    }

    th, td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
    }

    th {
      background-color: rgba(255,255,255,0.02);
      font-weight: 600;
    }

    tr:last-child td {
      border-bottom: none;
    }

    .diff-container {
      flex: 1;
      overflow-y: auto;
      background-color: #0d1117;
      border: 1px solid var(--border);
      border-radius: 8px;
    }

    .d2h-file-header {
      display: none; /* Hide header details */
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      color: var(--text-muted);
      gap: 12px;
    }

    .empty-state svg {
      width: 48px;
      height: 48px;
      stroke: var(--text-muted);
    }

    /* Heatmap Styles */
    .heatmap-table {
      border-collapse: separate;
      border-spacing: 6px;
      font-size: 13px;
      margin: 20px auto;
    }
    .heatmap-cell {
      width: 120px;
      height: 70px;
      text-align: center;
      vertical-align: middle;
      font-weight: 700;
      border-radius: 8px;
      cursor: pointer;
      transition: transform 0.1s ease, filter 0.1s ease;
      color: #0f172a;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
    }
    .heatmap-cell:hover {
      transform: scale(1.06);
      filter: brightness(1.15);
    }
    .heatmap-cell.de-emphasized {
      opacity: 0.15;
      filter: grayscale(80%);
    }
    .heatmap-cell.de-emphasized:hover {
      opacity: 0.35;
      filter: grayscale(40%);
    }

    .heatmap-header-cell {
      padding: 10px;
      font-weight: 600;
      color: var(--text-muted);
      font-size: 11px;
      text-align: center;
      max-width: 140px;
      word-wrap: break-word;
    }
    .heatmap-row-label {
      padding-right: 14px;
      font-weight: 600;
      color: var(--text-muted);
      font-size: 11px;
      text-align: right;
      max-width: 140px;
      word-wrap: break-word;
    }

    /* Unified Diff Panel Styles */
    .diff-view {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      line-height: 1.6;
      white-space: pre;
      overflow-x: auto;
      padding: 16px;
      color: #e2e8f0;
      background-color: #0f172a;
      height: 100%;
      box-sizing: border-box;
      margin: 0;
    }
    .diff-line {
      display: flex;
      padding: 2px 8px;
      border-radius: 2px;
    }
    .diff-line.added {
      background-color: rgba(16, 185, 129, 0.15);
      color: #10b981;
    }
    .diff-line.removed {
      background-color: rgba(239, 68, 68, 0.15);
      color: #ef4444;
    }
    .diff-prefix {
      width: 24px;
      user-select: none;
      color: var(--text-muted);
      opacity: 0.7;
    }
    /* Filter Dropdowns styles */
    .filter-dropdown-container {
      position: relative;
      display: inline-block;
    }

    .filter-dropdown-btn {
      background-color: var(--bg-dark);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 6px 12px;
      border-radius: 6px;
      font-family: var(--font-family);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      outline: none;
      transition: border-color 0.2s, background-color 0.2s;
    }

    .filter-dropdown-btn:hover {
      border-color: var(--accent);
      background-color: rgba(255,255,255,0.02);
    }

    .filter-dropdown-btn::after {
      content: "";
      border: solid var(--text-muted);
      border-width: 0 1.5px 1.5px 0;
      display: inline-block;
      padding: 2px;
      transform: rotate(45deg);
      margin-left: 4px;
      transition: transform 0.2s;
    }

    .filter-dropdown-container.open .filter-dropdown-btn::after {
      transform: rotate(-135deg);
    }

    .filter-dropdown-content {
      display: none;
      position: absolute;
      background-color: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
      z-index: 100;
      min-width: 180px;
      max-width: 250px;
      margin-top: 4px;
      padding: 8px;
      box-sizing: border-box;
    }

    .filter-dropdown-container.open .filter-dropdown-content {
      display: block;
    }

    .filter-search-box {
      background-color: var(--bg-dark);
      border: 1px solid var(--border);
      color: var(--text);
      width: 100%;
      padding: 6px 8px;
      border-radius: 4px;
      font-family: var(--font-family);
      font-size: 11px;
      box-sizing: border-box;
      outline: none;
      margin-bottom: 8px;
    }

    .filter-search-box:focus {
      border-color: var(--accent);
    }

    .filter-options-list {
      max-height: 180px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .filter-opt-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 4px;
      cursor: pointer;
      user-select: none;
      font-size: 12px;
      color: var(--text);
      transition: background-color 0.15s;
    }

    .filter-opt-item:hover {
      background-color: rgba(255,255,255,0.04);
    }

    .filter-opt-item input[type="checkbox"] {
      cursor: pointer;
      margin: 0;
    }
  </style>
</head>
<body>

  <header>
    <h1>🚀 <span>Firebase App Hosting Parity Dashboard</span></h1>
    <div style="font-size: 12px; color: var(--text-muted);" id="connection-status">Connected</div>
  </header>

  <main>
    <!-- Sidebar -->
    <div class="sidebar">
      <div>
        <div class="section-title">Test Cases</div>
        <div class="list-group" id="test-cases-list">
          <!-- Populated dynamically -->
        </div>
      </div>

      <div id="variant-selection-section" style="display: none;">
        <div class="section-title">Compare Variants</div>
        <div class="compare-select">
          <label style="font-size:12px; color:var(--text-muted);">Variant A</label>
          <select id="select-variant-a"></select>

          <label style="font-size:12px; color:var(--text-muted);">Variant B</label>
          <select id="select-variant-b"></select>

          <button class="btn" onclick="triggerComparison()">Compare</button>
          <button class="btn" style="background-color: transparent; border: 1px solid var(--border); color: var(--text); margin-top: 8px;" onclick="showHeatmapView()">Show Heatmap</button>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="content">
      
      <!-- Understanding the Metrics Legend -->
      <div class="card" id="metrics-legend" style="margin-bottom: 20px;">
        <div class="card-header" style="background-color: rgba(59, 130, 246, 0.1); border-bottom: none; cursor: pointer; display: flex; justify-content: space-between; align-items: center;" onclick="document.getElementById('legend-body').style.display = document.getElementById('legend-body').style.display === 'none' ? 'block' : 'none'">
          <span>Understanding Parity Metrics</span>
          <span style="font-size: 12px; color: var(--accent);">[Click to Expand]</span>
        </div>
        <div id="legend-body" class="panel-body" style="display: none; padding-top: 0; font-size: 13px; color: var(--text-muted);">
          <ul style="margin: 0; padding-left: 20px; line-height: 1.6;">
            <li><strong style="color: var(--text);">Body Similarity</strong>: A percentage representing how identical the HTML/JSON response bodies are. Uses string distance algorithms.</li>
            <li><strong style="color: var(--text);">Expected Variations</strong>: Certain headers (like <code>Date</code>, <code>Traceparent</code>, <code>Server-Timing</code>) naturally change every request and are excluded from strict parity failure checks.</li>
          </ul>
        </div>
      </div>

      <!-- Heatmap View -->
      <div class="card" id="heatmap-card" style="display: none; flex: 1; flex-direction: column;">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
          <span>Joint Parity Heatmap (Click any cell to compare)</span>
          <label id="filter-codebases-container" style="display: none; align-items: center; gap: 6px; font-size: 12px; font-weight: normal; cursor: pointer; color: var(--text-muted);">
            <input type="checkbox" id="toggle-filter-codebases" style="cursor: pointer;" onchange="applyMatrixFilter()">
            Ignore Comparisons for Different Codebases
          </label>
        </div>
        <div id="heatmap-filters-bar" style="display: flex; padding: 10px 16px; gap: 16px; border-bottom: 1px solid var(--border); font-size: 12px; align-items: center; flex-wrap: wrap; background: rgba(255,255,255,0.015);">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="color: var(--text-muted);">Search Variants:</span>
            <input type="text" id="variant-search-input" placeholder="e.g. Node24" style="background: var(--bg-dark); border: 1px solid var(--border); color: var(--text); padding: 4px 8px; border-radius: 4px; font-family: var(--font-family); font-size: 12px; outline: none; width: 140px;" oninput="applyMetadataFilters()">
          </div>
          <div id="heatmap-dynamic-filters" style="display: flex; align-items: center; gap: 12px; border-left: 1px solid var(--border); padding-left: 16px; flex-wrap: wrap;"></div>
        </div>
        <div class="panel-body" style="align-items: center; justify-content: center; display: flex; flex: 1;">
          <div id="heatmap-grid-container" style="overflow-x: auto; max-width: 100%;"></div>
        </div>
      </div>

      <!-- Route Selection Panel -->
      <div class="card routes-list" id="routes-card" style="display: none;">
        <div class="card-header" id="routes-header">Discovered Routes</div>
        <div id="routes-container">
          <!-- Populated dynamically -->
        </div>
      </div>

      <!-- Comparison Split Details -->
      <div class="details-view" id="comparison-details" style="display: none;">
        <!-- Left: Headers & Status -->
        <div class="card details-left">
          <div class="card-header">Headers & Status</div>
          <div class="panel-body">
            <!-- Target URL endpoints -->
            <div style="margin-bottom: 16px;">
              <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Target Endpoints (Route: <span id="route-title-path" style="font-weight: 600; color: var(--text);">/</span>)</div>
              <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12px; background: rgba(255,255,255,0.02); padding: 8px; border-radius: 4px; border: 1px solid var(--border);">
                <div>
                  <span style="font-weight: 600; color: var(--primary);">Variant A:</span>
                  <a id="link-endpoint-a" href="#" target="_blank" style="color: var(--text); text-decoration: underline; word-break: break-all;"></a>
                </div>
                <div>
                  <span style="font-weight: 600; color: #10b981;">Variant B:</span>
                  <a id="link-endpoint-b" href="#" target="_blank" style="color: var(--text); text-decoration: underline; word-break: break-all;"></a>
                </div>
              </div>
            </div>

            <div style="margin-bottom: 16px;">
              <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">HTTP Status Code</div>
              <div id="status-comparison-box" style="font-size: 15px; font-weight: 600; display: flex; gap: 8px; align-items: center;">
                <!-- Populated dynamically -->
              </div>
            </div>

            <div>
              <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 8px;">HTTP Headers Comparison</div>
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Header</th>
                      <th>Variant A</th>
                      <th>Variant B</th>
                      <th>Classification</th>
                    </tr>
                  </thead>
                  <tbody id="headers-comparison-tbody">
                    <!-- Populated dynamically -->
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: Body Code Diff & Visual Render -->
        <div class="card details-right">
          <div class="card-header" style="display: flex; gap: 16px; padding-bottom: 0;">
            <div id="tab-code-diff" class="tab active" onclick="switchRightTab('code')" style="padding-bottom: 12px; cursor: pointer; border-bottom: 2px solid var(--accent);">Raw Code Diff</div>
            <div id="tab-visual" class="tab" onclick="switchRightTab('visual')" style="padding-bottom: 12px; cursor: pointer; color: var(--text-muted);">Visual Split-View</div>
          </div>
          <div class="panel-body" style="padding: 0; overflow: hidden; display: flex; flex-direction: column; flex: 1;">
            
            <!-- Code Diff View -->
            <div id="body-diff-container" class="diff-container" style="flex: 1; overflow: auto;">
              <!-- Populated dynamically -->
            </div>

            <!-- Visual Render View -->
            <div id="visual-render-container" style="display: none; flex: 1; flex-direction: row; height: 100%;">
              <div style="flex: 1; display: flex; flex-direction: column; border-right: 1px solid var(--border);">
                <div style="padding: 8px; background: rgba(0,0,0,0.2); font-size: 11px; text-align: center; color: var(--text-muted);">Variant A Renderer</div>
                <iframe id="iframe-a" style="flex: 1; width: 100%; border: none; background: #fff;"></iframe>
              </div>
              <div style="flex: 1; display: flex; flex-direction: column;">
                <div style="padding: 8px; background: rgba(0,0,0,0.2); font-size: 11px; text-align: center; color: var(--text-muted);">Variant B Renderer</div>
                <iframe id="iframe-b" style="flex: 1; width: 100%; border: none; background: #fff;"></iframe>
              </div>
            </div>

          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div class="empty-state" id="dashboard-empty-state">
        <svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6Z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0 0 13.5 3v7.5Z" />
        </svg>
        <div>Select a test case and variants to start comparing.</div>
      </div>
    </div>
  </main>

  <script>
    let activeTestCase = "";
    let recordingsData = {};
    let comparisonResults = [];
    let activeUrlA = "";
    let activeUrlB = "";
    let lastMatrixData = null;

    // Fetch list of recordings on load
    async function loadRecordings() {
      const res = await fetch("/api/recordings");
      recordingsData = await res.json();

      const container = document.getElementById("test-cases-list");
      container.innerHTML = "";

      // Add GLOBAL test case
      const globalItem = document.createElement("div");
      globalItem.className = "list-item";
      globalItem.style.fontWeight = "bold";
      globalItem.style.color = "var(--accent)";
      globalItem.textContent = "🌍 GLOBAL MATRIX (All Apps)";
      globalItem.onclick = () => selectTestCase("GLOBAL", globalItem);
      container.appendChild(globalItem);

      Object.keys(recordingsData).forEach((tc) => {
        const item = document.createElement("div");
        item.className = "list-item";
        item.textContent = tc.replace(/_/g, " ");
        item.onclick = () => selectTestCase(tc, item);
        container.appendChild(item);
      });
    }

    async function selectTestCase(tc, element) {
      document.querySelectorAll("#test-cases-list .list-item").forEach(item => item.classList.remove("active"));
      element.classList.add("active");

      activeTestCase = tc;
      let variants = [];

      if (tc === "GLOBAL") {
        document.getElementById("filter-codebases-container").style.display = "flex";
        Object.keys(recordingsData).forEach(suite => {
          recordingsData[suite].forEach(v => variants.push(\`\${suite}/\${v}\`));
        });
      } else {
        document.getElementById("filter-codebases-container").style.display = "none";
        variants = recordingsData[tc];
      }

      // Populate Variant Dropdowns
      const selectA = document.getElementById("select-variant-a");
      const selectB = document.getElementById("select-variant-b");

      selectA.innerHTML = "";
      selectB.innerHTML = "";

      variants.forEach((v) => {
        const optA = document.createElement("option");
        optA.value = v;
        optA.textContent = v;
        const optB = optA.cloneNode(true);

        selectA.appendChild(optA);
        selectB.appendChild(optB);
      });

      // Select second option for B by default if available
      if (variants.length > 1) {
        selectB.selectedIndex = 1;
      }

      document.getElementById("variant-selection-section").style.display = "block";
      await loadHeatmap(tc);
    }

    // Close dropdowns if clicked outside
    window.addEventListener("click", (e) => {
      document.querySelectorAll(".filter-dropdown-container").forEach(container => {
        if (!container.contains(e.target)) {
          container.classList.remove("open");
        }
      });
    });

    function toggleDropdown(container, event) {
      event.stopPropagation();
      const wasOpen = container.classList.contains("open");

      // Close other dropdowns
      document.querySelectorAll(".filter-dropdown-container").forEach(c => c.classList.remove("open"));

      if (!wasOpen) {
        container.classList.add("open");
        const searchInput = container.querySelector(".filter-search-box");
        if (searchInput) {
          searchInput.value = "";
          // Reset visibility of option items
          container.querySelectorAll(".filter-opt-item").forEach(item => item.style.display = "flex");
          searchInput.focus();
        }
      }
    }

    function filterDropdownOptions(input) {
      const query = input.value.toLowerCase();
      const container = input.closest(".filter-dropdown-container");
      container.querySelectorAll(".filter-opt-item").forEach(item => {
        const val = item.dataset.value.toLowerCase();
        if (val.includes(query)) {
          item.style.display = "flex";
        } else {
          item.style.display = "none";
        }
      });
    }

    async function loadHeatmap(tc) {
      document.getElementById("dashboard-empty-state").style.display = "none";
      document.getElementById("heatmap-card").style.display = "flex";
      document.getElementById("routes-card").style.display = "none";
      document.getElementById("comparison-details").style.display = "none";

      const res = await fetch(\`/api/matrix?testCase=\${tc}\`);
      lastMatrixData = await res.json();

      // Reset search field
      document.getElementById("variant-search-input").value = "";

      // Build Dynamic Dropdown Filters
      const filtersBar = document.getElementById("heatmap-dynamic-filters");
      filtersBar.innerHTML = "";

      if (!lastMatrixData.variantsMetadata) {
        applyMetadataFilters();
        return;
      }

      // Gather unique values for each metadata property
      const properties = {};
      Object.values(lastMatrixData.variantsMetadata).forEach(meta => {
        Object.entries(meta).forEach(([key, val]) => {
          if (key === "id") return; // Skip ID

          properties[key] = properties[key] || new Set();
          if (key === "localBuild") {
            properties[key].add(val ? "Local" : "Source");
          } else {
            properties[key].add(val === undefined ? "default" : String(val));
          }
        });
      });

      // Render a dropdown for each property
      Object.entries(properties).forEach(([propName, valuesSet]) => {
        const uniqueValues = Array.from(valuesSet).sort();

        // Create Dropdown Container
        const dropdownContainer = document.createElement("div");
        dropdownContainer.className = "filter-dropdown-container";
        dropdownContainer.dataset.prop = propName;

        // Button
        const btn = document.createElement("button");
        btn.className = "filter-dropdown-btn";
        const formattedPropName = propName === "localBuild" ? "Build Origin" : propName.charAt(0).toUpperCase() + propName.slice(1);
        btn.textContent = \`\${formattedPropName}: All\`;
        btn.onclick = (e) => toggleDropdown(dropdownContainer, e);
        dropdownContainer.appendChild(btn);

        // Content panel
        const content = document.createElement("div");
        content.className = "filter-dropdown-content";

        // Autocomplete search box
        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.className = "filter-search-box";
        searchInput.placeholder = "Search values...";
        searchInput.oninput = () => filterDropdownOptions(searchInput);
        content.appendChild(searchInput);

        // Options list container
        const optionsList = document.createElement("div");
        optionsList.className = "filter-options-list";

        uniqueValues.forEach(val => {
          const item = document.createElement("label");
          item.className = "filter-opt-item";
          item.dataset.value = val;

          const chk = document.createElement("input");
          chk.type = "checkbox";
          chk.className = "filter-opt-chk";
          chk.value = val;
          chk.checked = true; // checked by default
          chk.onchange = () => {
            updateDropdownButtonLabel(dropdownContainer, btn, formattedPropName);
            applyMetadataFilters();
          };

          item.appendChild(chk);
          item.appendChild(document.createTextNode(val));
          optionsList.appendChild(item);
        });

        content.appendChild(optionsList);
        dropdownContainer.appendChild(content);
        filtersBar.appendChild(dropdownContainer);
      });

      applyMetadataFilters();
    }

    function updateDropdownButtonLabel(container, btn, propLabel) {
      const chks = container.querySelectorAll(".filter-opt-chk");
      const checked = container.querySelectorAll(".filter-opt-chk:checked");
      if (checked.length === chks.length) {
        btn.textContent = \`\${propLabel}: All\`;
      } else if (checked.length === 0) {
        btn.textContent = \`\${propLabel}: None\`;
      } else if (checked.length === 1) {
        btn.textContent = \`\${propLabel}: \${checked[0].value}\`;
      } else {
        btn.textContent = \`\${propLabel}: (\${checked.length} selected)\`;
      }
    }

    function applyMetadataFilters() {
      if (!lastMatrixData) return;

      const searchQuery = document.getElementById("variant-search-input").value.toLowerCase();

      // Gather active checkboxes per property
      const activeSelections = {};
      document.querySelectorAll(".filter-dropdown-container").forEach(container => {
        const propName = container.dataset.prop;
        const checkedVals = Array.from(container.querySelectorAll(".filter-opt-chk:checked")).map(chk => chk.value);
        activeSelections[propName] = new Set(checkedVals);
      });

      const filteredVariants = lastMatrixData.variants.filter(v => {
        // Search query check on variant name
        if (!v.toLowerCase().includes(searchQuery)) return false;

        if (!lastMatrixData.variantsMetadata) return true;

        const meta = lastMatrixData.variantsMetadata[v] || {};

        // Dynamic properties check
        for (const propName of Object.keys(activeSelections)) {
          let val = meta[propName];
          if (propName === "localBuild") {
            val = val ? "Local" : "Source";
          } else {
            val = val === undefined ? "default" : String(val);
          }

          if (!activeSelections[propName].has(val)) {
            return false;
          }
        }

        return true;
      });

      renderMatrixTable(filteredVariants);
    }

    function renderMatrixTable(variants) {
      const container = document.getElementById("heatmap-grid-container");
      container.innerHTML = "";

      if (variants.length === 0) {
        container.innerHTML = \`<div style="color: var(--text-muted); padding: 24px; text-align: center;">No matching variants found for active filters.</div>\`;
        return;
      }

      const table = document.createElement("table");
      table.className = "heatmap-table";

      // 1. Header Row
      const thead = document.createElement("tr");
      thead.appendChild(document.createElement("th")); // empty top-left corner
      variants.forEach((v) => {
        const th = document.createElement("th");
        th.className = "heatmap-header-cell";
        th.textContent = v;
        thead.appendChild(th);
      });
      table.appendChild(thead);

      // 2. Rows
      variants.forEach((vA) => {
        const tr = document.createElement("tr");

        // Row label
        const tdLabel = document.createElement("td");
        tdLabel.className = "heatmap-row-label";
        tdLabel.textContent = vA;
        tr.appendChild(tdLabel);

        variants.forEach((vB) => {
          const tdCell = document.createElement("td");
          tdCell.className = "heatmap-cell";
          const similarity = lastMatrixData.matrix[vA][vB] || 0.0;
          const percent = Math.round(similarity * 100);
          tdCell.textContent = percent + "%";
          tdCell.dataset.codebaseA = vA.includes("/") ? vA.split("/")[0] : "";
          tdCell.dataset.codebaseB = vB.includes("/") ? vB.split("/")[0] : "";

          // Continuous red-to-green gradient interpolation (0% = HSL 0, 100% = HSL 120)
          const hue = similarity * 120;
          const bg = \`hsla(\${hue}, 70%, 42%, 0.85)\`;

          tdCell.style.backgroundColor = bg;
          tdCell.title = \`Similarity between \${vA} and \${vB}: \${percent}%\`;

          // Clicking a cell triggers the comparison for vA and vB
          tdCell.onclick = () => {
            document.getElementById("select-variant-a").value = vA;
            document.getElementById("select-variant-b").value = vB;
            triggerComparison();
          };

          tr.appendChild(tdCell);
        });

        table.appendChild(tr);
      });

      container.appendChild(table);
      applyMatrixFilter();
    }

    function applyMatrixFilter() {
      const ignoreDiffCodebases = document.getElementById("toggle-filter-codebases")?.checked;
      const cells = document.querySelectorAll(".heatmap-cell");
      cells.forEach((cell) => {
        const cbA = cell.dataset.codebaseA;
        const cbB = cell.dataset.codebaseB;
        if (ignoreDiffCodebases && cbA && cbB && cbA !== cbB) {
          cell.classList.add("de-emphasized");
        } else {
          cell.classList.remove("de-emphasized");
        }
      });
    }

    function showHeatmapView() {
      document.getElementById("dashboard-empty-state").style.display = "none";
      document.getElementById("heatmap-card").style.display = "flex";
      document.getElementById("routes-card").style.display = "none";
      document.getElementById("comparison-details").style.display = "none";
    }

    async function triggerComparison() {
      const varA = document.getElementById("select-variant-a").value;
      const varB = document.getElementById("select-variant-b").value;

      document.getElementById("dashboard-empty-state").style.display = "none";
      document.getElementById("heatmap-card").style.display = "none";
      document.getElementById("routes-card").style.display = "flex";
      document.getElementById("comparison-details").style.display = "none";

      const res = await fetch(\`/api/compare?testCase=\${encodeURIComponent(activeTestCase)}&variantA=\${encodeURIComponent(varA)}&variantB=\${encodeURIComponent(varB)}\`);
      const data = await res.json();
      comparisonResults = data.results;
      activeUrlA = data.urlA || "";
      activeUrlB = data.urlB || "";

      // Populate Discovered Routes List
      const container = document.getElementById("routes-container");
      container.innerHTML = "";

      comparisonResults.forEach((result, idx) => {
        const item = document.createElement("div");
        item.className = "route-item";
        item.onclick = () => viewRouteDiff(idx, item);

        const routeSpan = document.createElement("span");
        routeSpan.className = "route-path";
        routeSpan.textContent = result.route;

        const badgeDiv = document.createElement("div");
        badgeDiv.className = "badges";

        if (result.statusMatch && result.headerMismatches.length === 0 && result.bodySimilarity === 1.0) {
          badgeDiv.innerHTML = '<span class="badge success">Identical</span>';
        } else {
          if (!result.statusMatch) {
            badgeDiv.innerHTML += '<span class="badge danger">Status Mismatch</span>';
          }
          if (result.headerMismatches.length > 0) {
            badgeDiv.innerHTML += '<span class="badge warning">Header Diff</span>';
          }
          if (result.bodySimilarity < 1.0) {
            badgeDiv.innerHTML += \`<span class="badge danger">Body Diff (\${Math.round(result.bodySimilarity * 100)}%)</span>\`;
          }
        }

        item.appendChild(routeSpan);
        item.appendChild(badgeDiv);
        container.appendChild(item);
      });

      // Auto-click first route to load it
      if (comparisonResults.length > 0) {
        container.firstElementChild.click();
      }
    }

    function viewRouteDiff(idx, element) {
      document.querySelectorAll("#routes-container .route-item").forEach(item => item.classList.remove("active"));
      if (element) {
        element.classList.add("active");
      }

      document.getElementById("comparison-details").style.display = "flex";

      const res = comparisonResults[idx];

      // Update Endpoint Links & Route Path Title
      document.getElementById("route-title-path").textContent = res.route;
      
      const linkA = document.getElementById("link-endpoint-a");
      linkA.href = activeUrlA + res.route;
      linkA.textContent = activeUrlA + res.route;

      const linkB = document.getElementById("link-endpoint-b");
      linkB.href = activeUrlB + res.route;
      linkB.textContent = activeUrlB + res.route;

      // Update Visual Render Iframes
      // Update Visual Render Iframes (use cached renderer)
      document.getElementById("iframe-a").src = \`/api/render?testCase=\${encodeURIComponent(activeTestCase)}&variant=\${encodeURIComponent(document.getElementById("select-variant-a").value)}&route=\${encodeURIComponent(res.route)}\`;
      document.getElementById("iframe-b").src = \`/api/render?testCase=\${encodeURIComponent(activeTestCase)}&variant=\${encodeURIComponent(document.getElementById("select-variant-b").value)}&route=\${encodeURIComponent(res.route)}\`;

      // 1. Status Code
      const statusBox = document.getElementById("status-comparison-box");
      const statusText = \`A: \${res.statusA} vs B: \${res.statusB}\`;
      if (res.statusMatch) {
        statusBox.innerHTML = \`<span style="color:var(--success); font-weight: 600;">\${statusText} (Match)</span>\`;
      } else {
        statusBox.innerHTML = \`<span style="color:var(--danger); font-weight: 600;">\${statusText} (MISMATCH)</span>\`;
      }

      // 2. HTTP Headers comparison (merged list)
      const headersTbody = document.getElementById("headers-comparison-tbody");
      headersTbody.innerHTML = "";

      const mergedDiffs = [];
      res.headerMismatches.forEach(h => {
        mergedDiffs.push({ ...h, critical: true });
      });
      res.expectedHeaderVariations.forEach(h => {
        mergedDiffs.push({ ...h, critical: false });
      });

      // Sort alphabetically by header name
      mergedDiffs.sort((x, y) => x.header.localeCompare(y.header));

      if (mergedDiffs.length === 0) {
        headersTbody.innerHTML = '<tr><td colspan="4" style="color:var(--text-muted); text-align:center;">All response headers are identical</td></tr>';
      } else {
        mergedDiffs.forEach(h => {
          const badgeHtml = h.critical
            ? '<span class="badge danger" style="padding: 2px 6px;">Critical Mismatch</span>'
            : '<span class="badge warning" style="padding: 2px 6px; background-color: rgba(245, 158, 11, 0.1); color: var(--warning); border: 1px solid rgba(245, 158, 11, 0.2);">Expected Variation</span>';
          
          const tr = document.createElement("tr");
          
          const td1 = document.createElement("td");
          td1.style.fontFamily = "monospace";
          td1.style.fontWeight = "500";
          td1.textContent = h.header;
          
          const td2 = document.createElement("td");
          td2.style.color = h.critical ? 'var(--danger)' : 'var(--text)';
          td2.style.fontFamily = "monospace";
          td2.style.fontSize = "11px";
          td2.style.wordBreak = "break-all";
          td2.textContent = h.valA || '(missing)';
          
          const td3 = document.createElement("td");
          td3.style.color = h.critical ? 'var(--success)' : 'var(--text)';
          td3.style.fontFamily = "monospace";
          td3.style.fontSize = "11px";
          td3.style.wordBreak = "break-all";
          td3.textContent = h.valB || '(missing)';
          
          const td4 = document.createElement("td");
          td4.innerHTML = badgeHtml; // Safe: hardcoded markup

          tr.appendChild(td1);
          tr.appendChild(td2);
          tr.appendChild(td3);
          tr.appendChild(td4);
          headersTbody.appendChild(tr);
        });
      }

      // 4. Code Body Diff
      const diffContainer = document.getElementById("body-diff-container");
      diffContainer.innerHTML = "";

      if (res.isBinary) {
        const div = document.createElement("div");
        div.className = "empty-state";
        div.textContent = "Binary File Comparison: " + (res.bodyDiff || "Identical");
        diffContainer.appendChild(div);
        return;
      }

      if (res.bodyA === undefined && res.bodyB === undefined) {
        const div = document.createElement("div");
        div.className = "empty-state";
        div.textContent = "No body content recorded";
        diffContainer.appendChild(div);
        return;
      }

      if (res.bodyA === res.bodyB) {
        const div = document.createElement("div");
        div.className = "empty-state";
        div.style.color = "var(--success)";
        div.textContent = "Body Content is 100% Identical";
        diffContainer.appendChild(div);
        return;
      }

      if (!res.diffChanges || res.diffChanges.length === 0) {
        const div = document.createElement("div");
        div.className = "empty-state";
        if (res.bodyDiff) {
          div.textContent = res.bodyDiff;
        } else {
          div.textContent = "No diff details available";
        }
        diffContainer.appendChild(div);
        return;
      }

      const diffView = document.createElement("div");
      diffView.className = "diff-view";

      res.diffChanges.forEach((change) => {
        const lines = change.value.split("\\n");
        if (lines.length > 1 && lines[lines.length - 1] === "") {
          lines.pop();
        }

        lines.forEach((line) => {
          const row = document.createElement("div");
          row.className = "diff-line";
          if (change.added) row.classList.add("added");
          if (change.removed) row.classList.add("removed");

          const prefix = document.createElement("span");
          prefix.className = "diff-prefix";
          prefix.textContent = change.added ? "+" : (change.removed ? "-" : " ");

          const text = document.createElement("span");
          text.className = "diff-text";
          text.textContent = line;

          row.appendChild(prefix);
          row.appendChild(text);
          diffView.appendChild(row);
        });
      });

      diffContainer.appendChild(diffView);
    }

    function switchRightTab(tabId) {
      document.getElementById("tab-code-diff").classList.remove("active");
      document.getElementById("tab-code-diff").style.borderBottom = "none";
      document.getElementById("tab-code-diff").style.color = "var(--text-muted)";
      
      document.getElementById("tab-visual").classList.remove("active");
      document.getElementById("tab-visual").style.borderBottom = "none";
      document.getElementById("tab-visual").style.color = "var(--text-muted)";

      document.getElementById("body-diff-container").style.display = "none";
      document.getElementById("visual-render-container").style.display = "none";

      if (tabId === 'code') {
        document.getElementById("tab-code-diff").classList.add("active");
        document.getElementById("tab-code-diff").style.borderBottom = "2px solid var(--accent)";
        document.getElementById("tab-code-diff").style.color = "var(--text)";
        document.getElementById("body-diff-container").style.display = "block";
      } else if (tabId === 'visual') {
        document.getElementById("tab-visual").classList.add("active");
        document.getElementById("tab-visual").style.borderBottom = "2px solid var(--accent)";
        document.getElementById("tab-visual").style.color = "var(--text)";
        document.getElementById("visual-render-container").style.display = "flex";
      }
    }

    window.onload = loadRecordings;
  </script>
</body>
</html>
  `;
}
