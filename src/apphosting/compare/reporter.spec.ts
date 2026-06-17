import { expect } from "chai";
import * as fs from "fs-extra";
import * as path from "path";
import { generateReport } from "./reporter";
import { ComparisonResult } from "./compare";

describe("Report Generator", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(process.cwd(), "scratch-test-report-" + Math.random().toString(36).substring(7));
    fs.ensureDirSync(tempDir);
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it("should generate JSON and HTML reports", async () => {
    const results: ComparisonResult[] = [
      {
        route: "/",
        statusMatch: true,
        headerMismatches: [],
        expectedHeaderVariations: [],
        bodySimilarity: 1.0,
        bodyDiff: "",
        isBinary: false
      },
      {
        route: "/about",
        statusMatch: true,
        headerMismatches: [{ header: "Cache-Control", valA: "max-age=0", valB: "no-cache" }],
        expectedHeaderVariations: [],
        bodySimilarity: 0.95,
        bodyDiff: "HTML content mismatch",
        isBinary: false
      }
    ];

    await generateReport(
      "aryanf-test",
      "us-central1",
      "compare-slot-1-a",
      "compare-slot-1-b",
      results,
      tempDir
    );

    const jsonPath = path.join(tempDir, "summary.json");
    const htmlPath = path.join(tempDir, "index.html");

    expect(fs.existsSync(jsonPath)).to.be.true;
    expect(fs.existsSync(htmlPath)).to.be.true;

    const data = fs.readJsonSync(jsonPath);
    expect(data.summary.totalRoutes).to.equal(2);
    expect(data.summary.matchingRoutes).to.equal(1);
    expect(data.summary.mismatchingRoutes).to.equal(1);
    expect(data.summary.overallSimilarity).to.be.closeTo(0.975, 0.001);

    const htmlContent = fs.readFileSync(htmlPath, "utf-8");
    expect(htmlContent).to.include("App Hosting Comparison Dashboard");
    expect(htmlContent).to.include("/about");
  });
});
