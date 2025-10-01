import { expect } from "chai";
import * as sinon from "sinon";
import { get_environment } from "./get_environment";
import * as projectUtils from "../../../projectUtils";
import { configstore } from "../../../configstore";
import * as appUtils from "../../../appUtils";
import * as auth from "../../../auth";
import { RC } from "../../../rc";
import { Config } from "../../../config";
import { McpContext } from "../../types";
import { FirebaseMcpServer } from "../..";

describe("get_environment tool", () => {
  let sandbox: sinon.SinonSandbox;
  let getAliasesStub: sinon.SinonStub;
  let configstoreGetStub: sinon.SinonStub;
  let detectAppsStub: sinon.SinonStub;
  let getAllAccountsStub: sinon.SinonStub;
  let server: FirebaseMcpServer;

  beforeEach(async () => {
    sandbox = sinon.createSandbox();
    getAliasesStub = sandbox.stub(projectUtils, "getAliases");
    configstoreGetStub = sandbox.stub(configstore, "get");
    detectAppsStub = sandbox.stub(appUtils, "detectApps");
    getAllAccountsStub = sandbox.stub(auth, "getAllAccounts");
    server = new FirebaseMcpServer({ projectRoot: "/test-dir" });
    server.cachedProjectDir = "/test-dir";
  });

  afterEach(() => {
    sandbox.restore();
  });

  const mockToolOptions = (
    projectId?: string,
    accountEmail?: string,
    projectFileExists = false,
    rcProjects: Record<string, string> = {},
    firebaseJsonContent = "",
  ): McpContext => {
    const rc = new RC(undefined, { projects: rcProjects });
    const config = new Config({}, { cwd: "/test-dir" });
    sandbox.stub(config, "projectFileExists").returns(projectFileExists);
    sandbox.stub(config, "path").returns("/test-dir/firebase.json");
    sandbox.stub(config, "readProjectFile").returns(firebaseJsonContent);

    // The tool fn receives McpContext, which expects projectId to be a string.
    // The tool implementation handles a falsy projectId, so we can default to "".
    return {
      projectId: projectId || "",
      host: server,
      accountEmail: accountEmail ? accountEmail : null,
      rc,
      config,
    };
  };

  it("should show minimal environment", async () => {
    getAliasesStub.returns([]);
    configstoreGetStub.withArgs("gemini").returns(false);
    detectAppsStub.resolves([]);
    getAllAccountsStub.returns([]);
    const options = mockToolOptions(undefined);

    const result = await get_environment.fn({}, options);

    const expectedOutput = `# Environment Information

Project Directory: /test-dir
Project Config Path: <NO CONFIG PRESENT>
Active Project ID: <NONE>
Gemini in Firebase Terms of Service: Not Accepted
Authenticated User: <NONE>
Detected App IDs: <NONE>
Available Project Aliases (format: '[alias]: [projectId]'): <NONE>
Available Accounts: <NONE>

No firebase.json file was found.
      
If this project does not use Firebase tools that require a firebase.json file, no action is necessary.

If this project uses Firebase tools that require a firebase.json file, the user will most likely want to:

a) Change the project directory using the 'firebase_update_environment' tool to select a directory with a 'firebase.json' file in it, or
b) Initialize a new Firebase project directory using the 'firebase_init' tool.

Confirm with the user before taking action.`;
    expect(result.content[0].text).to.equal(expectedOutput);
  });

  it("should show full environment", async () => {
    getAliasesStub.returns(["my-alias"]);
    configstoreGetStub.withArgs("gemini").returns(true);
    detectAppsStub.resolves([
      { platform: "WEB", directory: "web", appId: "web-app-id" },
      {
        platform: "ANDROID",
        directory: "android",
        appId: "android-app-id",
        bundleId: "com.foo.bar",
      },
    ]);
    getAllAccountsStub.returns([
      { user: { email: "test@example.com" } },
      { user: { email: "another@example.com" } },
    ]);
    const options = mockToolOptions(
      "test-project",
      "test@example.com",
      true,
      { "my-alias": "test-project", "other-alias": "other-project" },
      '{ "hosting": { "public": "public" } }',
    );

    const result = await get_environment.fn({}, options);
    const expectedOutput = `# Environment Information

Project Directory: /test-dir
Project Config Path: /test-dir/firebase.json
Active Project ID: test-project (alias: my-alias)
Gemini in Firebase Terms of Service: Accepted
Authenticated User: test@example.com
Detected App IDs: 

web-app-id: <UNKNOWN BUNDLE ID>
android-app-id: com.foo.bar

Available Project Aliases (format: '[alias]: [projectId]'): 

my-alias: test-project
other-alias: other-project

Available Accounts: 

- test@example.com
- another@example.com

firebase.json contents:

\`\`\`json
{ "hosting": { "public": "public" } }
\`\`\``;
    expect(result.content[0].text).to.equal(expectedOutput);
  });

  it("should handle a single alias", async () => {
    getAliasesStub.returns(["my-alias"]);
    detectAppsStub.resolves([]);
    getAllAccountsStub.returns([]);
    const options = mockToolOptions("test-project", "test@example.com", false, {
      "my-alias": "test-project",
    });

    const result = await get_environment.fn({}, options);

    const expectedOutput = `# Environment Information

Project Directory: /test-dir
Project Config Path: <NO CONFIG PRESENT>
Active Project ID: test-project (alias: my-alias)
Gemini in Firebase Terms of Service: Not Accepted
Authenticated User: test@example.com
Detected App IDs: <NONE>
Available Project Aliases (format: '[alias]: [projectId]'): 

my-alias: test-project

Available Accounts: <NONE>

No firebase.json file was found.
      
If this project does not use Firebase tools that require a firebase.json file, no action is necessary.

If this project uses Firebase tools that require a firebase.json file, the user will most likely want to:

a) Change the project directory using the 'firebase_update_environment' tool to select a directory with a 'firebase.json' file in it, or
b) Initialize a new Firebase project directory using the 'firebase_init' tool.

Confirm with the user before taking action.`;
    expect(result.content[0].text).to.equal(expectedOutput);
  });

  it("should handle multiple aliases", async () => {
    getAliasesStub.returns(["alias1", "alias2"]);
    detectAppsStub.resolves([]);
    getAllAccountsStub.returns([]);
    const options = mockToolOptions("test-project", "test@example.com", false, {
      alias1: "test-project",
      alias2: "test-project",
    });

    const result = await get_environment.fn({}, options);
    const expectedOutput = `# Environment Information

Project Directory: /test-dir
Project Config Path: <NO CONFIG PRESENT>
Active Project ID: test-project (alias: alias1,alias2)
Gemini in Firebase Terms of Service: Not Accepted
Authenticated User: test@example.com
Detected App IDs: <NONE>
Available Project Aliases (format: '[alias]: [projectId]'): 

alias1: test-project
alias2: test-project

Available Accounts: <NONE>

No firebase.json file was found.
      
If this project does not use Firebase tools that require a firebase.json file, no action is necessary.

If this project uses Firebase tools that require a firebase.json file, the user will most likely want to:

a) Change the project directory using the 'firebase_update_environment' tool to select a directory with a 'firebase.json' file in it, or
b) Initialize a new Firebase project directory using the 'firebase_init' tool.

Confirm with the user before taking action.`;
    expect(result.content[0].text).to.equal(expectedOutput);
  });

  it("should handle multiple accounts", async () => {
    getAliasesStub.returns([]);
    detectAppsStub.resolves([]);
    getAllAccountsStub.returns([
      { user: { email: "test@example.com" } },
      { user: { email: "another@example.com" } },
    ]);
    const options = mockToolOptions("test-project", "test@example.com");

    const result = await get_environment.fn({}, options);
    const expectedOutput = `# Environment Information

Project Directory: /test-dir
Project Config Path: <NO CONFIG PRESENT>
Active Project ID: test-project
Gemini in Firebase Terms of Service: Not Accepted
Authenticated User: test@example.com
Detected App IDs: <NONE>
Available Project Aliases (format: '[alias]: [projectId]'): <NONE>
Available Accounts: 

- test@example.com
- another@example.com

No firebase.json file was found.
      
If this project does not use Firebase tools that require a firebase.json file, no action is necessary.

If this project uses Firebase tools that require a firebase.json file, the user will most likely want to:

a) Change the project directory using the 'firebase_update_environment' tool to select a directory with a 'firebase.json' file in it, or
b) Initialize a new Firebase project directory using the 'firebase_init' tool.

Confirm with the user before taking action.`;
    expect(result.content[0].text).to.equal(expectedOutput);
  });

  it("should handle a single detected app", async () => {
    getAliasesStub.returns([]);
    detectAppsStub.resolves([{ platform: "WEB", directory: "web", appId: "web-app-id" }]);
    getAllAccountsStub.returns([]);
    const options = mockToolOptions();

    const result = await get_environment.fn({}, options);
    const expectedOutput = `# Environment Information

Project Directory: /test-dir
Project Config Path: <NO CONFIG PRESENT>
Active Project ID: <NONE>
Gemini in Firebase Terms of Service: Not Accepted
Authenticated User: <NONE>
Detected App IDs: 

web-app-id: <UNKNOWN BUNDLE ID>

Available Project Aliases (format: '[alias]: [projectId]'): <NONE>
Available Accounts: <NONE>

No firebase.json file was found.
      
If this project does not use Firebase tools that require a firebase.json file, no action is necessary.

If this project uses Firebase tools that require a firebase.json file, the user will most likely want to:

a) Change the project directory using the 'firebase_update_environment' tool to select a directory with a 'firebase.json' file in it, or
b) Initialize a new Firebase project directory using the 'firebase_init' tool.

Confirm with the user before taking action.`;
    expect(result.content[0].text).to.equal(expectedOutput);
  });

  it("should handle multiple detected apps with bundleId", async () => {
    getAliasesStub.returns([]);
    detectAppsStub.resolves([
      { platform: "WEB", directory: "web", appId: "web-app-id" },
      {
        platform: "ANDROID",
        directory: "android",
        appId: "android-app-id",
        bundleId: "com.foo.bar",
      },
    ]);
    getAllAccountsStub.returns([]);
    const options = mockToolOptions();

    const result = await get_environment.fn({}, options);
    const expectedOutput = `# Environment Information

Project Directory: /test-dir
Project Config Path: <NO CONFIG PRESENT>
Active Project ID: <NONE>
Gemini in Firebase Terms of Service: Not Accepted
Authenticated User: <NONE>
Detected App IDs: 

web-app-id: <UNKNOWN BUNDLE ID>
android-app-id: com.foo.bar

Available Project Aliases (format: '[alias]: [projectId]'): <NONE>
Available Accounts: <NONE>

No firebase.json file was found.
      
If this project does not use Firebase tools that require a firebase.json file, no action is necessary.

If this project uses Firebase tools that require a firebase.json file, the user will most likely want to:

a) Change the project directory using the 'firebase_update_environment' tool to select a directory with a 'firebase.json' file in it, or
b) Initialize a new Firebase project directory using the 'firebase_init' tool.

Confirm with the user before taking action.`;
    expect(result.content[0].text).to.equal(expectedOutput);
  });

  it("should show Gemini ToS not accepted", async () => {
    getAliasesStub.returns([]);
    configstoreGetStub.withArgs("gemini").returns(false);
    detectAppsStub.resolves([]);
    getAllAccountsStub.returns([]);
    const options = mockToolOptions();

    const result = await get_environment.fn({}, options);
    const expectedOutput = `# Environment Information

Project Directory: /test-dir
Project Config Path: <NO CONFIG PRESENT>
Active Project ID: <NONE>
Gemini in Firebase Terms of Service: Not Accepted
Authenticated User: <NONE>
Detected App IDs: <NONE>
Available Project Aliases (format: '[alias]: [projectId]'): <NONE>
Available Accounts: <NONE>

No firebase.json file was found.
      
If this project does not use Firebase tools that require a firebase.json file, no action is necessary.

If this project uses Firebase tools that require a firebase.json file, the user will most likely want to:

a) Change the project directory using the 'firebase_update_environment' tool to select a directory with a 'firebase.json' file in it, or
b) Initialize a new Firebase project directory using the 'firebase_init' tool.

Confirm with the user before taking action.`;
    expect(result.content[0].text).to.equal(expectedOutput);
  });
});
