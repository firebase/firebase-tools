"use strict";

var chai = require("chai");
var expect = chai.expect;

var path = require("path");
var RC = require("../rc");

var fixturesDir = path.resolve(__dirname, "./fixtures");

describe("RC", function() {
  describe(".load", function() {
    it("should load from nearest project directory", function() {
      var result = RC.load({ cwd: path.resolve(fixturesDir, "fbrc/conflict") });
      expect(result.projects.default).to.eq("top");
    });

    it("should be an empty object when not in project dir", function() {
      var result = RC.load({ cwd: __dirname });
      return expect(result.data).to.deep.eq({});
    });

    it("should not throw up on invalid json", function() {
      var result = RC.load({ cwd: path.resolve(fixturesDir, "fbrc/invalid") });
      return expect(result.data).to.deep.eq({});
    });

    it("should load from the right directory when --config is specified", () => {
      const result = RC.load({ cwd: __dirname, configPath: "./fixtures/fbrc/firebase.json" });
      expect(result.projects.default).to.eq("top");
    });
  });

  describe("instance methods", function() {
    var subject;
    beforeEach(function() {
      subject = new RC();
    });

    describe("#addProjectAlias", function() {
      it("should set a value in projects.<alias>", function() {
        expect(subject.addProjectAlias("foo", "bar")).to.be.false;
        expect(subject.projects.foo).to.eq("bar");
      });
    });

    describe("#removeProjectAlias", function() {
      it("should remove an already set value in projects.<alias>", function() {
        subject.addProjectAlias("foo", "bar");
        expect(subject.projects.foo).to.eq("bar");
        expect(subject.removeProjectAlias("foo")).to.be.false;
        expect(subject.projects).to.deep.eq({});
      });
    });

    describe("#hasProjects", function() {
      it("should be true if project aliases are set, false if not", function() {
        expect(subject.hasProjects).to.be.false;
        subject.addProjectAlias("foo", "bar");
        expect(subject.hasProjects).to.be.true;
      });
    });

    describe("#targets", function() {
      it("should return all targets for specified project and type", function() {
        var data = { foo: ["bar"] };
        subject.set("targets", { myproject: { storage: data } });
        expect(subject.targets("myproject", "storage")).to.deep.eq(data);
      });

      it("should return an empty object for missing data", function() {
        expect(subject.targets("foo", "storage")).to.deep.eq({});
      });
    });

    describe("#target", function() {
      it("should return all resources for a specified target", function() {
        subject.set("targets", {
          myproject: { storage: { foo: ["bar", "baz"] } },
        });
        expect(subject.target("myproject", "storage", "foo")).to.deep.eq(["bar", "baz"]);
      });

      it("should return an empty array if nothing is found", function() {
        expect(subject.target("myproject", "storage", "foo")).to.deep.eq([]);
      });
    });

    describe("#unsetTargetResource", function() {
      it("should remove a resource from a target", function() {
        subject.set("targets", {
          myproject: { storage: { foo: ["bar", "baz", "qux"] } },
        });
        subject.unsetTargetResource("myproject", "storage", "foo", "baz");
        expect(subject.target("myproject", "storage", "foo")).to.deep.eq(["bar", "qux"]);
      });

      it("should no-op if the resource is not in the target", function() {
        subject.set("targets", {
          myproject: { storage: { foo: ["bar", "baz", "qux"] } },
        });
        subject.unsetTargetResource("myproject", "storage", "foo", "derp");
        expect(subject.target("myproject", "storage", "foo")).to.deep.eq(["bar", "baz", "qux"]);
      });
    });

    describe("#applyTarget", function() {
      it("should error for an unrecognized target type", function() {
        expect(function() {
          subject.applyTarget("myproject", "fake", "foo", ["bar"]);
        }).to.throw("Unrecognized target type");
      });

      it("should coerce a string argument into an array", function() {
        subject.applyTarget("myproject", "storage", "foo", "bar");
        expect(subject.target("myproject", "storage", "foo")).to.deep.eq(["bar"]);
      });

      it("should add all resources to the specified target", function() {
        subject.set("targets", { myproject: { storage: { foo: ["bar"] } } });
        subject.applyTarget("myproject", "storage", "foo", ["baz", "qux"]);
        expect(subject.target("myproject", "storage", "foo")).to.deep.eq(["bar", "baz", "qux"]);
      });

      it("should remove a resource from a different target", function() {
        subject.set("targets", { myproject: { storage: { foo: ["bar"] } } });
        subject.applyTarget("myproject", "storage", "baz", ["bar", "qux"]);
        expect(subject.target("myproject", "storage", "foo")).to.deep.eq([]);
        expect(subject.target("myproject", "storage", "baz")).to.deep.eq(["bar", "qux"]);
      });

      it("should return a list of resources that changed targets", function() {
        subject.set("targets", { myproject: { storage: { foo: ["bar"] } } });
        var result = subject.applyTarget("myproject", "storage", "baz", ["bar", "qux"]);
        expect(result).to.deep.eq([{ resource: "bar", target: "foo" }]);
      });
    });

    describe("#removeTarget", function() {
      it("should remove a the target for a specific resource and return its name", function() {
        subject.set("targets", {
          myproject: { storage: { foo: ["bar", "baz"] } },
        });
        expect(subject.removeTarget("myproject", "storage", "bar")).to.eq("foo");
        expect(subject.target("myproject", "storage", "foo")).to.deep.eq(["baz"]);
      });

      it("should return null if not present", function() {
        expect(subject.removeTarget("myproject", "storage", "fake")).to.be.null;
      });
    });

    describe("#clearTarget", function() {
      it("should clear an existing target by name and return true", function() {
        subject.set("targets", {
          myproject: { storage: { foo: ["bar", "baz"] } },
        });
        expect(subject.clearTarget("myproject", "storage", "foo")).to.be.true;
        expect(subject.target("myproject", "storage", "foo")).to.deep.eq([]);
      });

      it("should return false for a non-existent target", function() {
        expect(subject.clearTarget("myproject", "storage", "foo")).to.be.false;
      });
    });
  });
});
