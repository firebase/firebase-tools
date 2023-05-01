import { expect } from "chai";
import * as glob from "glob";

import * as cli from "./cli";
import { requireAuth } from "../../src/requireAuth";
import { getBuildId } from "../../src/frameworks/next/utils";

const FIREBASE_PROJECT = process.env.FBTOOLS_TARGET_PROJECT || "";
const FIREBASE_DEBUG = process.env.FIREBASE_DEBUG || "";

function genRandomId(n = 10): string {
  const charset = "abcdefghijklmnopqrstuvwxyz";
  let id = "";
  for (let i = 0; i < n; i++) {
    id += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return id;
}

function getFilesListFromDir(dir: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    glob(`${dir}/**/*`, (err, matches) => {
      if (err) reject(err);
      resolve(matches);
    });
  });
}

describe("webframeworks deploy build", function (this) {
  this.timeout(1000_000);

  let result: cli.Result;

  const RUN_ID = genRandomId();
  console.log(`TEST RUN: ${RUN_ID}`);

  async function setOptsAndBuild(): Promise<cli.Result> {
    const args = ["exit 0"];
    if (FIREBASE_DEBUG) {
      args.push("--debug");
    }

    return await cli.exec("emulators:exec", FIREBASE_PROJECT, args, __dirname, false);
  }

  before(async () => {
    expect(FIREBASE_PROJECT).to.not.be.empty;

    await requireAuth({});
    result = await setOptsAndBuild();
  });

  after(() => {
    // This is not an empty block.
  });

  it("should log reasons for backend", () => {
    process.env.FIREBASE_CLI_EXPERIMENTS = "webframeworks";

    expect(result.stdout, "build result").to.match(
      /Building a Cloud Function to run this application. This is needed due to:/
    );
    expect(result.stdout, "build result").to.match(/middleware/);
    expect(result.stdout, "build result").to.match(/Image Optimization/);
    expect(result.stdout, "build result").to.match(/use of revalidate \/bar/);
    expect(result.stdout, "build result").to.match(/non-static route \/api\/hello/);
  });

  it("should have the expected static files to be deployed", async () => {
    const buildId = await getBuildId(`${__dirname}/hosting/.next`);

    const DOT_FIREBASE_FOLDER_PATH = `${__dirname}/.firebase/${FIREBASE_PROJECT}`;

    const EXPECTED_FILES = [
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/_next`,
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/_next/static`,
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/_next/static/chunks`,
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/_next/static/chunks/947-780e18ebaac1dafe.js`,
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/_next/static/chunks/app`,
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/_next/static/chunks/app-internals-deff92b1ed08e91d.js`,
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/_next/static/chunks/app/bar`,
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/_next/static/chunks/app/bar/page-e877dfa5c724d54e.js`,
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/_next/static/chunks/app/foo`,
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/_next/static/chunks/app/foo/page-c1c064f5d1af601f.js`,
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/_next/static/chunks/app/layout-ae3f6555ddf72969.js`,
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/_next/static/chunks/main-44afa90857524d49.js`,
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/_next/static/chunks/main-app-875afe88ab919d68.js`,
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/_next/static/chunks/pages`,
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/_next/static/chunks/pages/_app-c5083181dd8cc27d.js`,
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/_next/static/chunks/pages/_error-1fd6c3782812bbc4.js`,
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/_next/static/chunks/pages/about`,
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/_next/static/chunks/pages/about/me-146211fe20bdadd1.js`,
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/_next/static/chunks/pages/index-6e7c448ab6e40737.js`,
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/_next/static/chunks/polyfills-c67a75d1b6f99dc8.js`,
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/_next/static/chunks/webpack-0123d128abd2ae52.js`,
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/_next/static/css`,
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/_next/static/css/ab44ce7add5c3d11.css`,
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/_next/static/css/ae0e3e027412e072.css`,
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/_next/static/${buildId}`,
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/_next/static/${buildId}/_buildManifest.js`,
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/_next/static/${buildId}/_ssgManifest.js`,
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/404.html`,
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/500.html`,
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/foo.html`,
      `${DOT_FIREBASE_FOLDER_PATH}/hosting/index.html`,
    ];

    expect(await getFilesListFromDir(`${DOT_FIREBASE_FOLDER_PATH}/hosting`)).to.have.members(
      EXPECTED_FILES
    );
  });
});
