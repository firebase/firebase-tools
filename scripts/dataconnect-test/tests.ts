import * as cli from "../functions-deploy-tests/cli";
import { expect } from "chai";

const FIREBASE_PROJECT = process.env.FBTOOLS_TARGET_PROJECT || "";
const expected = {
  serviceId: "integration-test",
  location: "us-central1",
  datasource: "CloudSQL Instance: dataconnect-test\nDatabase:dataconnect-test",
  schemaUpdateTime: "",
  connectors: [
    {
      connectorId: "connectorId",
      connectorLastUpdated: "",
    },
  ],
};

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

async function migrate() {
  return await cli.exec(
    "dataconnect:sql:migrate",
    FIREBASE_PROJECT,
    ["--force"],
    __dirname,
    /** quiet=*/ false,
    { FIREBASE_CLI_EXPERIMENTS: "dataconnect" },
  );
}

async function deploy() {
  return await cli.exec(
    "deploy",
    FIREBASE_PROJECT,
    ["--only", "dataconnect", "--force"],
    __dirname,
    /** quiet=*/ false,
    { FIREBASE_CLI_EXPERIMENTS: "dataconnect" },
  );
}

describe("firebase deploy", () => {
  before(() => {
    expect(FIREBASE_PROJECT).not.to.equal("", "No FBTOOLS_TARGET_PROJECT env var set.");
  });

  it("should deploy expected connectors and services", async () => {
    await migrate();
    await deploy();

    const result = await list();
    const out = JSON.parse(result.stdout);
    expect(out?.status).to.equal("success");
    expect(out?.result?.services?.length).to.gt(1);
    const service = out.result.services.find((s: any) => s.serviceId === "integration-test");
    // Don't need to check update times.
    expected.schemaUpdateTime = service["schemaUpdateTime"];
    expected.connectors[0].connectorLastUpdated = service["connectors"][0]["connectorLastUpdated"];
    expect(service).to.deep.equal(expected);
  }).timeout(2000000); // Insanely long timeout in case of cSQL deploy. Should almost never be hit.
});
