import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { sync as rimraf } from "rimraf";
import { expect } from "chai";

import * as env from "../../functions/env";

describe("functions/env", () => {
  describe("parse", () => {
    it("parses values with trailing spaces", () => {
      expect(env.parse("FOO=foo    ")).to.deep.equal({ envs: { FOO: "foo" }, errors: [] });
      expect(env.parse("FOO='foo'    ")).to.deep.equal({ envs: { FOO: "foo" }, errors: [] });
      expect(env.parse('FOO="foo"    ')).to.deep.equal({ envs: { FOO: "foo" }, errors: [] });
    });

    it("parses double quoted, multi-line values", () => {
      expect(env.parse('FOO="foo1\\nfoo2"\nBAR=bar')).to.deep.equal({
        envs: { FOO: "foo1\nfoo2", BAR: "bar" },
        errors: [],
      });
      expect(
        env.parse(`
FOO="foo1
foo2"
BAR=bar
`)
      ).to.deep.equal({ envs: { FOO: "foo1\nfoo2", BAR: "bar" }, errors: [] });
    });

    it("parses double quoted values with escape characters", () => {
      expect(env.parse('FOO="foo1\\"foo2"')).to.deep.equal({
        envs: { FOO: 'foo1"foo2' },
        errors: [],
      });
    });

    it("parses unquoted/ single quoted values with escape characters", () => {
      expect(env.parse("FOO=foo1\\'foo2")).to.deep.equal({
        envs: { FOO: "foo1\\'foo2" },
        errors: [],
      });
      expect(env.parse("FOO='foo1\\'foo2'")).to.deep.equal({
        envs: { FOO: "foo1\\'foo2" },
        errors: [],
      });
    });

    it("parses empty value", () => {
      expect(env.parse("FOO=")).to.deep.equal({
        envs: { FOO: "" },
        errors: [],
      });
    });

    it("parses keys with leading spaces", () => {
      expect(env.parse("        FOO=foo        ")).to.deep.equal({
        envs: { FOO: "foo" },
        errors: [],
      });
    });

    it("parses values with trailing spaces", () => {
      expect(env.parse("FOO=foo        ")).to.deep.equal({
        envs: { FOO: "foo" },
        errors: [],
      });
      expect(env.parse("FOO='foo '        ")).to.deep.equal({
        envs: { FOO: "foo " },
        errors: [],
      });
      expect(env.parse('FOO="foo "        ')).to.deep.equal({
        envs: { FOO: "foo " },
        errors: [],
      });
    });

    it("parses unquoted values with #", () => {
      expect(env.parse("FOO=foo#bar")).to.deep.equal({
        envs: { FOO: "foo" },
        errors: [],
      });
    });

    it("parses quoted values with #", () => {
      expect(env.parse("FOO='foo#bar'")).to.deep.equal({
        envs: { FOO: "foo#bar" },
        errors: [],
      });
      expect(env.parse('FOO="foo#bar"')).to.deep.equal({
        envs: { FOO: "foo#bar" },
        errors: [],
      });
    });

    it("ignores leading/trailing spaces before the separator", () => {
      expect(env.parse("FOO   =      foo")).to.deep.equal({
        envs: { FOO: "foo" },
        errors: [],
      });
      expect(env.parse('FOO   =  "foo"')).to.deep.equal({
        envs: { FOO: "foo" },
        errors: [],
      });
      expect(env.parse("FOO   =  'foo'")).to.deep.equal({
        envs: { FOO: "foo" },
        errors: [],
      });
    });

    it("ignores comments", () => {
      expect(
        env.parse(`
FOO=foo # comment
# line comment 1
# line comment 2
BAR=bar # another comment
`)
      ).to.deep.equal({
        envs: { FOO: "foo", BAR: "bar" },
        errors: [],
      });
    });

    it("ignores empty lines", () => {
      expect(
        env.parse(`
FOO=foo


BAR=bar

`)
      ).to.deep.equal({
        envs: { FOO: "foo", BAR: "bar" },
        errors: [],
      });
    });

    it("catches invalid lines", () => {
      expect(
        env.parse(`
BAR###
FOO=foo
// not a comment
=missing key
`)
      ).to.deep.equal({
        envs: { FOO: "foo" },
        errors: ["BAR###", "// not a comment", "=missing key"],
      });
    });
  });

  describe("validateKey", () => {
    it("accepts valid keys", () => {
      const keys = ["FOO", "ABC_EFG", "A1_B2"];
      keys.forEach((key) => {
        expect(() => {
          env.validateKey(key);
        }).not.to.throw();
      });
    });

    it("throws error given invalid keys", () => {
      const keys = ["", "1F", "B=C"];
      keys.forEach((key) => {
        expect(() => {
          env.validateKey(key);
        }).to.throw("must start with");
      });
    });

    it("throws error given reserved keys", () => {
      const keys = [
        "FIREBASE_CONFIG",
        "FUNCTION_TARGET",
        "FUNCTION_SIGNATURE_TYPE",
        "K_SERVICE",
        "K_REVISION",
        "PORT",
        "K_CONFIGURATION",
      ];
      keys.forEach((key) => {
        expect(() => {
          env.validateKey(key);
        }).to.throw("reserved for internal use");
      });
    });

    it("throws error given keys with a reserved prefix", () => {
      expect(() => {
        env.validateKey("X_GOOGLE_FOOBAR");
      }).to.throw("starts with a reserved prefix");

      expect(() => {
        env.validateKey("FIREBASE_FOOBAR");
      }).to.throw("starts with a reserved prefix");
    });
  });

  describe("load", () => {
    const createEnvFiles = (sourceDir: string, envs: Record<string, string>): void => {
      for (const [filename, data] of Object.entries(envs)) {
        fs.writeFileSync(path.join(sourceDir, filename), data);
      }
    };
    const projectInfo = { projectId: "my-project", projectAlias: "dev" };
    let tmpdir: string;

    beforeEach(() => {
      tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "test"));
    });

    afterEach(() => {
      rimraf(tmpdir);
      expect(() => {
        fs.statSync(tmpdir);
      }).to.throw;
    });

    it("loads nothing if .env files are missing", () => {
      expect(env.load({ ...projectInfo, functionsSource: tmpdir })).to.be.deep.equal({});
    });

    it("loads envs from .env file", () => {
      createEnvFiles(tmpdir, {
        ".env": "FOO=foo\nBAR=bar",
      });

      expect(env.load({ ...projectInfo, functionsSource: tmpdir })).to.be.deep.equal({
        FOO: "foo",
        BAR: "bar",
      });
    });

    it("loads envs from .env file, ignoring comments", () => {
      createEnvFiles(tmpdir, {
        ".env": "# THIS IS A COMMENT\nFOO=foo # inline comments\nBAR=bar",
      });

      expect(env.load({ ...projectInfo, functionsSource: tmpdir })).to.be.deep.equal({
        FOO: "foo",
        BAR: "bar",
      });
    });

    it("loads envs from .env.<project> file", () => {
      createEnvFiles(tmpdir, {
        [`.env.${projectInfo.projectId}`]: "FOO=foo\nBAR=bar",
      });

      expect(env.load({ ...projectInfo, functionsSource: tmpdir })).to.be.deep.equal({
        FOO: "foo",
        BAR: "bar",
      });
    });

    it("loads envs from .env.<alias> file", () => {
      createEnvFiles(tmpdir, {
        [`.env.${projectInfo.projectAlias}`]: "FOO=foo\nBAR=bar",
      });

      expect(env.load({ ...projectInfo, functionsSource: tmpdir })).to.be.deep.equal({
        FOO: "foo",
        BAR: "bar",
      });
    });

    it("loads envs, preferring ones from .env.<project>", () => {
      createEnvFiles(tmpdir, {
        ".env": "FOO=bad\nBAR=bar",
        [`.env.${projectInfo.projectId}`]: "FOO=good",
      });

      expect(env.load({ ...projectInfo, functionsSource: tmpdir })).to.be.deep.equal({
        FOO: "good",
        BAR: "bar",
      });
    });

    it("loads envs, preferring ones from .env.<alias>", () => {
      createEnvFiles(tmpdir, {
        ".env": "FOO=bad\nBAR=bar",
        [`.env.${projectInfo.projectAlias}`]: "FOO=good",
      });

      expect(env.load({ ...projectInfo, functionsSource: tmpdir })).to.be.deep.equal({
        FOO: "good",
        BAR: "bar",
      });
    });

    it("loads envs, preferring ones from .env.local if emulator", () => {
      createEnvFiles(tmpdir, {
        ".env": "FOO=foo\nBAR=bar",
        [`.env.${projectInfo.projectAlias}`]: "FOO=bad",
        ".env.local": "FOO=good",
      });

      expect(
        env.load({ ...projectInfo, functionsSource: tmpdir, isEmulator: true })
      ).to.be.deep.equal({
        FOO: "good",
        BAR: "bar",
      });
    });

    it("throws an error if both .env.<project> and .env.<alias> exists", () => {
      createEnvFiles(tmpdir, {
        ".env": "FOO=foo\nBAR=bar",
        [`.env.${projectInfo.projectId}`]: "FOO=not-foo",
        [`.env.${projectInfo.projectAlias}`]: "FOO=not-foo",
      });

      expect(() => {
        env.load({ ...projectInfo, functionsSource: tmpdir });
      }).to.throw("Can't have both");
    });

    it("throws an error .env file is invalid", () => {
      createEnvFiles(tmpdir, {
        ".env": "BAH: foo",
      });

      expect(() => {
        env.load({ ...projectInfo, functionsSource: tmpdir });
      }).to.throw("Failed to load");
    });

    it("throws an error .env file contains invalid keys", () => {
      createEnvFiles(tmpdir, {
        ".env": "FOO=foo",
        [`.env.${projectInfo.projectId}`]: "Foo=bad-key",
      });

      expect(() => {
        env.load({ ...projectInfo, functionsSource: tmpdir });
      }).to.throw("Failed to load");
    });

    it("throws an error .env file contains reserved keys", () => {
      createEnvFiles(tmpdir, {
        ".env": "FOO=foo\nPORT=100",
      });

      expect(() => {
        env.load({ ...projectInfo, functionsSource: tmpdir });
      }).to.throw("Failed to load");
    });
  });
});
