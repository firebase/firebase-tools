import { expect } from "chai";
import { join } from "path";
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { v4 as uuidv4 } from "uuid";
import * as tmp from "tmp";

import firebase = require("../../src");

tmp.setGracefulCleanup();

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

describe("apps:list", () => {
  it("should be able to list apps with missing or undefined optional arguments", async () => {
    const noArgsApps = await client.apps.list({ project: process.env.FBTOOLS_TARGET_PROJECT });
    expect(noArgsApps).to.have.length.greaterThan(0);

    const undefinedArgsApps = await client.apps.list(undefined, {
      project: process.env.FBTOOLS_TARGET_PROJECT,
    });
    expect(undefinedArgsApps).to.have.length.greaterThan(0);

    const nullArgsApps = await client.apps.list(null, {
      project: process.env.FBTOOLS_TARGET_PROJECT,
    });
    expect(nullArgsApps).to.have.length.greaterThan(0);
  });

  it("should list apps configuration", async () => {
    const apps = await client.apps.list("web", { project: process.env.FBTOOLS_TARGET_PROJECT });

    expect(apps).to.have.length.greaterThan(0);
  });
});

describe("apps:sdkconfig", () => {
  it("should return the web app configuration", async () => {
    const opts = { project: process.env.FBTOOLS_TARGET_PROJECT };
    const apps = await client.apps.list("web", opts);
    expect(apps).to.have.length.greaterThan(0);
    const appID = apps[0].appId;

    const config = await client.apps.sdkconfig("web", appID, opts);

    expect(config.sdkConfig).to.exist;
    expect(config.sdkConfig.appId).to.equal(appID);
  });
});

describe("database:set|get|remove", () => {
  it("should be able to interact with the database", async () => {
    const opts = { project: process.env.FBTOOLS_TARGET_PROJECT };
    const path = `/${uuidv4()}`;
    const data = { foo: "bar" };

    await client.database.set(
      path,
      Object.assign({ data: JSON.stringify(data), force: true }, opts),
    );

    // Have to read to a file in order to get data.
    const file = tmp.fileSync();

    await client.database.get(path, Object.assign({ output: file.name }, opts));
    expect(JSON.parse(readFileSync(file.name).toString())).to.deep.equal(data);

    await client.database.remove(path, Object.assign({ force: true }, opts));

    await client.database.get(path, Object.assign({ output: file.name }, opts));
    expect(JSON.parse(readFileSync(file.name, "utf-8"))).to.equal(null);
  }).timeout(10 * 1e3);
});
