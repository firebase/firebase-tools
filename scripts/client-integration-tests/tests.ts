import { expect } from "chai";
import { join } from "path";
import { writeFileSync, unlinkSync } from "fs";

import firebase = require("../../src");

// Typescript doesn't like calling functions on `firebase`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client: any = firebase;

describe("listProjects", () => {
  it("should list projects", async () => {
    const projects = await client.projects.list();

    expect(projects).to.have.length.greaterThan(0);
  }).timeout(5 * 1e3); // This can take a while for reasons.
});

describe("deployHosting", () => {
  const projectDirectory = join(__dirname, ".", "test-project");
  const firebasercFile = join(projectDirectory, ".firebaserc");

  before(() => {
    const config = {
      projects: {
        default: process.env.FBTOOLS_TARGET_PROJECT,
      },
      targets: {
        [process.env.FBTOOLS_TARGET_PROJECT as string]: {
          hosting: {
            "client-integration-site": [process.env.FBTOOLS_CLIENT_INTEGRATION_SITE],
          },
        },
      },
    };
    writeFileSync(firebasercFile, JSON.stringify(config));
  });

  after(() => {
    unlinkSync(firebasercFile);
  });

  it("should deploy hosting", async () => {
    await client.deploy({
      project: process.env.FBTOOLS_TARGET_PROJECT,
      cwd: projectDirectory,
      only: "hosting:client-integration-site",
    });
  }).timeout(10 * 1e3); // Deploying takes several steps.
});

describe("appsList", () => {
  it("should list apps configuration", async () => {
    const apps = await client.apps.list("web", { project: process.env.FBTOOLS_TARGET_PROJECT });

    expect(apps).to.have.length.greaterThan(0);
  });
});
