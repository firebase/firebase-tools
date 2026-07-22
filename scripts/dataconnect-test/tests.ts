import * as fs from "fs";
import * as path from "path";
import { expect } from "chai";

import * as cli from "../functions-deploy-tests/cli";
import { cases, Step } from "./cases";
import * as client from "../../src/dataconnect/client";
import { deleteDatabase } from "../../src/gcp/cloudsql/cloudsqladmin";
import { requireAuth } from "../../src/requireAuth";

const FIREBASE_PROJECT = process.env.FBTOOLS_TARGET_PROJECT || "";
const FIREBASE_DEBUG = process.env.FIREBASE_DEBUG || "";

function expected(
  serviceId: string,
  databaseId: string,
  schemaUpdateTime: string,
  connectorLastUpdated: string,
) {
  return {
    serviceId,
    location: "us-central1",
    datasource: `CloudSQL Instance: dataconnect-test\nDatabase: ${databaseId}`,
    schemaUpdateTime,
    connectors: [
      {
        connectorId: "connectorId",
        connectorLastUpdated,
      },
    ],
  };
}

async function cleanUpService(projectId: string, serviceId: string, databaseId: string) {
  await client.deleteService(`projects/${projectId}/locations/us-central1/services/${serviceId}`);
  await deleteDatabase(projectId, "dataconnect-test", databaseId);
}

async function list() {
  return await cli.exec(
    "dataconnect:services:list",
    FIREBASE_PROJECT,
    ["--json"],
    __dirname,
    /** quiet=*/ false,
    {
      FIREBASE_CLI_EXPERIMENTS: "dataconnect",
    },
  );
}

async function migrate(force: boolean) {
  const args = force ? ["--force"] : [];
  if (FIREBASE_DEBUG) {
    args.push("--debug");
  }
  return await cli.exec(
    "dataconnect:sql:migrate",
    FIREBASE_PROJECT,
    args,
    __dirname,
    /** quiet=*/ false,
    {
      FIREBASE_CLI_EXPERIMENTS: "dataconnect",
    },
  );
}

async function deploy(force: boolean) {
  const args = ["--only", "dataconnect"];
  if (force) {
    args.push("--force");
  }
  if (FIREBASE_DEBUG) {
    args.push("--debug");
  }
  return await cli.exec("deploy", FIREBASE_PROJECT, args, __dirname, /** quiet=*/ false, {
    FIREBASE_CLI_EXPERIMENTS: "dataconnect",
  });
}

function toPath(p: string) {
  return path.join(__dirname, p);
}

function getRandomString(length: number): string {
  const SUFFIX_CHAR_SET = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += SUFFIX_CHAR_SET.charAt(Math.floor(Math.random() * SUFFIX_CHAR_SET.length));
  }
  return result;
}
const fdcTest = toPath("fdc-test");

// Each test run should use a random serviceId and databaseId.
function newTestRun(): { serviceId: string; databaseId: string } {
  const id = getRandomString(6);
  const serviceId = `cli-e2e-service-${id}`;
  const databaseId = `cli-e2e-database-${id}`;

  const dataconnectYamlTemplate = fs.readFileSync(toPath("templates/dataconnect.yaml")).toString();
  const connectorYamlTemplate = fs.readFileSync(toPath("templates/connector.yaml")).toString();
  const subbedDataconnectYaml = dataconnectYamlTemplate
    .replace("__serviceId__", serviceId)
    .replace("__databaseId__", databaseId);
  if (!fs.existsSync(fdcTest)) {
    fs.mkdirSync(fdcTest);
  }
  if (!fs.existsSync(toPath("fdc-test/connector"))) {
    fs.mkdirSync(toPath("fdc-test/connector"));
  }
  if (!fs.existsSync(toPath("fdc-test/schema"))) {
    fs.mkdirSync(toPath("fdc-test/schema"));
  }
  fs.writeFileSync(toPath("fdc-test/dataconnect.yaml"), subbedDataconnectYaml, {
    mode: 420 /* 0o644 */,
  });
  fs.writeFileSync(toPath("fdc-test/connector/connector.yaml"), connectorYamlTemplate, {
    mode: 420 /* 0o644 */,
  });
  return { serviceId, databaseId };
}

function prepareStep(step: Step) {
  fs.writeFileSync(toPath("fdc-test/schema/schema.gql"), step.schemaGQL, { mode: 420 /* 0o644 */ });
  fs.writeFileSync(toPath("fdc-test/connector/connector.gql"), step.connectorGQL, {
    mode: 420 /* 0o644 */,
  });
}

describe("firebase deploy", () => {
  let serviceId: string;
  let databaseId: string;

  beforeEach(async function (this) {
    this.timeout(10000);
    expect(FIREBASE_PROJECT).not.to.equal("", "No FBTOOLS_TARGET_PROJECT env var set.");
    const info = newTestRun();
    serviceId = info.serviceId;
    databaseId = info.databaseId;
    await requireAuth({});
  });

  afterEach(async function (this) {
    this.timeout(10000);
    fs.rmSync(fdcTest, { recursive: true, force: true });
    await cleanUpService(FIREBASE_PROJECT, serviceId, databaseId);
  });

  for (const c of cases) {
    it(c.description, async () => {
      for (const step of c.sequence) {
        prepareStep(step);
        try {
          await deploy(false);
          await migrate(true);
          await deploy(true);
        } catch (err: any) {
          expect(err.expectErr, `Unexpected error: ${err.message}`).to.be.true;
        }
        expect(step.expectErr).to.be.false;
        const result = await list();
        const out = JSON.parse(result.stdout);
        expect(out?.status).to.equal("success");
        expect(out?.result?.services?.length).to.gte(1);
        const service = out.result.services.find((s: any) => s.serviceId === serviceId);
        // Don't need to check update times.
        expect(service).to.deep.equal(
          expected(
            serviceId,
            databaseId,
            service["schemaUpdateTime"],
            service["connectors"]?.[0]?.["connectorLastUpdated"],
          ),
        );
      }
    }).timeout(2000000); // Insanely long timeout in case of cSQL deploy. Should almost never be hit.
  }
});
