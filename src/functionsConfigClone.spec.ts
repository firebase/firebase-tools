import { expect } from "chai";
import * as sinon from "sinon";

import * as functionsConfig from "./functionsConfig";
import * as functionsConfigClone from "./functionsConfigClone";
import * as runtimeconfig from "./gcp/runtimeconfig";
import { FirebaseError } from "./error";

describe("functionsConfigClone", () => {
  const sandbox = sinon.createSandbox();
  let materializeAllStub: sinon.SinonStub;
  let setVariablesRecursiveStub: sinon.SinonStub;
  let varNameToIdsStub: sinon.SinonStub;
  let listStub: sinon.SinonStub;
  let getStub: sinon.SinonStub;
  let setStub: sinon.SinonStub;

  beforeEach(() => {
    materializeAllStub = sandbox.stub(functionsConfig, "materializeAll");
    setVariablesRecursiveStub = sandbox.stub(functionsConfig, "setVariablesRecursive");
    varNameToIdsStub = sandbox.stub(functionsConfig, "varNameToIds");
    listStub = sandbox.stub(runtimeconfig.variables, "list");
    getStub = sandbox.stub(runtimeconfig.variables, "get");
    setStub = sandbox.stub(runtimeconfig.variables, "set");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("functionsConfigClone", () => {
    it("should clone all config", async () => {
      materializeAllStub.resolves({
        foo: { bar: "baz" },
      });

      await functionsConfigClone.functionsConfigClone("source", "dest", undefined, []);

      expect(setVariablesRecursiveStub.callCount).to.equal(1);
      expect(setVariablesRecursiveStub.firstCall.args).to.deep.equal([
        "dest",
        "foo",
        "",
        { bar: "baz" },
      ]);
    });

    it("should not clone firebase config", async () => {
      materializeAllStub.resolves({
        foo: { bar: "baz" },
        firebase: { bar: "baz" },
      });

      await functionsConfigClone.functionsConfigClone("source", "dest", undefined, []);

      expect(setVariablesRecursiveStub.callCount).to.equal(1);
      expect(setVariablesRecursiveStub.firstCall.args).to.deep.equal([
        "dest",
        "foo",
        "",
        { bar: "baz" },
      ]);
    });

    it("should clone all config except for specified keys", async () => {
      materializeAllStub.resolves({
        foo: { bar: "baz" },
        qux: { bar: "baz" },
      });

      await functionsConfigClone.functionsConfigClone("source", "dest", undefined, ["qux"]);

      expect(setVariablesRecursiveStub.callCount).to.equal(1);
      expect(setVariablesRecursiveStub.firstCall.args).to.deep.equal([
        "dest",
        "foo",
        "",
        { bar: "baz" },
      ]);
    });

    it("should clone only specified config", async () => {
      const varName = "projects/source/configs/foo/variables/bar";
      listStub.resolves([{ name: varName }]);
      varNameToIdsStub.withArgs(varName).returns({ config: "foo", variable: "bar" });
      getStub.withArgs(varName).resolves({ name: varName, text: "baz" });

      await functionsConfigClone.functionsConfigClone("source", "dest", ["foo"]);

      expect(setStub.callCount).to.equal(1);
      expect(setStub.firstCall.args).to.deep.equal(["dest", "foo", "bar", "baz"]);
    });

    it("should clone only specified variable", async () => {
      const varName = "projects/source/configs/foo/variables/bar";
      listStub.resolves([{ name: varName }]);
      varNameToIdsStub.withArgs(varName).returns({ config: "foo", variable: "bar" });
      getStub.withArgs(varName).resolves({ name: varName, text: "baz" });

      await functionsConfigClone.functionsConfigClone("source", "dest", ["foo.bar"]);

      expect(setStub.callCount).to.equal(1);
      expect(setStub.firstCall.args).to.deep.equal(["dest", "foo", "bar", "baz"]);
    });

    it("should clone only specified variable with prefix", async () => {
      const var1Name = "projects/source/configs/foo/variables/bar/qux";
      const var2Name = "projects/source/configs/foo/variables/baz/qux";
      listStub.resolves([{ name: var1Name }, { name: var2Name }]);
      varNameToIdsStub.withArgs(var1Name).returns({ config: "foo", variable: "bar/qux" });
      varNameToIdsStub.withArgs(var2Name).returns({ config: "foo", variable: "baz/qux" });
      getStub.withArgs(var1Name).resolves({ name: var1Name, text: "one" });
      getStub.withArgs(var2Name).resolves({ name: var2Name, text: "two" });

      await functionsConfigClone.functionsConfigClone("source", "dest", ["foo.bar"]);

      expect(setStub.callCount).to.equal(1);
      expect(setStub.firstCall.args).to.deep.equal(["dest", "foo", "bar/qux", "one"]);
    });

    it("should throw an error if a reserved namespace is provided", async () => {
      await expect(
        functionsConfigClone.functionsConfigClone("source", "dest", ["firebase"]),
      ).to.be.rejectedWith(FirebaseError, "Cannot clone reserved namespace " + "firebase");
    });
  });
});
