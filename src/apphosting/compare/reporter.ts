import * as fs from "fs-extra";
import * as path from "path";
import * as clc from "colorette";
import { ComparisonResult } from "./compare";
import { logger } from "../../logger";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface ComparisonSummary {
  projectId: string;
  location: string;
  backendA: string;
  backendB: string;
  timestamp: string;
  totalRoutes: number;
  matchingRoutes: number;
  mismatchingRoutes: number;
  overallSimilarity: number;
}

/**
 *
 */
export async function generateReport(
  projectId: string,
  location: string,
  backendA: string,
  backendB: string,
  results: ComparisonResult[],
  outputDir = "./compare-report",
): Promise<void> {
  const totalRoutes = results.length;
  const matching = results.filter(
    (r) => r.statusMatch && r.headerMismatches.length === 0 && r.bodySimilarity >= 0.99,
  );
  const mismatches = results.filter(
    (r) => !r.statusMatch || r.headerMismatches.length > 0 || r.bodySimilarity < 0.99,
  );

  const totalSimilarity = results.reduce((sum, r) => sum + r.bodySimilarity, 0);
  const overallSimilarity = totalRoutes > 0 ? totalSimilarity / totalRoutes : 1.0;

  const summary: ComparisonSummary = {
    projectId,
    location,
    backendA,
    backendB,
    timestamp: new Date().toISOString(),
    totalRoutes,
    matchingRoutes: matching.length,
    mismatchingRoutes: mismatches.length,
    overallSimilarity,
  };

  logger.info("\n==========================================");
  logger.info("       COMPARISON TEST SUMMARY");
  logger.info("==========================================");
  logger.info(`Project:      ${projectId}`);
  logger.info(`Location:     ${location}`);
  logger.info(`Backend A:    ${backendA}`);
  logger.info(`Backend B:    ${backendB}`);
  logger.info(`Total Routes: ${totalRoutes}`);
  logger.info(`Passed:       ${clc.green(String(matching.length))}`);
  logger.info(
    `Mismatched:   ${mismatches.length > 0 ? clc.red(String(mismatches.length)) : clc.green("0")}`,
  );
  logger.info(`Similarity:   ${clc.cyan((overallSimilarity * 100).toFixed(2) + "%")}`);
  logger.info("==========================================\n");

  if (mismatches.length > 0) {
    logger.warn(clc.bold(clc.red("Mismatched Routes:")));
    for (const m of mismatches) {
      logger.warn(`  - ${clc.bold(m.route)}`);
      if (!m.statusMatch) {
        logger.warn(`    * Status Code Mismatch`);
      }
      if (m.headerMismatches.length > 0) {
        logger.warn(`    * ${m.headerMismatches.length} Behavioral Header Mismatch(es)`);
      }
      if (m.bodySimilarity < 0.99) {
        logger.warn(`    * Body Similarity: ${(m.bodySimilarity * 100).toFixed(2)}%`);
      }
    }
    logger.info("");
  }

  await fs.ensureDir(outputDir);
  
  // Dump summary without the bodies to save space
  const resultsWithoutBodies: ComparisonResult[] = results.map(r => {
    const { bodyA, bodyB, ...rest } = r;
    return rest;
  });
  await fs.writeJson(path.join(outputDir, "summary.json"), { summary, results: resultsWithoutBodies }, { spaces: 2 });
  logger.info(`JSON report saved to: ${path.join(outputDir, "summary.json")}`);

  // Dump raw bodies for manual diffing
  const routesDirA = path.join(outputDir, "backendA");
  const routesDirB = path.join(outputDir, "backendB");
  for (const r of results) {
    if (r.bodyA !== undefined && r.bodyB !== undefined) {
      // Map route /foo/bar to /foo/bar.html or /foo/bar/index.html
      const safeRoute = r.route === "/" ? "index.html" : r.route.replace(/^\//, "") + ".html";
      await fs.outputFile(path.join(routesDirA, safeRoute), r.bodyA, "utf-8");
      await fs.outputFile(path.join(routesDirB, safeRoute), r.bodyB, "utf-8");
    }
  }
  logger.info(`Raw responses saved to ${routesDirA} and ${routesDirB} for manual diffing.`);

  const html = getHtmlTemplate(summary, resultsWithoutBodies);
  await fs.outputFile(path.join(outputDir, "index.html"), html, "utf-8");
  logger.info(
    `HTML Dashboard generated at: ${clc.underline(path.join(outputDir, "index.html"))}\n`,
  );
}

function getHtmlTemplate(summary: ComparisonSummary, results: ComparisonResult[]): string {
  const resultsRows = results
    .map((r) => {
      const isPass = r.statusMatch && r.headerMismatches.length === 0 && r.bodySimilarity >= 0.99;
      const badgeClass = isPass ? "badge-success" : "badge-error";
      const badgeText = isPass ? "PASS" : "FAIL";

      const headersList = r.headerMismatches
        .map((m) => `<li><code>${escapeHtml(m.header)}</code>: "${escapeHtml(m.valA)}" vs "${escapeHtml(m.valB)}"</li>`)
        .join("");

      const variationsList = r.expectedHeaderVariations
        .map((m) => `<li><code>${escapeHtml(m.header)}</code>: "${escapeHtml(m.valA)}" vs "${escapeHtml(m.valB)}"</li>`)
        .join("");

      return `
      <tr class="route-row ${isPass ? "pass-row" : "fail-row"}">
        <td class="font-mono">${escapeHtml(r.route)}</td>
        <td><span class="badge ${badgeClass}">${badgeText}</span></td>
        <td>${r.statusMatch ? "Match" : "Mismatch"}</td>
        <td>${(r.bodySimilarity * 100).toFixed(1)}%</td>
        <td>
          ${r.headerMismatches.length > 0 ? `<div class="collapsible"><strong>Mismatches:</strong><ul>${headersList}</ul></div>` : "Match"}
          ${r.expectedHeaderVariations.length > 0 ? `<div class="collapsible variations"><strong>Variations:</strong><ul>${variationsList}</ul></div>` : ""}
        </td>
      </tr>
    `;
    })
    .join("");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>App Hosting Comparison Report</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-color: #0b0f19;
      --panel-bg: rgba(255, 255, 255, 0.03);
      --border-color: rgba(255, 255, 255, 0.08);
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --primary: #6366f1;
      --success: #10b981;
      --error: #ef4444;
      --warning: #f59e0b;
    }

    body {
      background-color: var(--bg-color);
      color: var(--text-main);
      font-family: 'Inter', sans-serif;
      margin: 0;
      padding: 2rem;
      min-height: 100vh;
    }

    header {
      margin-bottom: 2.5rem;
    }

    h1 {
      font-weight: 700;
      font-size: 2.25rem;
      margin: 0 0 0.5rem 0;
      letter-spacing: -0.025em;
      background: linear-gradient(135deg, #a5b4fc 0%, #6366f1 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .meta {
      color: var(--text-muted);
      font-size: 0.95rem;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1.5rem;
      margin-bottom: 3rem;
    }

    .card {
      background: var(--panel-bg);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 1.5rem;
      backdrop-filter: blur(10px);
    }

    .card-title {
      font-size: 0.85rem;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--text-muted);
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }

    .card-value {
      font-size: 1.75rem;
      font-weight: 700;
    }

    .passed { color: var(--success); }
    .failed { color: var(--error); }
    .percentage { color: #818cf8; }

    .table-container {
      background: var(--panel-bg);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      overflow: hidden;
      backdrop-filter: blur(10px);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }

    th, td {
      padding: 1rem 1.5rem;
      border-bottom: 1px solid var(--border-color);
      font-size: 0.9rem;
    }

    th {
      font-weight: 600;
      background: rgba(0, 0, 0, 0.2);
      color: var(--text-muted);
    }

    tr:last-child td {
      border-bottom: none;
    }

    .font-mono {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.85rem;
    }

    .badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.05em;
    }

    .badge-success {
      background: rgba(16, 185, 129, 0.15);
      color: var(--success);
    }

    .badge-error {
      background: rgba(239, 68, 68, 0.15);
      color: var(--error);
    }

    .collapsible {
      font-size: 0.8rem;
      margin-top: 0.25rem;
    }

    .collapsible ul {
      margin: 0.25rem 0 0 0;
      padding-left: 1.25rem;
      color: var(--text-muted);
    }

    .collapsible.variations ul {
      color: #a78bfa;
    }

    code {
      font-family: 'JetBrains Mono', monospace;
      background: rgba(255, 255, 255, 0.05);
      padding: 0.1rem 0.3rem;
      border-radius: 4px;
    }
  </style>
</head>
<body>

  <header>
    <h1>App Hosting Comparison Dashboard</h1>
    <div class="meta">
      Ran on <strong>${new Date(summary.timestamp).toLocaleString()}</strong> for project <code>${summary.projectId}</code> (${summary.location})
    </div>
  </header>

  <section class="grid">
    <div class="card">
      <div class="card-title">Total Checked Routes</div>
      <div class="card-value">${summary.totalRoutes}</div>
    </div>
    <div class="card">
      <div class="card-title">Passed Routes</div>
      <div class="card-value passed">${summary.matchingRoutes}</div>
    </div>
    <div class="card">
      <div class="card-title">Mismatched Routes</div>
      <div class="card-value failed">${summary.mismatchingRoutes}</div>
    </div>
    <div class="card">
      <div class="card-title">Overall Similarity</div>
      <div class="card-value percentage">${(summary.overallSimilarity * 100).toFixed(2)}%</div>
    </div>
  </section>

  <section class="table-container">
    <table>
      <thead>
        <tr>
          <th>Route</th>
          <th>Parity</th>
          <th>HTTP Status</th>
          <th>Body Parity</th>
          <th>Header Assertions</th>
        </tr>
      </thead>
      <tbody>
        ${resultsRows}
      </tbody>
    </table>
  </section>

</body>
</html>
  `;
}
