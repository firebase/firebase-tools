import { expect } from "chai";

import * as cli from "./cli";
import { requireAuth } from "../../src/requireAuth";

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

describe("webframeworks deploy build", function (this) {
  this.timeout(1000_000);

  const RUN_ID = genRandomId();
  console.log(`TEST RUN: ${RUN_ID}`);

  async function setOptsAndDeploy(): Promise<cli.Result> {
    const args = ["exit 0"];
    if (FIREBASE_DEBUG) {
      args.push("--debug");
    }

    return await cli.exec("emulators:exec", FIREBASE_PROJECT, args, __dirname, false);
  }

  before(async () => {
    expect(FIREBASE_PROJECT).to.not.be.empty;

    await requireAuth({});
  });

  after(() => {
    // This is not an empty block.
  });

  it("logs reasons for backend", async () => {
    process.env.FIREBASE_CLI_EXPERIMENTS = "webframeworks";

    const result = await setOptsAndDeploy();

    expect(result.stdout, "deploy result").to.match(
      /Building a Cloud Function to run this application. This is needed due to:/
    );
    expect(result.stdout, "deploy result").to.match(/middleware/);
    expect(result.stdout, "deploy result").to.match(/Image Optimization/);
    expect(result.stdout, "deploy result").to.match(/use of revalidate \/bar/);
    expect(result.stdout, "deploy result").to.match(/non-static route \/api\/hello/);
  });
});
