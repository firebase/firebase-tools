import { expect } from "chai";
import * as path from "path";
import { RC, loadRC, RCData } from "../rc";

const fixturesDir = path.resolve(__dirname, "./fixtures");

const EMPTY_DATA: RCData = { projects: {}, targets: {} };

describe("RC", () => {
  describe(".load", () => {
    it("should load from nearest project directory", () => {
      const result = loadRC({ cwd: path.resolve(fixturesDir, "fbrc/conflict") });
      expect(result.projects.default).to.eq("top");
    });

    it("should be an empty object when not in project dir", () => {
      const result = loadRC({ cwd: __dirname });
      return expect(result.data).to.deep.eq(EMPTY_DATA);
    });

    it("should not throw up on invalid json", () => {
      const result = loadRC({ cwd: path.resolve(fixturesDir, "fbrc/invalid") });
      return expect(result.data).to.deep.eq(EMPTY_DATA);
    });

    it("should load from the right directory when --config is specified", () => {
      const result = loadRC({ cwd: __dirname, configPath: "./fixtures/fbrc/firebase.json" });
      expect(result.projects.default).to.eq("top");
    });
  });

  describe("instance methods", () => {
    let subject: RC;
    beforeEach(() => {
      subject = new RC();
    });

    describe("#addProjectAlias", () => {
      it("should set a value in projects.<alias>", () => {
        expect(subject.addProjectAlias("foo", "bar")).to.be.false;
        expect(subject.projects.foo).to.eq("bar");
      });
    });

    describe("#removeProjectAlias", () => {
      it("should remove an already set value in projects.<alias>", () => {
        subject.addProjectAlias("foo", "bar");
        expect(subject.projects.foo).to.eq("bar");
        expect(subject.removeProjectAlias("foo")).to.be.false;
        expect(subject.projects).to.deep.eq({});
      });
    });

    describe("#hasProjects", () => {
      it("should be true if project aliases are set, false if not", () => {
        expect(subject.hasProjects).to.be.false;
        subject.addProjectAlias("foo", "bar");
        expect(subject.hasProjects).to.be.true;
      });
    });

    describe("#allTargets", () => {
      it("should return all targets of all types for a project", () => {
        expect(subject.allTargets("foo")).to.deep.eq({});
        subject.applyTarget("foo", "storage", "bar", "baz");
        expect(subject.allTargets("foo")).to.deep.eq({ storage: { bar: ["baz"] } });
      });
    });

    describe("#targets", () => {
      it("should return all targets for specified project and type", () => {
        const data = { foo: ["bar"] };
        subject.applyTarget("myproject", "storage", "foo", "bar");
        expect(subject.targets("myproject", "storage")).to.deep.eq(data);
      });

      it("should return an empty object for missing data", () => {
        expect(subject.targets("foo", "storage")).to.deep.eq({});
      });
    });

    describe("#target", () => {
      it("should return all resources for a specified target", () => {
        subject.applyTarget("myproject", "storage", "foo", ["bar", "baz"]);
        expect(subject.target("myproject", "storage", "foo")).to.deep.eq(["bar", "baz"]);
      });

      it("should return an empty array if nothing is found", () => {
        expect(subject.target("myproject", "storage", "foo")).to.deep.eq([]);
      });
    });

    describe("#unsetTargetResource", () => {
      it("should remove a resource from a target", () => {
        subject.applyTarget("myproject", "storage", "foo", ["bar", "baz", "qux"]);
        subject.unsetTargetResource("myproject", "storage", "foo", "baz");
        expect(subject.target("myproject", "storage", "foo")).to.deep.eq(["bar", "qux"]);
      });

      it("should no-op if the resource is not in the target", () => {
        subject.applyTarget("myproject", "storage", "foo", ["bar", "baz", "qux"]);
        subject.unsetTargetResource("myproject", "storage", "foo", "derp");
        expect(subject.target("myproject", "storage", "foo")).to.deep.eq(["bar", "baz", "qux"]);
      });
    });

    describe("#applyTarget", () => {
      it("should error for an unrecognized target type", () => {
        expect(() => {
          subject.applyTarget("myproject", "fake", "foo", ["bar"]);
        }).to.throw("Unrecognized target type");
      });

      it("should coerce a string argument into an array", () => {
        subject.applyTarget("myproject", "storage", "foo", "bar");
        expect(subject.target("myproject", "storage", "foo")).to.deep.eq(["bar"]);
      });

      it("should add all resources to the specified target", () => {
        subject.applyTarget("myproject", "storage", "foo", "bar");
        subject.applyTarget("myproject", "storage", "foo", ["baz", "qux"]);
        expect(subject.target("myproject", "storage", "foo")).to.deep.eq(["bar", "baz", "qux"]);
      });

      it("should remove a resource from a different target", () => {
        subject.applyTarget("myproject", "storage", "foo", "bar");
        subject.applyTarget("myproject", "storage", "baz", ["bar", "qux"]);
        expect(subject.target("myproject", "storage", "foo")).to.deep.eq([]);
        expect(subject.target("myproject", "storage", "baz")).to.deep.eq(["bar", "qux"]);
      });

      it("should return a list of resources that changed targets", () => {
        subject.applyTarget("myproject", "storage", "foo", "bar");
        const result = subject.applyTarget("myproject", "storage", "baz", ["bar", "qux"]);
        expect(result).to.deep.eq([{ resource: "bar", target: "foo" }]);
      });
    });

    describe("#removeTarget", () => {
      it("should remove a the target for a specific resource and return its name", () => {
        subject.applyTarget("myproject", "storage", "foo", ["bar", "baz"]);
        expect(subject.removeTarget("myproject", "storage", "bar")).to.eq("foo");
        expect(subject.target("myproject", "storage", "foo")).to.deep.eq(["baz"]);
      });

      it("should return null if not present", () => {
        expect(subject.removeTarget("myproject", "storage", "fake")).to.be.null;
      });
    });

    describe("#clearTarget", () => {
      it("should clear an existing target by name and return true", () => {
        subject.applyTarget("myproject", "storage", "foo", ["bar", "baz"]);
        expect(subject.clearTarget("myproject", "storage", "foo")).to.be.true;
        expect(subject.target("myproject", "storage", "foo")).to.deep.eq([]);
      });

      it("should return false for a non-existent target", () => {
        expect(subject.clearTarget("myproject", "storage", "foo")).to.be.false;
      });
    });
  });
});
