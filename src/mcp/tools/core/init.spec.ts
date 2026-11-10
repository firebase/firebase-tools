import { expect } from "chai";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";
import { Config } from "../../../config";
import * as cloudbilling from "../../../gcp/cloudbilling";
import { FirebaseMcpServer } from "../../index";
import { RC } from "../../../rc";
import * as trackModule from "../../../track";
import { McpContext } from "../../types";
import { init } from "./init";

describe("init tool", () => {
  let sandbox: sinon.SinonSandbox;
  let tempDir: string;
  let server: FirebaseMcpServer;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(trackModule, "trackGA4").resolves();
    sandbox.stub(cloudbilling, "checkBillingEnabled").resolves(false);
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "firebase-mcp-init-test-"));
    server = new FirebaseMcpServer({ projectRoot: tempDir, activeFeatures: ["core"] });
    server.cachedProjectDir = tempDir;
    server.clientInfo = { name: "test-client" };
    sandbox.stub(server, "ready").resolves();
    sandbox.stub(server, "getProjectId").resolves("test-project");
    sandbox.stub(server, "getAuthenticatedUser").resolves("test@example.com");
  });

  afterEach(() => {
    sandbox.restore();
    fs.removeSync(tempDir);
  });

  function createContext(): McpContext {
    const options = { projectDir: tempDir, cwd: tempDir };
    const config = Config.load(options, true) || new Config({}, options);
    const rc = new RC(undefined, { projects: { default: "test-project" } });
    return {
      projectId: "test-project",
      host: server,
      accountEmail: "test@example.com",
      rc,
      config,
      firebaseCliCommand: "firebase",
      isBillingEnabled: true,
    };
  }

  describe("firestore", () => {
    it("writes default rules and indexes when files do not exist", async () => {
      const ctx = createContext();

      await init.fn(
        {
          features: {
            firestore: {
              database_id: "(default)",
              location_id: "nam5",
              rules_filename: "firestore.rules",
            },
          },
        },
        ctx,
      );

      const rulesPath = path.join(tempDir, "firestore.rules");
      const indexesPath = path.join(tempDir, "firestore.indexes.json");
      expect(fs.existsSync(rulesPath)).to.be.true;
      expect(fs.readFileSync(rulesPath, "utf8")).to.include("timestamp.date(");
      expect(fs.existsSync(indexesPath)).to.be.true;
      const firebaseJson = fs.readJsonSync(path.join(tempDir, "firebase.json")) as {
        firestore: { rules: string; indexes: string };
      };
      expect(firebaseJson.firestore.rules).to.equal("firestore.rules");
      expect(firebaseJson.firestore.indexes).to.equal("firestore.indexes.json");
    });

    it("preserves existing firestore.rules and firestore.indexes.json when rules are not specified", async () => {
      const existingRules =
        "rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /users/{userId} {\n      allow read, write: if request.auth != null && request.auth.uid == userId;\n    }\n  }\n}\n";
      const existingIndexes = JSON.stringify(
        {
          indexes: [{ collectionGroup: "posts", queryScope: "COLLECTION", fields: [] }],
          fieldOverrides: [],
        },
        null,
        2,
      );
      fs.writeFileSync(path.join(tempDir, "firestore.rules"), existingRules, "utf8");
      fs.writeFileSync(path.join(tempDir, "firestore.indexes.json"), existingIndexes, "utf8");

      const res = await server.mcpCallTool({
        method: "tools/call",
        params: {
          name: "firebase_init",
          arguments: { features: { firestore: {} } },
        },
      });

      expect(res.isError).to.not.be.true;
      expect(fs.readFileSync(path.join(tempDir, "firestore.rules"), "utf8")).to.equal(
        existingRules,
      );
      expect(fs.readFileSync(path.join(tempDir, "firestore.indexes.json"), "utf8")).to.equal(
        existingIndexes,
      );
      const firebaseJson = fs.readJsonSync(path.join(tempDir, "firebase.json")) as {
        firestore: { rules: string; indexes: string };
      };
      expect(firebaseJson.firestore.rules).to.equal("firestore.rules");
      expect(firebaseJson.firestore.indexes).to.equal("firestore.indexes.json");
    });

    it("overwrites existing firestore.rules when explicit rules content is provided", async () => {
      fs.writeFileSync(path.join(tempDir, "firestore.rules"), "old rules", "utf8");
      const explicitRules =
        "rules_version = '2';\nservice cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if false; } } }\n";

      const ctx = createContext();
      await init.fn(
        {
          features: {
            firestore: {
              database_id: "(default)",
              location_id: "nam5",
              rules_filename: "firestore.rules",
              rules: explicitRules,
            },
          },
        },
        ctx,
      );

      expect(fs.readFileSync(path.join(tempDir, "firestore.rules"), "utf8")).to.equal(
        explicitRules,
      );
    });
  });

  describe("database", () => {
    it("writes default database.rules.json when file does not exist", async () => {
      const ctx = createContext();

      await init.fn({ features: { database: { rules_filename: "database.rules.json" } } }, ctx);

      const rulesPath = path.join(tempDir, "database.rules.json");
      expect(fs.existsSync(rulesPath)).to.be.true;
      expect(fs.readFileSync(rulesPath, "utf8")).to.include('".read": "auth != null"');
    });

    it("preserves existing database.rules.json when rules are not specified", async () => {
      const existingRules = JSON.stringify(
        {
          rules: {
            users: { $uid: { ".read": "$uid === auth.uid", ".write": "$uid === auth.uid" } },
          },
        },
        null,
        2,
      );
      fs.writeFileSync(path.join(tempDir, "database.rules.json"), existingRules, "utf8");

      const res = await server.mcpCallTool({
        method: "tools/call",
        params: {
          name: "firebase_init",
          arguments: { features: { database: {} } },
        },
      });

      expect(res.isError).to.not.be.true;
      expect(fs.readFileSync(path.join(tempDir, "database.rules.json"), "utf8")).to.equal(
        existingRules,
      );
    });

    it("overwrites existing database.rules.json when explicit rules content is provided", async () => {
      fs.writeFileSync(path.join(tempDir, "database.rules.json"), '{"rules":{}}', "utf8");
      const explicitRules = '{"rules":{".read":false,".write":false}}';

      const ctx = createContext();
      await init.fn(
        {
          features: {
            database: {
              rules_filename: "database.rules.json",
              rules: explicitRules,
            },
          },
        },
        ctx,
      );

      expect(fs.readFileSync(path.join(tempDir, "database.rules.json"), "utf8")).to.equal(
        explicitRules,
      );
    });
  });

  describe("storage", () => {
    it("writes default storage.rules when file does not exist", async () => {
      const ctx = createContext();

      await init.fn({ features: { storage: { rules_filename: "storage.rules" } } }, ctx);

      const rulesPath = path.join(tempDir, "storage.rules");
      expect(fs.existsSync(rulesPath)).to.be.true;
      expect(fs.readFileSync(rulesPath, "utf8")).to.include("service firebase.storage");
      const firebaseJson = fs.readJsonSync(path.join(tempDir, "firebase.json")) as {
        storage: { rules: string };
      };
      expect(firebaseJson.storage.rules).to.equal("storage.rules");
    });

    it("preserves existing storage.rules when rules are not specified", async () => {
      const existingRules =
        "rules_version = '2';\nservice firebase.storage {\n  match /b/{bucket}/o {\n    match /users/{userId}/{allPaths=**} {\n      allow read, write: if request.auth != null && request.auth.uid == userId;\n    }\n  }\n}\n";
      fs.writeFileSync(path.join(tempDir, "storage.rules"), existingRules, "utf8");

      const res = await server.mcpCallTool({
        method: "tools/call",
        params: {
          name: "firebase_init",
          arguments: { features: { storage: {} } },
        },
      });

      expect(res.isError).to.not.be.true;
      expect(fs.readFileSync(path.join(tempDir, "storage.rules"), "utf8")).to.equal(existingRules);
    });

    it("overwrites existing storage.rules when explicit rules content is provided", async () => {
      fs.writeFileSync(path.join(tempDir, "storage.rules"), "old storage rules", "utf8");
      const explicitRules =
        "rules_version = '2';\nservice firebase.storage { match /b/{bucket}/o { match /{allPaths=**} { allow read, write: if false; } } }\n";

      const ctx = createContext();
      await init.fn(
        {
          features: {
            storage: {
              rules_filename: "storage.rules",
              rules: explicitRules,
            },
          },
        },
        ctx,
      );

      expect(fs.readFileSync(path.join(tempDir, "storage.rules"), "utf8")).to.equal(explicitRules);
    });
  });
});
