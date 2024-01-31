import { expect } from "chai";
import * as glob from "glob";
import { join, normalize, relative } from "path";
import { readFileSync } from "fs";
import fetch from "node-fetch";
import type { NextConfig } from "next";

import { getBuildId } from "../../src/frameworks/next/utils";
import { fileExistsSync } from "../../src/fsutils";
import { readFile } from "fs/promises";

const NEXT_OUTPUT_PATH = `${__dirname}/.firebase/demo-nextjs`;
const ANGULAR_OUTPUT_PATH = `${__dirname}/.firebase/demo-angular`;
const FIREBASE_EMULATOR_HUB = process.env.FIREBASE_EMULATOR_HUB;
const NEXT_BASE_PATH: NextConfig["basePath"] = "base";
// TODO Angular basePath and i18n are not cooperating
const ANGULAR_BASE_PATH = "";
const I18N_BASE = "";
const DEFAULT_LANG = "en";
const LOG_FILE = "firebase-debug.log";
const NEXT_SOURCE = `${__dirname}/nextjs`;

async function getFilesListFromDir(dir: string): Promise<string[]> {
  const files = await new Promise<string[]>((resolve, reject) => {
    glob(`${dir}/**/*`, (err, matches) => {
      if (err) reject(err);
      resolve(matches.filter(fileExistsSync));
    });
  });
  return files.map((path) => relative(dir, path));
}

describe("webframeworks", function (this) {
  this.timeout(10_000);
  let NEXTJS_HOST: string;
  let ANGULAR_HOST: string;

  before(async () => {
    expect(FIREBASE_EMULATOR_HUB, "$FIREBASE_EMULATOR_HUB").to.not.be.empty;
    const hubResponse = await fetch(`http://${FIREBASE_EMULATOR_HUB}/emulators`);
    const {
      hosting: { port, host },
    } = await hubResponse.json();
    NEXTJS_HOST = `http://${host}:${port}/${NEXT_BASE_PATH}`.replace(/\/$/, "");
    ANGULAR_HOST = `http://${host}:${port + 5}/${ANGULAR_BASE_PATH}`.replace(/\/$/, "");
  });

  after(() => {
    // This is not an empty block.
  });

  describe("build", () => {
    it("should have the correct effective firebase.json", () => {
      const result = readFileSync(LOG_FILE).toString();
      const effectiveFirebaseJSON = result
        .split("[web frameworks] effective firebase.json: ")
        .at(-1)
        ?.split(new RegExp(`(\\[\\S+\\] )?\\[${new Date().getFullYear()}`))[0]
        ?.trim();
      expect(effectiveFirebaseJSON && JSON.parse(effectiveFirebaseJSON), "firebase.json").to.eql({
        hosting: [
          {
            target: "nextjs",
            source: "nextjs",
            frameworksBackend: {
              maxInstances: 1,
              region: "asia-east1",
            },
            rewrites: [
              {
                destination: "/base",
                source: "/base/about",
              },
              {
                source: "/base/**",
                function: {
                  functionId: "ssrdemonextjs",
                  region: "asia-east1",
                  pinTag: true,
                },
              },
              {
                function: {
                  functionId: "helloWorld",
                },
                source: "helloWorld",
              },
            ],
            site: "demo-nextjs",
            redirects: [
              {
                destination: "/base/",
                source: "/base/en/about",
                type: 308,
              },
              {
                destination: "/base",
                source: "/base/about",
                type: 308,
              },
            ],
            headers: [
              {
                headers: [
                  {
                    key: "x-custom-header",
                    value: "my custom header value",
                  },
                  {
                    key: "x-another-custom-header",
                    value: "my other custom header value",
                  },
                ],
                source: "/base/about",
              },
              {
                source: "/base/app/api/static",
                headers: [
                  {
                    key: "content-type",
                    value: "application/json",
                  },
                  {
                    key: "custom-header",
                    value: "custom-value",
                  },
                  {
                    key: "x-next-cache-tags",
                    value:
                      "_N_T_/layout,_N_T_/app/layout,_N_T_/app/api/layout,_N_T_/app/api/static/layout,_N_T_/app/api/static/route,_N_T_/app/api/static",
                  },
                ],
              },
              {
                headers: [
                  {
                    key: "x-next-cache-tags",
                    value:
                      "_N_T_/layout,_N_T_/app/layout,_N_T_/app/image/layout,_N_T_/app/image/page,_N_T_/app/image",
                  },
                ],
                source: "/base/app/image",
              },
              {
                headers: [
                  {
                    key: "x-next-cache-tags",
                    value:
                      "_N_T_/layout,_N_T_/app/layout,_N_T_/app/ssg/layout,_N_T_/app/ssg/page,_N_T_/app/ssg",
                  },
                ],
                source: "/base/app/ssg",
              },
              {
                headers: [
                  {
                    key: "x-next-cache-tags",
                    value:
                      "_N_T_/layout,_N_T_/app/layout,_N_T_/app/isr/layout,_N_T_/app/isr/page,_N_T_/app/isr",
                  },
                ],
                source: "/base/app/isr",
              },
            ],
            cleanUrls: true,
            trailingSlash: false,
            i18n: {
              root: "/",
            },
            public: ".firebase/demo-nextjs/hosting",
            webFramework: "next_ssr",
          },
          {
            target: "angular",
            source: "angular",
            frameworksBackend: {
              maxInstances: 1,
              region: "europe-west1",
            },
            rewrites: [
              {
                function: {
                  functionId: "helloWorld",
                },
                source: "helloWorld",
              },
              {
                source: "/**",
                function: {
                  functionId: "ssrdemoangular",
                  region: "europe-west1",
                  pinTag: true,
                },
              },
            ],
            site: "demo-angular",
            redirects: [],
            headers: [],
            cleanUrls: true,
            i18n: {
              root: "/",
            },
            public: ".firebase/demo-angular/hosting",
            webFramework: "angular_ssr",
          },
        ],
        functions: [
          {
            codebase: "default",
            ignore: ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log"],
            source: "functions",
          },
          {
            codebase: "firebase-frameworks-demo-nextjs",
            source: ".firebase/demo-nextjs/functions",
          },
          {
            codebase: "firebase-frameworks-demo-angular",
            source: ".firebase/demo-angular/functions",
          },
        ],
      });
    });
  });

  describe("next.js", () => {
    describe("app directory", () => {
      it("should have working static routes", async () => {
        const apiStaticJSON = JSON.parse(
          readFileSync(`${NEXT_OUTPUT_PATH}/hosting/${NEXT_BASE_PATH}/app/api/static`).toString(),
        );
        const apiStaticResponse = await fetch(`${NEXTJS_HOST}/app/api/static`);
        expect(apiStaticResponse.ok).to.be.true;
        expect(apiStaticResponse.headers.get("content-type")).to.eql("application/json");
        expect(apiStaticResponse.headers.get("custom-header")).to.eql("custom-value");
        expect(await apiStaticResponse.json()).to.eql(apiStaticJSON);
      });

      it("should have working SSG", async () => {
        const fooResponse = await fetch(`${NEXTJS_HOST}/app/ssg`);
        expect(fooResponse.ok).to.be.true;
        const fooResponseText = await fooResponse.text();

        const fooHtml = readFileSync(
          `${NEXT_OUTPUT_PATH}/hosting/${NEXT_BASE_PATH}/app/ssg.html`,
        ).toString();
        expect(fooHtml).to.eql(fooResponseText);
      });

      it("should have working ISR", async () => {
        const response = await fetch(`${NEXTJS_HOST}/app/isr`);
        expect(response.ok).to.be.true;
        expect(response.headers.get("cache-control")).to.eql(
          "private, no-cache, no-store, max-age=0, must-revalidate",
        );
        expect(await response.text()).to.include("<body>ISR");
      });

      it("should have working SSR", async () => {
        const bazResponse = await fetch(`${NEXTJS_HOST}/app/ssr`);
        expect(bazResponse.ok).to.be.true;
        expect(await bazResponse.text()).to.include("<body>SSR");
      });

      it("should have working dynamic routes", async () => {
        const apiDynamicResponse = await fetch(`${NEXTJS_HOST}/app/api/dynamic`);
        expect(apiDynamicResponse.ok).to.be.true;
        expect(apiDynamicResponse.headers.get("cache-control")).to.eql("private");
        expect(await apiDynamicResponse.json()).to.eql([1, 2, 3]);
      });

      it("should have working image", async () => {
        const response = await fetch(`${NEXTJS_HOST}/app/image`);
        expect(response.ok).to.be.true;
        expect(await response.text()).to.include("<body><img");
      });
    });

    describe("pages directory", () => {
      for (const lang of [undefined, "en", "fr"]) {
        const headers = lang ? { "Accept-Language": lang } : undefined;

        describe(`${lang || "default"} locale`, () => {
          it("should have working i18n", async () => {
            const response = await fetch(`${NEXTJS_HOST}`, { headers });
            expect(response.ok).to.be.true;
            expect(await response.text()).to.include(`<html lang="${lang || DEFAULT_LANG}">`);
          });

          it("should have working SSG", async () => {
            const response = await fetch(`${NEXTJS_HOST}/pages/ssg`, { headers });
            expect(response.ok).to.be.true;
            expect(await response.text()).to.include(`SSG <!-- -->${lang || DEFAULT_LANG}`);
          });
        });
      }

      it("should have working SSR", async () => {
        const response = await fetch(`${NEXTJS_HOST}/api/hello`);
        expect(response.ok).to.be.true;
        expect(await response.json()).to.eql({ name: "John Doe" });
      });

      it("should have working ISR", async () => {
        const response = await fetch(`${NEXTJS_HOST}/pages/isr`);
        expect(response.ok).to.be.true;
        expect(response.headers.get("cache-control")).to.eql("private");
        expect(await response.text()).to.include(`ISR <!-- -->${DEFAULT_LANG}`);
      });
    });

    it("should log reasons for backend", () => {
      const result = readFileSync(LOG_FILE).toString();

      expect(result, "build result").to.include(
        "Building a Cloud Function to run this application. This is needed due to:",
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
      const buildId = await getBuildId(join(NEXT_SOURCE, ".next"));

      const EXPECTED_FILES = ["", "en", "fr"]
        .flatMap((locale) => [
          ...(locale
            ? [
                `/${NEXT_BASE_PATH}/_next/data/${buildId}/${locale}/pages/fallback/1.json`,
                `/${NEXT_BASE_PATH}/_next/data/${buildId}/${locale}/pages/fallback/2.json`,
              ]
            : [
                `/${NEXT_BASE_PATH}/_next/data/${buildId}/pages/ssg.json`,
                `/${NEXT_BASE_PATH}/_next/static/${buildId}/_buildManifest.js`,
                `/${NEXT_BASE_PATH}/_next/static/${buildId}/_ssgManifest.js`,
                `/${NEXT_BASE_PATH}/app/api/static`,
                `/${NEXT_BASE_PATH}/app/image.html`,
                `/${NEXT_BASE_PATH}/app/ssg.html`,
                `/${NEXT_BASE_PATH}/404.html`,
              ]),
          `/${I18N_BASE}/${locale}/${NEXT_BASE_PATH}/pages/fallback/1.html`,
          `/${I18N_BASE}/${locale}/${NEXT_BASE_PATH}/pages/fallback/2.html`,
          `/${I18N_BASE}/${locale}/${NEXT_BASE_PATH}/pages/ssg.html`,
          // TODO(jamesdaniels) figure out why 404 isn't being translated
          // `/${I18N_BASE}/${locale}/${NEXT_BASE_PATH}/404.html`,
          `/${I18N_BASE}/${locale}/${NEXT_BASE_PATH}/500.html`,
          `/${I18N_BASE}/${locale}/${NEXT_BASE_PATH}/index.html`,
        ])
        .map(normalize)
        .map((it) => (it.startsWith("/") ? it.substring(1) : it));

      const EXPECTED_PATTERNS = [
        `${NEXT_BASE_PATH}\/_next\/static\/chunks\/[^-]+-[^\.]+\.js`,
        `${NEXT_BASE_PATH}\/_next\/static\/chunks\/app\/layout-[^\.]+\.js`,
        `${NEXT_BASE_PATH}\/_next\/static\/chunks\/main-[^\.]+\.js`,
        `${NEXT_BASE_PATH}\/_next\/static\/chunks\/main-app-[^\.]+\.js`,
        `${NEXT_BASE_PATH}\/_next\/static\/chunks\/pages\/_app-[^\.]+\.js`,
        `${NEXT_BASE_PATH}\/_next\/static\/chunks\/pages\/_error-[^\.]+\.js`,
        `${NEXT_BASE_PATH}\/_next\/static\/chunks\/pages\/index-[^\.]+\.js`,
        `${NEXT_BASE_PATH}\/_next\/static\/chunks\/polyfills-[^\.]+\.js`,
        `${NEXT_BASE_PATH}\/_next\/static\/chunks\/webpack-[^\.]+\.js`,
        `${NEXT_BASE_PATH}\/_next\/static\/css\/[^\.]+\.css`,
      ].map((it) => new RegExp(it));

      const files = await getFilesListFromDir(`${NEXT_OUTPUT_PATH}/hosting`);
      const unmatchedFiles = files.filter(
        (it) =>
          !(
            EXPECTED_FILES.includes(it) || EXPECTED_PATTERNS.some((pattern) => !!it.match(pattern))
          ),
      );
      const unmatchedExpectations = [
        ...EXPECTED_FILES.filter((it) => !files.includes(it)),
        ...EXPECTED_PATTERNS.filter((it) => !files.some((file) => !!file.match(it))),
      ];

      expect(unmatchedFiles, "matchedFiles").to.eql([]);
      expect(unmatchedExpectations, "unmatchedExpectations").to.eql([]);
    });
  });

  describe("angular", () => {
    for (const lang of [undefined, "en", "fr", "es"]) {
      const headers = lang ? { "Accept-Language": lang } : undefined;

      describe(`${lang || "default"} locale`, () => {
        it("should have working SSG", async () => {
          const path = `${ANGULAR_OUTPUT_PATH}/hosting/${I18N_BASE}/${
            lang || ""
          }/${ANGULAR_BASE_PATH}/index.html`;
          expect(fileExistsSync(path)).to.be.true;
          const contents = (await readFile(path)).toString();
          expect(contents).to.include(`<html lang="${lang || DEFAULT_LANG}" `);
          expect(contents).to.include(`Home ${lang || DEFAULT_LANG}`);

          const response = await fetch(ANGULAR_HOST, { headers });
          expect(response.ok).to.be.true;
          const body = await response.text();
          expect(body).to.eql(contents);
        });

        it("should have working SSR", async () => {
          const response = await fetch(`${ANGULAR_HOST}/foo/1`, { headers });
          expect(response.ok).to.be.true;
          const body = await response.text();
          expect(body).to.include(`<html lang="${lang || DEFAULT_LANG}" `);
          expect(body).to.include(`Foo ${lang || DEFAULT_LANG}`);
        });
      });
    }

    it("should have the expected static files to be deployed", async () => {
      const EXPECTED_FILES = ["", "en", "fr", "es"]
        .flatMap((locale) => [
          `/${I18N_BASE}/${locale}/${ANGULAR_BASE_PATH}/index.html`,
          `/${I18N_BASE}/${locale}/${ANGULAR_BASE_PATH}/3rdpartylicenses.txt`,
          `/${I18N_BASE}/${locale}/${ANGULAR_BASE_PATH}/favicon.ico`,
          `/${I18N_BASE}/${locale}/${ANGULAR_BASE_PATH}/index.original.html`,
          `/${I18N_BASE}/${locale}/${ANGULAR_BASE_PATH}/3rdpartylicenses.txt`,
        ])
        .map(normalize)
        .map((it) => (it.startsWith("/") ? it.substring(1) : it));

      const EXPECTED_PATTERNS = ["", "en", "fr", "es"]
        .flatMap((locale) => [
          `/${I18N_BASE}/${locale}/${ANGULAR_BASE_PATH}/main\.[^\.]+\.js`,
          `/${I18N_BASE}/${locale}/${ANGULAR_BASE_PATH}/polyfills\.[^\.]+\.js`,
          `/${I18N_BASE}/${locale}/${ANGULAR_BASE_PATH}/runtime\.[^\.]+\.js`,
          `/${I18N_BASE}/${locale}/${ANGULAR_BASE_PATH}/styles\.[^\.]+\.css`,
        ])
        .map(normalize)
        .map((it) => (it.startsWith("/") ? it.substring(1) : it))
        .map((it) => new RegExp(it.replace("/", "\\/")));

      const files = await getFilesListFromDir(`${ANGULAR_OUTPUT_PATH}/hosting`);
      const unmatchedFiles = files.filter(
        (it) =>
          !(
            EXPECTED_FILES.includes(it) || EXPECTED_PATTERNS.some((pattern) => !!it.match(pattern))
          ),
      );
      const unmatchedExpectations = [
        ...EXPECTED_FILES.filter((it) => !files.includes(it)),
        ...EXPECTED_PATTERNS.filter((it) => !files.some((file) => !!file.match(it))),
      ];

      expect(unmatchedFiles, "matchedFiles").to.eql([]);
      expect(unmatchedExpectations, "unmatchedExpectations").to.eql([]);
    });
  });
});
