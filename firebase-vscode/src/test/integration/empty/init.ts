import fs from "fs";
import path from "path";

import { FirebaseCommands } from "../../utils/page_objects/commands";
import { FirebaseSidebar } from "../../utils/page_objects/sidebar";
import {
  addTearDown,
  firebaseSuite,
  firebaseTest,
} from "../../utils/test_hooks";
import { mockProject } from "../../utils/projects";
import { mockUser } from "../../utils/user";
import { e2eSpy, getE2eSpyCalls } from "../mock";

addTearDown(() => {
  const emptyProjectPath = path.join(
    __dirname,
    "..",
    "..",
    "test_projects",
    "empty",
  );
  // Reset test_projects/empty to its original state.
  // This is necessary because the test modifies the project.
  fs.rmdirSync(emptyProjectPath, { recursive: true });
  // Recreate the empty project.
  fs.mkdirSync(emptyProjectPath);
});

firebaseSuite("Init Firebase", async function () {
  firebaseTest("calls init command in an empty project", async function () {
    const workbench = await browser.getWorkbench();

    const sidebar = new FirebaseSidebar(workbench);
    await sidebar.openExtensionSidebar();

    const commands = new FirebaseCommands();
    await commands.waitForUser();

    await mockUser({ email: "test@gmail.com" });
    await mockProject("test-project");

    await e2eSpy("init");

    await sidebar.runInStudioContext(async (firebase) => {
      await firebase.initFirebaseBtn.waitForExist();
      await firebase.initFirebaseBtn.waitForDisplayed();
      await firebase.initFirebaseBtn.click();
    });

    const args = await getE2eSpyCalls("init");
    console.log("args", args);

    if (args[0].includes("firebase init")) {
      upsertConfig();
    }

    await sidebar.runInStudioContext(async (studio) => {
      expect(await studio.startEmulatorsBtn.waitForDisplayed()).toBeTruthy();
    });
  });
});

async function upsertConfig() {
  console.log("Upserting config");

  // Upsert all config files.
  const emptyProjectPath = path.join(
    __dirname,
    "..",
    "..",
    "test_projects",
    "empty",
  );
  const firebaseJsonPath = path.join(emptyProjectPath, "firebase.json");
  const dataconnectYamlPath = path.join(
    emptyProjectPath,
    "dataconnect",
    "dataconnect.yaml",
  );
    const connectorYamlPath = path.join(
      emptyProjectPath,
      "dataconnect",
      "connector",
      "connector.yaml"
    );


  // Create the firebase.json file.
  fs.writeFileSync(
    firebaseJsonPath,
    JSON.stringify({
      dataconnect: {
        source: "dataconnect",
      },
    }),
  );

  // Create the dataconnect directory.
  fs.mkdirSync(path.join(emptyProjectPath, "dataconnect"));
  fs.mkdirSync(path.join(emptyProjectPath, "dataconnect", "connector"));
  // Create the dataconnect.yaml file.
  fs.writeFileSync(
    dataconnectYamlPath,
    `
specVersion: "v1"
serviceId: "s"
location: "asia-east1"
schema:
  source: "./schema"
  datasource:
    postgresql:
      database: "fdcdb"
      cloudSql:
        instanceId: "s-fdc"
      # schemaValidation: "COMPATIBLE"
connectorDirs: ["./connector"]
`.trim(),
    "utf8",
  );
  
  // create connector.yaml file
  fs.writeFileSync(connectorYamlPath, "");
}
