import { expect } from "chai";

import * as cli from "./cli";
import { requireAuth } from "../../src/requireAuth";

const FIREBASE_PROJECT = process.env.GCLOUD_PROJECT || "";
const FIREBASE_DEBUG = process.env.FIREBASE_DEBUG || "";

function genRandomId(n = 10): string {
  const charset = "abcdefghijklmnopqrstuvwxyz";
  let id = "";
  for (let i = 0; i < n; i++) {
    id += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return id;
}

describe("webframeworks deploy", function (this) {
  this.timeout(1000_000);

  const RUN_ID = genRandomId();
  console.log(`TEST RUN: ${RUN_ID}`);

  async function setOptsAndDeploy(): Promise<cli.Result> {
    const args = [];
    if (FIREBASE_DEBUG) {
      args.push("--debug");
    }
    return await cli.exec("deploy", FIREBASE_PROJECT, args, __dirname, false);
  }

  before(async () => {
    expect(FIREBASE_PROJECT).to.not.be.empty;

    await requireAuth({});
  });

  after(() => {
    // This is not an empty block.
  });

  it("deploys functions with runtime options", async () => {
    process.env.FIREBASE_CLI_EXPERIMENTS = "webframeworks";

    const result = await setOptsAndDeploy();

    expect(result.stdout, "deploy result").to.match(/file upload complete/);
    expect(result.stdout, "deploy result").to.match(/found 20 files/);
    expect(result.stdout, "deploy result").to.match(/Deploy complete!/);
  });
});
