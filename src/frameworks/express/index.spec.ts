import * as childProcess from "child_process";
import { expect } from "chai";
import * as fs from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import * as sinon from "sinon";
import { ɵcodegenFunctionsDirectory } from "./index";

describe("express codegen", () => {
  const sandbox = sinon.createSandbox();

  afterEach(() => {
    sandbox.restore();
  });

  it("packs the app without shell interpolation", async () => {
    const root = await fs.mkdtemp(join(tmpdir(), "express root-"));
    const dest = await fs.mkdtemp(join(tmpdir(), "express dest-"));
    try {
      await fs.writeFile(
        join(root, "package.json"),
        JSON.stringify({ name: "test-express-app", main: "index.js" }),
      );
      await fs.writeFile(join(root, "index.js"), "exports.handle = () => {};\n");

      const packOutput = JSON.stringify([
        { name: "test-express-app", filename: "test-express-app-1.0.0.tgz" },
      ]);
      const execFileSyncStub = sandbox
        .stub(childProcess, "execFileSync")
        .returns(Buffer.from(packOutput));

      const result = await ɵcodegenFunctionsDirectory(root, dest);

      expect(execFileSyncStub).to.have.been.calledWith(
        "npm",
        ["pack", root, "--json"],
        sinon.match({ cwd: dest }),
      );
      expect(result.packageJson.dependencies?.["test-express-app"]).to.equal(
        "file:test-express-app-1.0.0.tgz",
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
      await fs.rm(dest, { recursive: true, force: true });
    }
  });
});
