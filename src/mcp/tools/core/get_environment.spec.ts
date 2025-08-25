import { expect } from "chai";
import * as sinon from "sinon";
import { get_environment } from "./get_environment";
import * as projectUtils from "../../../projectUtils";
import * as auth from "../../../auth";
import { toContent } from "../../util";

describe("get_environment tool", () => {
  let getAliasesStub: sinon.SinonStub;
  let getAllAccountsStub: sinon.SinonStub;

  beforeEach(() => {
    getAliasesStub = sinon.stub(projectUtils, "getAliases");
    getAllAccountsStub = sinon.stub(auth, "getAllAccounts");
  });

  afterEach(() => {
    sinon.restore();
  });

  const baseRc = { projects: { default: "project-id" } };
  const baseConfig = {
    projectFileExists: () => true,
    path: (file: string) => `/path/to/${file}`,
    readProjectFile: () => '{ "hosting": { "public": "public" } }',
  };
  const baseHost = { cachedProjectRoot: "/path/to/project" };

  it("should return environment info with active project and user", async () => {
    const projectId = "active-project";
    const accountEmail = "user@example.com";
    getAliasesStub.returns(["default"]);
    getAllAccountsStub.returns([{ user: { email: accountEmail } }]);

    const result = await get_environment.fn(
      {},
      { projectId, accountEmail, rc: baseRc, config: baseConfig, host: baseHost },
    );

    const expectedContent = `# Environment Information

Project Directory: /path/to/project
Project Config Path: /path/to/firebase.json
Active Project ID: active-project (alias: default)
Authenticated User: user@example.com

# Available Project Aliases (format: '[alias]: [projectId]')

default: project-id

# Available Accounts:

- user@example.com

# firebase.json contents:

\`\`\`json
{ "hosting": { "public": "public" } }
\`\`\``;

    expect(result).to.deep.equal(toContent(expectedContent));
  });

  it("should return environment info with no active project or user", async () => {
    getAllAccountsStub.returns([]);
    const configWithoutFirebaseJson: any = { ...baseConfig, projectFileExists: () => false };

    const result = await get_environment.fn({}, {
      rc: { projects: {} } as any,
      config: configWithoutFirebaseJson,
      host: baseHost as any,
    } as any);

    const expectedContent = `# Environment Information

Project Directory: /path/to/project
Project Config Path: <NO CONFIG PRESENT>
Active Project ID: <NONE>
Authenticated User: <NONE>

# Available Project Aliases (format: '[alias]: [projectId]')

{}

# Available Accounts:

[]

# Empty Environment

It looks like the current directory is not initialized as a Firebase project. The user will most likely want to:

a) Change the project directory using the 'firebase_update_environment' tool to select a directory with a 'firebase.json' file in it, or
b) Initialize a new Firebase project directory using the 'firebase_init' tool.`;

    expect(result).to.deep.equal(toContent(expectedContent));
  });
});
