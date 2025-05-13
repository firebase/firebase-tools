import { Emulators } from "./types";
import { EmulatorRegistry } from "./registry";
import { expect } from "chai";
import * as controller from "./controller";
import { FakeEmulator } from "./testing/fakeEmulator";
import { EmulatorOptions } from "./controller";
import { ValidatedConfig } from "../functions/projectConfig";
import { Config } from "../config";

describe("EmulatorController", () => {
  afterEach(async () => {
    await EmulatorRegistry.stopAll();
  });

  it("should start and stop an emulator", async () => {
    const name = Emulators.FUNCTIONS;

    expect(EmulatorRegistry.isRunning(name)).to.be.false;

    const fake = await FakeEmulator.create(name);
    await EmulatorRegistry.start(fake);

    expect(EmulatorRegistry.isRunning(name)).to.be.true;
    expect(EmulatorRegistry.getInfo(name)!.port).to.eql(fake.getInfo().port);
  });

  describe("prepareFunctionsBackends", () => {
    const baseOptions = {
      project: "demo-project",
      projectDir: "/path/to/project",
      config: new Config({}, { projectDir: "/path/to/project", cwd: "/path/to/project" }),
      nonInteractive: true,
    } as unknown as EmulatorOptions;

    const functionsConfig = [
      { source: "functions-a", codebase: "codebasea" },
      { source: "functions-b", codebase: "codebaseb" },
      { source: "functions-default" },
    ] as ValidatedConfig;

    it("should include all codebases without only flag", () => {
      const options = { ...baseOptions };
      const backends = controller.prepareFunctionsBackends(
        options,
        functionsConfig,
        "/project/dir",
      );
      expect(backends.length).to.equal(3);
      expect(backends.map((b) => b.codebase)).to.have.members([
        "codebasea",
        "codebaseb",
        undefined,
      ]);
    });

    it("should include only specified codebases", () => {
      const options = { ...baseOptions, only: "functions:codebasea" };
      const backends = controller.prepareFunctionsBackends(
        options,
        functionsConfig,
        "/project/dir",
      );
      expect(backends.length).to.equal(1);
      expect(backends[0].codebase).to.equal("codebasea");
    });

    it("should include all specified codebases", () => {
      const options = { ...baseOptions, only: "functions:codebasea,functions:codebaseb" };
      const backends = controller.prepareFunctionsBackends(
        options,
        functionsConfig,
        "/project/dir",
      );
      expect(backends.length).to.equal(2);
      expect(backends.map((b) => b.codebase)).to.have.members(["codebasea", "codebaseb"]);
    });

    it("should include default codebase", () => {
      const options = { ...baseOptions, only: "functions:default" };
      const backends = controller.prepareFunctionsBackends(
        options,
        functionsConfig,
        "/project/dir",
      );
      expect(backends.length).to.equal(1);
      expect(backends[0].codebase).to.equal(undefined);
    });

    it("should ignore non-functions filters", () => {
      const options = { ...baseOptions, only: "hosting,functions:codebasea" };
      const backends = controller.prepareFunctionsBackends(
        options,
        functionsConfig,
        "/project/dir",
      );
      expect(backends.length).to.equal(1);
      expect(backends[0].codebase).to.equal("codebasea");
    });

    it("should include all codebases given --only functions", () => {
      const options = { ...baseOptions, only: "functions" };
      const backends = controller.prepareFunctionsBackends(
        options,
        functionsConfig,
        "/project/dir",
      );
      expect(backends.length).to.equal(3);
    });
  });
});
