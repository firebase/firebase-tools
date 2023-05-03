import { expect } from "chai";
import * as glob from "glob";
import { relative } from "path";
import { readFileSync } from "fs";
import fetch from "node-fetch";

import { getBuildId } from "../../src/frameworks/next/utils";

const FIREBASE_PROJECT = process.env.FBTOOLS_TARGET_PROJECT || "";
const DOT_FIREBASE_FOLDER_PATH = `${__dirname}/.firebase/${FIREBASE_PROJECT}`;
const FIREBASE_EMULATOR_HUB = process.env.FIREBASE_EMULATOR_HUB;

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
  let HOST: string;

  before(async () => {
    expect(FIREBASE_PROJECT, "$FIREBASE_PROJECT").to.not.be.empty;
    expect(FIREBASE_EMULATOR_HUB, "$FIREBASE_EMULATOR_HUB").to.not.be.empty;
    const hubResponse = await fetch(`http://${FIREBASE_EMULATOR_HUB}/emulators`);
    const { hosting: { port, host } } = await hubResponse.json();
    HOST = `http://${host}:${port}`;
  });

  after(() => {
    // This is not an empty block.
  });

  describe("app directory", () => {
    it("should have working SSG", async () => {
      const apiStaticJSON = JSON.parse(
        readFileSync(`${DOT_FIREBASE_FOLDER_PATH}/hosting/app/api/static`).toString()
      );

      const apiStaticResponse = await fetch(`${HOST}/app/api/static`);
      expect(apiStaticResponse.ok).to.be.true;
      expect(apiStaticResponse.headers.get("content-type")).to.eql("application/json");
      expect(apiStaticResponse.headers.get("custom-header")).to.eql("custom-value");
      expect(await apiStaticResponse.json()).to.eql(apiStaticJSON);

      const fooResponse = await fetch(`${HOST}/app/ssg`);
      expect(fooResponse.ok).to.be.true;
      const fooResponseText = await fooResponse.text();

      const fooHtml = readFileSync(`${DOT_FIREBASE_FOLDER_PATH}/hosting/app/ssg.html`).toString();
      expect(fooHtml).to.eql(fooResponseText);
    });

    it("should have working ISR", async () => {
      const response = await fetch(`${HOST}/app/isr`);
      expect(response.ok).to.be.true;
      expect(response.headers.get("cache-control")).to.eql("private");
      expect(await response.text()).to.include("<body>ISR<!-- -->");
    });

    it("should have working SSR", async () => {
      const bazResponse = await fetch(`${HOST}/app/ssr`);
      expect(bazResponse.ok).to.be.true;
      expect(await bazResponse.text()).to.include("<body>SSR<!-- -->");

      const apiDynamicResponse = await fetch(`${HOST}/app/api/dynamic`);
      expect(apiDynamicResponse.ok).to.be.true;
      expect(apiDynamicResponse.headers.get("cache-control")).to.eql("private");
      expect(await apiDynamicResponse.json()).to.eql([1, 2, 3]);
    });
  });

  describe("pages directory", () => {
    it("should have working SSR", async () => {
      const response = await fetch(`${HOST}/api/hello`);
      expect(response.ok).to.be.true;
      expect(await response.json()).to.eql({ name: "John Doe" });
    });
  });

  it("should log reasons for backend", () => {
    const result = readFileSync(
      "scripts/webframeworks-deploy-tests/firebase-emulators.log"
    ).toString();

    expect(result, "build result").to.include(
      "Building a Cloud Function to run this application. This is needed due to:"
    );
    expect(result, "build result").to.include(" • middleware");
    expect(result, "build result").to.include(" • Image Optimization");
    expect(result, "build result").to.include(" • use of fallback /pages/fallback/[id]");
    expect(result, "build result").to.include(" • use of revalidate /app/isr");
    expect(result, "build result").to.include(" • non-static route /api/hello");
    expect(result, "build result").to.include(" • non-static route /pages/ssr");
    expect(result, "build result").to.include(" • non-static component /app/api/dynamic/route");
    expect(result, "build result").to.include(" • non-static component /app/ssr/page");
  });

  it("should have the expected static files to be deployed", async () => {
    const buildId = await getBuildId(`${__dirname}/hosting/.next`);

    const EXPECTED_FILES = [
      `_next`,
      `_next/data`,
      `_next/data/${buildId}`,
      `_next/data/${buildId}/pages`,
      `_next/data/${buildId}/pages/fallback`,
      `_next/data/${buildId}/pages/fallback/1.json`,
      `_next/data/${buildId}/pages/fallback/2.json`,
      `_next/data/${buildId}/pages/ssg.json`,
      `_next/static`,
      `_next/static/chunks`,
      `_next/static/chunks/app`,
      `_next/static/chunks/app/app`,
      `_next/static/chunks/app/app/isr`,
      `_next/static/chunks/app/app/ssg`,
      `_next/static/chunks/app/app/ssr`,
      `_next/static/chunks/pages`,
      `_next/static/chunks/pages/pages`,
      `_next/static/chunks/pages/pages/fallback`,
      `_next/static/css`,
      `_next/static/${buildId}`,
      `_next/static/${buildId}/_buildManifest.js`,
      `_next/static/${buildId}/_ssgManifest.js`,
      `app`,
      `app/api`,
      `app/api/static`,
      `app/ssg.html`,
      `pages`,
      `pages/fallback`,
      `pages/fallback/1.html`,
      `pages/fallback/2.html`,
      `pages/ssg.html`,
      `404.html`,
      `500.html`,
      `index.html`,
    ];

    const EXPECTED_PATTERNS = [
      `_next\/static\/chunks\/[^-]+-[^\.]+\.js`,
      `_next\/static\/chunks\/app\/layout-[^\.]+\.js`,
      `_next\/static\/chunks\/main-[^\.]+\.js`,
      `_next\/static\/chunks\/main-app-[^\.]+\.js`,
      `_next\/static\/chunks\/pages\/_app-[^\.]+\.js`,
      `_next\/static\/chunks\/pages\/_error-[^\.]+\.js`,
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

    expect(unmatchedFiles, "matchedFiles").to.eql([]);
    expect(unmatchedExpectations, "unmatchedExpectations").to.eql([]);
  });
});
