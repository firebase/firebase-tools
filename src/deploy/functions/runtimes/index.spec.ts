import { expect } from "chai";

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";

import { getRuntimeDelegate, DelegateContext } from ".";
import * as discovery from "./discovery";

describe("getRuntimeDelegate", () => {
  const yaml = `specVersion: v1alpha1\nendpoints:\n  hello:\n    httpsTrigger: {}\n    entryPoint: hello\n`;

  let detectFromPortStub: sinon.SinonStub;

  before(() => {
    detectFromPortStub = sinon.stub(discovery, "detectFromPort");
  });

  after(() => {
    sinon.restore();
  });

  const runtimes = [
    { runtime: "nodejs20", language: "nodejs" },
    { runtime: "python312", language: "python" },
  ] as const;

  for (const tc of runtimes) {
    describe(`${tc.language} (runtime=${tc.runtime})`, () => {
      it("validate throws when functions.yaml missing in safeMode", async () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fb-safe-rt-"));
        const ctx: DelegateContext = {
          projectId: "p",
          projectDir: "/project",
          sourceDir: tmp,
          runtime: tc.runtime,
          safeMode: true,
        };
        const delegate = await getRuntimeDelegate(ctx);
        try {
          await delegate.validate();
          expect.fail("expected validate() to throw for missing functions.yaml in safeMode");
        } catch (e) {
          expect(String((e as Error).message)).to.match(/functions\.yaml/i);
        }
      });

      it("discoverBuild uses manifest-only in safeMode", async () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fb-safe-rt-"));
        fs.writeFileSync(path.join(tmp, "functions.yaml"), yaml, "utf8");

        const ctx: DelegateContext = {
          projectId: "p",
          projectDir: "/project",
          sourceDir: tmp,
          runtime: tc.runtime,
          safeMode: true,
        };
        const delegate = await getRuntimeDelegate(ctx);
        const build = await delegate.discoverBuild({}, {});
        expect(build.endpoints).to.have.property("hello");
        expect(detectFromPortStub.called).to.equal(false);
      });
    });
  }
});
