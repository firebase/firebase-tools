import { expect } from "chai";
import * as glob from "glob";
import { relative } from "path";
import { readFileSync } from "fs";
import fetch from "node-fetch";
import type { NextConfig } from "next";

import { getBuildId } from "../../src/frameworks/next/utils";
import { fileExistsSync } from "../../src/fsutils";

const FIREBASE_PROJECT = process.env.FBTOOLS_TARGET_PROJECT || "";
const DOT_FIREBASE_FOLDER_PATH = `${__dirname}/.firebase/${FIREBASE_PROJECT}`;
const FIREBASE_EMULATOR_HUB = process.env.FIREBASE_EMULATOR_HUB;
const BASE_PATH: NextConfig["basePath"] = "base";
const I18N_BASE = "localized";
const DEFAULT_LANG = "en";

async function getFilesListFromDir(dir: string): Promise<string[]> {
  const files = await new Promise<string[]>((resolve, reject) => {
    glob(`${dir}/**/*`, (err, matches) => {
      if (err) reject(err);
      resolve(matches.filter(fileExistsSync));
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
    const {
      hosting: { port, host },
    } = await hubResponse.json();
    HOST = `http://${host}:${port}/${BASE_PATH}`;
  });

  after(() => {
    // This is not an empty block.
  });

  describe("app directory", () => {
    it("should have working SSG", async () => {
      const apiStaticJSON = JSON.parse(
        readFileSync(`${DOT_FIREBASE_FOLDER_PATH}/hosting/${BASE_PATH}/app/api/static`).toString()
      );

      const apiStaticResponse = await fetch(`${HOST}/app/api/static`);
      expect(apiStaticResponse.ok).to.be.true;
      expect(apiStaticResponse.headers.get("content-type")).to.eql("application/json");
      expect(apiStaticResponse.headers.get("custom-header")).to.eql("custom-value");
      expect(await apiStaticResponse.json()).to.eql(apiStaticJSON);

      const fooResponse = await fetch(`${HOST}/app/ssg`);
      expect(fooResponse.ok).to.be.true;
      const fooResponseText = await fooResponse.text();

      const fooHtml = readFileSync(
        `${DOT_FIREBASE_FOLDER_PATH}/hosting/${BASE_PATH}/app/ssg.html`
      ).toString();
      expect(fooHtml).to.eql(fooResponseText);
    });

    it("should have working ISR", async () => {
      const response = await fetch(`${HOST}/app/isr`);
      expect(response.ok).to.be.true;
      expect(response.headers.get("cache-control")).to.eql("private, no-cache, no-store, max-age=0, must-revalidate");
      expect(await response.text()).to.include("<body>ISR");
    });

    it("should have working SSR", async () => {
      const bazResponse = await fetch(`${HOST}/app/ssr`);
      expect(bazResponse.ok).to.be.true;
      expect(await bazResponse.text()).to.include("<body>SSR");

      const apiDynamicResponse = await fetch(`${HOST}/app/api/dynamic`);
      expect(apiDynamicResponse.ok).to.be.true;
      expect(apiDynamicResponse.headers.get("cache-control")).to.eql("private");
      expect(await apiDynamicResponse.json()).to.eql([1, 2, 3]);
    });
  });

  describe("pages directory", () => {
    for (const lang of [undefined, "en", "fr"]) {
      const headers = lang ? { "Accept-Language": lang } : undefined;

      describe(`${lang || "default"} locale`, () => {
        it("should have working SSR", async () => {
          const response = await fetch(`${HOST}/api/hello`, { headers });
          expect(response.ok).to.be.true;
          expect(await response.json()).to.eql({ name: "John Doe" });
        });

        it("should have working i18n", async () => {
          const response = await fetch(`${HOST}`, { headers });
          expect(response.ok).to.be.true;
          expect(await response.text()).to.include(`<html lang="${lang || DEFAULT_LANG}">`);
        });

        it("should have working SSG", async () => {
          const response = await fetch(`${HOST}/pages/ssg`, { headers });
          expect(response.ok).to.be.true;
          expect(await response.text()).to.include(`SSG <!-- -->${lang || DEFAULT_LANG}`);
        });
      });
    }

    it("should have working ISR", async () => {
      const response = await fetch(`${HOST}/pages/isr`);
      expect(response.ok).to.be.true;
      expect(response.headers.get("cache-control")).to.eql("private");
      expect(await response.text()).to.include(`ISR <!-- -->${DEFAULT_LANG}`);
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
      `${BASE_PATH}/_next/data/${buildId}/en/pages/fallback/1.json`,
      `${BASE_PATH}/_next/data/${buildId}/en/pages/fallback/2.json`,
      `${BASE_PATH}/_next/data/${buildId}/fr/pages/fallback/1.json`,
      `${BASE_PATH}/_next/data/${buildId}/fr/pages/fallback/2.json`,
      `${BASE_PATH}/_next/data/${buildId}/pages/ssg.json`,
      `${BASE_PATH}/_next/static/${buildId}/_buildManifest.js`,
      `${BASE_PATH}/_next/static/${buildId}/_ssgManifest.js`,
      `${BASE_PATH}/app/api/static`,
      `${BASE_PATH}/app/ssg.html`,
      `${BASE_PATH}/pages/fallback/1.html`,
      `${BASE_PATH}/pages/fallback/2.html`,
      `${BASE_PATH}/pages/ssg.html`,
      `${BASE_PATH}/404.html`,
      `${BASE_PATH}/500.html`,
      `${BASE_PATH}/index.html`,
      `${I18N_BASE}/en/${BASE_PATH}/pages/fallback/1.html`,
      `${I18N_BASE}/en/${BASE_PATH}/pages/fallback/2.html`,
      `${I18N_BASE}/en/${BASE_PATH}/pages/ssg.html`,
      `${I18N_BASE}/en/${BASE_PATH}/404.html`,
      `${I18N_BASE}/en/${BASE_PATH}/500.html`,
      `${I18N_BASE}/en/${BASE_PATH}/index.html`,
      `${I18N_BASE}/fr/${BASE_PATH}/pages/fallback/1.html`,
      `${I18N_BASE}/fr/${BASE_PATH}/pages/fallback/2.html`,
      `${I18N_BASE}/fr/${BASE_PATH}/pages/ssg.html`,
      `${I18N_BASE}/fr/${BASE_PATH}/404.html`,
      `${I18N_BASE}/fr/${BASE_PATH}/500.html`,
      `${I18N_BASE}/fr/${BASE_PATH}/index.html`,
    ];

    const EXPECTED_PATTERNS = [
      `${BASE_PATH}\/_next\/static\/chunks\/[^-]+-[^\.]+\.js`,
      `${BASE_PATH}\/_next\/static\/chunks\/app\/layout-[^\.]+\.js`,
      `${BASE_PATH}\/_next\/static\/chunks\/main-[^\.]+\.js`,
      `${BASE_PATH}\/_next\/static\/chunks\/main-app-[^\.]+\.js`,
      `${BASE_PATH}\/_next\/static\/chunks\/pages\/_app-[^\.]+\.js`,
      `${BASE_PATH}\/_next\/static\/chunks\/pages\/_error-[^\.]+\.js`,
      `${BASE_PATH}\/_next\/static\/chunks\/pages\/index-[^\.]+\.js`,
      `${BASE_PATH}\/_next\/static\/chunks\/polyfills-[^\.]+\.js`,
      `${BASE_PATH}\/_next\/static\/chunks\/webpack-[^\.]+\.js`,
      `${BASE_PATH}\/_next\/static\/css\/[^\.]+\.css`,
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
