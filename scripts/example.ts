import { expect } from "chai";
import { join } from "path";

import firebase = require("../src");

const client: any = firebase;

describe("listProjects", () => {
  it("should list projects", async () => {
    const projects = await client.list();

    expect(projects).to.have.length.greaterThan(0);
  }).timeout(5 * 1e3); // This can take a while for reasons.
});

describe("deployHosting", () => {
  it("should deploy hosting", async () => {
    await client.deploy({
      project: process.env.FBTOOLS_TARGET_PROJECT,
      cwd: join(__dirname, "test-project"),
      only: "hosting",
    });
  }).timeout(10 * 1e3); // Deploying takes several steps.
});

describe("appsList", () => {
  it("should list apps configuration", async () => {
    const apps = await client.apps.list("web", { project: process.env.FBTOOLS_TARGET_PROJECT });

    expect(apps).to.have.length.greaterThan(0);
  });
});