import * as sinon from "sinon";
import { expect } from "chai";

import { command } from "./functions-kits-install";
import { Config } from "../config";
import { FirebaseError } from "../error";
import * as spawn from "../init/spawn";

describe("functions:kits:install", () => {
  let sandbox: sinon.SinonSandbox;
  let configLoadStub: sinon.SinonStub;
  let wrapSpawnStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    configLoadStub = sandbox.stub(Config, "load");
    wrapSpawnStub = sandbox.stub(spawn, "wrapSpawn").resolves();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should throw an error if --npm_package is not provided", async () => {
    await expect(command.runner()({})).to.be.rejectedWith(
      FirebaseError,
      /Must specify an npm package/,
    );
  });

  it("should throw an error if not in a Firebase project directory", async () => {
    configLoadStub.returns(null);
    await expect(command.runner()({ npm_package: "my-package" })).to.be.rejectedWith(
      FirebaseError,
      /Must be run from a Firebase project directory/,
    );
  });

  it("should initialize codebase matching the package name and install dependencies", async () => {
    const mockConfig = {
      src: { functions: [] },
      defaults: {},
      projectDir: "/mock/project",
      set: sinon.spy(),
      writeProjectFile: sinon.spy(),
      askWriteProjectFile: sinon.stub().resolves(),
      readProjectFile: sinon.stub().callsFake((filepath: string) => {
        if (filepath.endsWith("package.json")) {
          // Simulate package.json after npm install --save @org/test-package
          return {
            dependencies: {
              "firebase-admin": "^13.6.0",
              "firebase-functions": "^7.0.0",
              "@org/test-package": "^1.0.0",
            },
          };
        }
        return {};
      }),
    };
    configLoadStub.returns(mockConfig);

    await command.runner()({ npm_package: "@org/test-package@^1.0.0" });

    expect(mockConfig.set.calledOnce).to.be.true;
    expect(mockConfig.set.firstCall.args[0]).to.equal("functions");
    expect(mockConfig.set.firstCall.args[1]).to.deep.equal([
      {
        source: "org-test-package100",
        codebase: "org-test-package100",
        predeploy: ['npm --prefix "$RESOURCE_DIR" run build'],
        disallowLegacyRuntimeConfig: true,
      },
    ]);
    expect(mockConfig.writeProjectFile.calledWith("firebase.json")).to.be.true;
    expect(
      mockConfig.askWriteProjectFile.calledWith(
        "org-test-package100/src/index.ts",
        'export * from "@org/test-package";\n',
      ),
    ).to.be.true;
    expect(wrapSpawnStub.calledThrice).to.be.true;
    expect(wrapSpawnStub.secondCall.args).to.deep.equal([
      "npm",
      ["install", "--save", "@org/test-package@^1.0.0"],
      "/mock/project/org-test-package100",
    ]);
    expect(wrapSpawnStub.thirdCall.args).to.deep.equal([
      "npm",
      ["run", "build"],
      "/mock/project/org-test-package100",
    ]);
  });
});
