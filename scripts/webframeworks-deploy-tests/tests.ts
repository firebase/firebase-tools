import { expect } from "chai";
import * as glob from "glob";
import { relative } from "path";
import { readFileSync } from "fs";

import { getBuildId } from "../../src/frameworks/next/utils";

const FIREBASE_PROJECT = process.env.FBTOOLS_TARGET_PROJECT || "";

async function getFilesListFromDir(dir: string): Promise<string[]> {
  const files = await new Promise<string[]>((resolve, reject) => {
    glob(`${dir}/**/*`, (err, matches) => {
      if (err) reject(err);
      resolve(matches);
    });
  });
  return files.map((path) => relative(dir, path));
}

describe("webframeworks deploy build", function (this) {
  this.timeout(10_000);

  before(() => {
    expect(FIREBASE_PROJECT, "FIREBASE_PROJECT").to.not.be.empty;
  });

  after(() => {
    // This is not an empty block.
  });

  it("should log reasons for backend", () => {
    process.env.FIREBASE_CLI_EXPERIMENTS = "webframeworks";
    const result = readFileSync(
      "scripts/webframeworks-deploy-tests/firebase-emulators.log"
    ).toString();

    expect(result, "build result").to.match(
      /Building a Cloud Function to run this application. This is needed due to:/
    );
    expect(result, "build result").to.match(/middleware/);
    expect(result, "build result").to.match(/Image Optimization/);
    expect(result, "build result").to.match(/use of revalidate \/bar/);
    expect(result, "build result").to.match(/non-static route \/api\/hello/);
  });

  it("should have the expected static files to be deployed", async () => {
    const buildId = await getBuildId(`${__dirname}/hosting/.next`);

    const DOT_FIREBASE_FOLDER_PATH = `${__dirname}/.firebase/${FIREBASE_PROJECT}`;

    const EXPECTED_FILES = [
      `_next`,
      `_next/static`,
      `_next/static/chunks`,
      `_next/static/chunks/app`,
      `_next/static/chunks/app/bar`,
      `_next/static/chunks/app/foo`,
      `_next/static/chunks/pages`,
      `_next/static/chunks/pages/about`,
      `_next/static/css`,
      `_next/static/${buildId}`,
      `_next/static/${buildId}/_buildManifest.js`,
      `_next/static/${buildId}/_ssgManifest.js`,
      `api`,
      `api/static`,
      `404.html`,
      `500.html`,
      `foo.html`,
      `index.html`,
    ];

    const EXPECTED_PATTERNS = [
      `_next\/static\/chunks\/[^-]+-[^\.]+\.js`,
      `_next\/static\/chunks\/app\/bar\/page-[^\.]+\.js`,
      `_next\/static\/chunks\/app\/foo\/page-[^\.]+\.js`,
      `_next\/static\/chunks\/app\/layout-[^\.]+\.js`,
      `_next\/static\/chunks\/main-[^\.]+\.js`,
      `_next\/static\/chunks\/main-app-[^\.]+\.js`,
      `_next\/static\/chunks\/pages\/_app-[^\.]+\.js`,
      `_next\/static\/chunks\/pages\/_error-[^\.]+\.js`,
      `_next\/static\/chunks\/pages\/about\/me-[^\.]+\.js`,
      `_next\/static\/chunks\/pages\/index-[^\.]+\.js`,
      `_next\/static\/chunks\/polyfills-[^\.]+\.js`,
      `_next\/static\/chunks\/webpack-[^\.]+\.js`,
      `_next\/static\/css\/[^\.]+\.css`,
    ].map((it) => new RegExp(it));

    const files = await getFilesListFromDir(`${DOT_FIREBASE_FOLDER_PATH}/hosting`);
    const unmatchedFiles = files.filter(
      (it) =>
        !(EXPECTED_FILES.includes(it) || EXPECTED_PATTERNS.some((pattern) => !!it.match(pattern)))
    );
    const unmatchedExpectations = [
      ...EXPECTED_FILES.filter((it) => !files.includes(it)),
      ...EXPECTED_PATTERNS.filter((it) => !files.some((file) => !!file.match(it))),
    ];

    expect(unmatchedFiles).to.be.empty;
    expect(unmatchedExpectations).to.be.empty;
  });
});
