import * as path from "node:path";
import * as fs from "fs-extra";

import { expect } from "chai";
import * as functions from "firebase-functions";
import * as functionsv2 from "firebase-functions/v2";

import * as cli from "./cli";
import * as proto from "../../src/gcp/proto";
import * as tasks from "../../src/gcp/cloudtasks";
import * as scheduler from "../../src/gcp/cloudscheduler";
import { Endpoint } from "../../src/deploy/functions/backend";
import { requireAuth } from "../../src/requireAuth";

const FIREBASE_PROJECT = process.env.GCLOUD_PROJECT || "";
const FIREBASE_DEBUG = process.env.FIREBASE_DEBUG || "";
const FUNCTIONS_DIR = path.join(__dirname, "functions");
const FNS_COUNT = 20;

function genRandomId(n = 10): string {
  const charset = "abcdefghijklmnopqrstuvwxyz";
  let id = "";
  for (let i = 0; i < n; i++) {
    id += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return id;
}

interface Opts {
  v1Opts: functions.RuntimeOptions;
  v2Opts: functionsv2.GlobalOptions;

  v1TqOpts: functions.tasks.TaskQueueOptions;
  v2TqOpts: functionsv2.tasks.TaskQueueOptions;

  v1IdpOpts: functions.auth.UserOptions;
  v2IdpOpts: functionsv2.identity.BlockingOptions;

  v1ScheduleOpts: functions.ScheduleRetryConfig;
  v2ScheduleOpts: functionsv2.scheduler.ScheduleOptions;
}

async function setOpts(opts: Opts) {
  let stmt = "";
  for (const [name, opt] of Object.entries(opts)) {
    if (opt) {
      stmt += `export const ${name} = ${JSON.stringify(opt)};\n`;
    }
  }
  await fs.writeFile(path.join(FUNCTIONS_DIR, "options.js"), stmt);
}

async function listFns(runId: string): Promise<Record<string, Endpoint>> {
  const result = await cli.exec("functions:list", FIREBASE_PROJECT, ["--json"], __dirname, false);
  const output = JSON.parse(result.stdout);

  const eps: Record<string, Endpoint> = {};
  for (const ep of output.result as Endpoint[]) {
    const id = ep.id.replace(`${runId}-`, "");
    if (ep.id !== id) {
      // By default, functions list does not attempt to fully hydrate configuration options for task queue and schedule
      // functions because they require extra API calls. Manually inject details.
      if ("taskQueueTrigger" in ep) {
        const queue = await tasks.getQueue(tasks.queueNameForEndpoint(ep));
        ep.taskQueueTrigger = tasks.triggerFromQueue(queue);
      }
      if ("scheduleTrigger" in ep) {
        const jobName = scheduler.jobNameForEndpoint(ep, "us-central1");
        const job = (await scheduler.getJob(jobName)).body as scheduler.Job;
        if (job.retryConfig) {
          const cfg = job.retryConfig;
          ep.scheduleTrigger.retryConfig = {
            retryCount: cfg.retryCount,
            maxDoublings: cfg.maxDoublings,
          };
          if (cfg.maxBackoffDuration) {
            ep.scheduleTrigger.retryConfig.maxBackoffSeconds = proto.secondsFromDuration(
              cfg.maxBackoffDuration,
            );
          }
          if (cfg.maxRetryDuration) {
            ep.scheduleTrigger.retryConfig.maxRetrySeconds = proto.secondsFromDuration(
              cfg.maxRetryDuration,
            );
          }
          if (cfg.minBackoffDuration) {
            ep.scheduleTrigger.retryConfig.minBackoffSeconds = proto.secondsFromDuration(
              cfg.minBackoffDuration,
            );
          }
        }
      }

      eps[id] = ep;
    }
    // Ignore functions w/o matching RUN_ID as prefix.
    // They are probably left over from previous test runs.
  }
  return eps;
}

describe("firebase deploy", function (this) {
  this.timeout(1000_000);

  const RUN_ID = genRandomId();
  console.log(`TEST RUN: ${RUN_ID}`);

  async function setOptsAndDeploy(opts: Opts): Promise<cli.Result> {
    await setOpts(opts);
    const args = ["--only", "functions", "--non-interactive", "--force"];
    if (FIREBASE_DEBUG) {
      args.push("--debug");
    }
    return await cli.exec("deploy", FIREBASE_PROJECT, args, __dirname, false);
  }

  before(async () => {
    expect(FIREBASE_PROJECT).to.not.be.empty;

    await requireAuth({});
    // write up index.js to import trigger definition using unique group identifier.
    // All exported functions will have name {hash}-{trigger} e.g. 'abcdefg-v1storage'.
    await fs.writeFile(
      path.join(FUNCTIONS_DIR, "index.js"),
      `export * as ${RUN_ID} from "./fns.js";`,
    );
  });

  after(async () => {
    try {
      await fs.unlink(path.join(FUNCTIONS_DIR, "index.js"));
    } catch (e: any) {
      if (e?.code === "ENOENT") {
        return;
      }
      throw e;
    }
  });

  it("deploys functions with runtime options", async () => {
    const opts: Opts = {
      v1Opts: {
        memory: "128MB",
        maxInstances: 42,
        timeoutSeconds: 42,
        preserveExternalChanges: true,
      },
      v2Opts: {
        memory: "128MiB",
        maxInstances: 42,
        timeoutSeconds: 42,
        cpu: 2,
        concurrency: 42,
        preserveExternalChanges: true,
      },
      v1TqOpts: {
        retryConfig: {
          maxAttempts: 42,
          maxRetrySeconds: 42,
          maxBackoffSeconds: 42,
          maxDoublings: 42,
          minBackoffSeconds: 42,
        },
        rateLimits: {
          maxDispatchesPerSecond: 42,
          maxConcurrentDispatches: 42,
        },
      },
      v2TqOpts: {
        retryConfig: {
          maxAttempts: 42,
          maxRetrySeconds: 42,
          maxBackoffSeconds: 42,
          maxDoublings: 42,
          minBackoffSeconds: 42,
        },
        rateLimits: {
          maxDispatchesPerSecond: 42,
          maxConcurrentDispatches: 42,
        },
      },
      v1IdpOpts: {
        blockingOptions: {
          idToken: true,
          refreshToken: true,
          accessToken: false,
        },
      },
      v2IdpOpts: {
        idToken: true,
        refreshToken: true,
        accessToken: true,
      },
      v1ScheduleOpts: {
        retryCount: 3,
        minBackoffDuration: "42s",
        maxRetryDuration: "42s",
        maxDoublings: 42,
        maxBackoffDuration: "42s",
      },
      v2ScheduleOpts: {
        schedule: "every 30 minutes",
        retryCount: 3,
        minBackoffSeconds: 42,
        maxRetrySeconds: 42,
        maxDoublings: 42,
        maxBackoffSeconds: 42,
      },
    };

    const result = await setOptsAndDeploy(opts);
    expect(result.stdout, "deploy result").to.match(/Deploy complete!/);

    const endpoints = await listFns(RUN_ID);
    expect(Object.keys(endpoints).length, "number of deployed functions").to.equal(FNS_COUNT);

    for (const e of Object.values(endpoints)) {
      expect(e).to.include({
        availableMemoryMb: 128,
        timeoutSeconds: 42,
        maxInstances: 42,
      });
      if (e.platform === "gcfv2") {
        expect(e).to.include({
          cpu: 2,
          concurrency: 42,
        });
      }
      if ("taskQueueTrigger" in e) {
        expect(e.taskQueueTrigger).to.deep.equal({
          retryConfig: {
            maxAttempts: 42,
            maxRetrySeconds: 42,
            maxBackoffSeconds: 42,
            maxDoublings: 42,
            minBackoffSeconds: 42,
          },
          rateLimits: {
            maxDispatchesPerSecond: 42,
            maxConcurrentDispatches: 42,
          },
        });
      }
      if ("scheduleTrigger" in e) {
        expect(e.scheduleTrigger).to.deep.equal({
          retryConfig: {
            retryCount: 3,
            maxRetrySeconds: 42,
            maxBackoffSeconds: 42,
            maxDoublings: 42,
            minBackoffSeconds: 42,
          },
        });
      }
      if (e.secretEnvironmentVariables) {
        expect(e.secretEnvironmentVariables).to.have.length(1);
        expect(e.secretEnvironmentVariables[0]).to.include({
          key: "TOP",
          secret: "TOP",
        });
      }
    }
  });

  it("skips duplicate deploys functions with runtime options when preserveExternalChanges is set", async () => {
    const opts: Opts = {
      v1Opts: { preserveExternalChanges: true },
      v2Opts: { preserveExternalChanges: true },
      v1TqOpts: {},
      v2TqOpts: {},
      v1IdpOpts: {},
      v2IdpOpts: {},
      v1ScheduleOpts: {},
      v2ScheduleOpts: { schedule: "every 30 minutes" },
    };

    const result = await setOptsAndDeploy(opts);
    expect(result.stdout, "deploy result").to.match(/Deploy complete!/);

    const result2 = await setOptsAndDeploy(opts);
    expect(result2.stdout, "deploy result").to.match(/Skipped \(No changes detected\)/);
  });

  it("leaves existing options when unspecified and preserveExternalChanges is set", async () => {
    const opts: Opts = {
      v1Opts: { preserveExternalChanges: true },
      v2Opts: { preserveExternalChanges: true },
      v1TqOpts: {},
      v2TqOpts: {},
      v1IdpOpts: {},
      v2IdpOpts: {},
      v1ScheduleOpts: {},
      v2ScheduleOpts: { schedule: "every 30 minutes" },
    };

    const result = await setOptsAndDeploy(opts);
    expect(result.stdout, "deploy result").to.match(/Deploy complete!/);

    const endpoints = await listFns(RUN_ID);
    expect(Object.keys(endpoints).length, "number of deployed functions").to.equal(FNS_COUNT);

    for (const e of Object.values(endpoints)) {
      expect(e).to.include({
        availableMemoryMb: 128,
        timeoutSeconds: 42,
        maxInstances: 42,
      });
      if (e.platform === "gcfv2") {
        expect(e).to.include({
          cpu: 2,
          // EXCEPTION: concurrency
          // Firebase will aggressively set concurrency to 80 when the CPU setting allows for it
          // AND when the concurrency is NOT set on the source code.
          concurrency: 80,
        });
      }
      // BUGBUG: As implemented, Cloud Tasks update doesn't preserve existing setting. Instead, it overwrites the
      // existing setting with default settings.
      // if ("taskQueueTrigger" in e) {
      //   expect(e.taskQueueTrigger).to.deep.equal({
      //     retryConfig: {
      //       maxAttempts: 42,
      //       maxRetrySeconds: 42,
      //       maxBackoffSeconds: 42,
      //       maxDoublings: 42,
      //       minBackoffSeconds: 42,
      //     },
      //     rateLimits: {
      //       maxDispatchesPerSecond: 42,
      //       maxConcurrentDispatches: 42,
      //     },
      //   });
      // }
      if ("scheduleTrigger" in e) {
        expect(e.scheduleTrigger).to.deep.equal({
          retryConfig: {
            retryCount: 3,
            maxRetrySeconds: 42,
            maxBackoffSeconds: 42,
            maxDoublings: 42,
            minBackoffSeconds: 42,
          },
        });
      }
      if (e.secretEnvironmentVariables) {
        expect(e.secretEnvironmentVariables).to.have.length(1);
        expect(e.secretEnvironmentVariables[0]).to.include({
          key: "TOP",
          secret: "TOP",
        });
      }
    }
  });

  // BUGBUG: Setting options to null SHOULD restore their values to default, but this isn't correctly implemented in
  // the CLI.
  it.skip("restores default values when unspecified and preserveExternalChanges is not set", async () => {
    const opts: Opts = {
      v1Opts: {},
      v2Opts: {},
      v1TqOpts: {},
      v2TqOpts: {},
      v1IdpOpts: { blockingOptions: {} },
      v2IdpOpts: {},
      v1ScheduleOpts: {},
      v2ScheduleOpts: { schedule: "every 30 minutes" },
    };

    const result = await setOptsAndDeploy(opts);
    expect(result.stdout, "deploy result").to.match(/Deploy complete!/);

    const endpoints = await listFns(RUN_ID);
    expect(Object.keys(endpoints).length, "number of deployed functions").to.equal(FNS_COUNT);

    for (const e of Object.values(endpoints)) {
      expect(e).to.include({
        availableMemoryMb: 128,
        timeoutSeconds: 60,
        maxInstances: 0,
      });
      if (e.platform === "gcfv2") {
        expect(e).to.include({
          cpu: 1,
          concurrency: 80,
        });
      }
      if ("taskQueueTrigger" in e) {
        expect(e.taskQueueTrigger).to.deep.equal(tasks.DEFAULT_SETTINGS);
      }
      if ("scheduleTrigger" in e) {
        expect(e.scheduleTrigger).to.deep.equal({
          retryConfig: {
            retryCount: 3,
            maxRetrySeconds: 42,
            maxBackoffSeconds: 42,
            maxDoublings: 42,
            minBackoffSeconds: 42,
          },
        });
      }
      if (e.secretEnvironmentVariables) {
        expect(e.secretEnvironmentVariables).to.have.length(1);
        expect(e.secretEnvironmentVariables[0]).to.include({
          key: "TOP",
          secret: "TOP",
        });
      }
    }
  });
});
