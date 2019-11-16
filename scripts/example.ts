import { join } from "path";

import firebase = require("../src");

const client: any = firebase;

process.on("unhandledRejection", (err) => {
  console.error("unhandledRejection", err);
  process.exit(1);
});

async function listProjects() {
  console.log("Listing projects...");
  const projects = await client.list();
  if (!projects.length) {
    throw new Error("client.list() should have returned projects");
  }
  console.log("Listed projects.");
}

async function deployHosting() {
  console.log("Deploying hosting...");
  await client.deploy({
    project: process.env.FBTOOLS_TARGET_PROJECT,
    cwd: join(__dirname, "test-project"),
    only: "hosting",
  });
  console.log("Deployed hosting.");
}

async function appsList() {
  console.log("Getting app configuration...");
  const apps = await client.apps.list(
    "web",
    { project: process.env.FBTOOLS_TARGET_PROJECT });
  console.log("Got app configuration.");
}

async function main() {
  await listProjects();
  await deployHosting();
  await appsList();
}

main();
