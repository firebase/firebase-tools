import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { sync as rimraf } from "rimraf";
import { expect } from "chai";

import * as env from "../../functions/env";
import { FirebaseError } from "../../error";

describe("functions/env", () => {
  describe("parse", () => {
    const tests: { description: string; input: string; want: Record<string, string> }[] = [
      {
        description: "should parse values with trailing spaces",
        input: "FOO=foo        ",
        want: { FOO: "foo" },
      },
      {
        description: "should parse exported values",
        input: "export FOO=foo",
        want: { FOO: "foo" },
      },
      {
        description: "should parse values with trailing spaces (single quotes)",
        input: "FOO='foo'        ",
        want: { FOO: "foo" },
      },
      {
        description: "should parse values with trailing spaces (double quotes)",
        input: 'FOO="foo"        ',
        want: { FOO: "foo" },
      },
      {
        description: "should parse double quoted, multi-line values",
        input: `
FOO="foo1
foo2"
BAR=bar
`,
        want: { FOO: "foo1\nfoo2", BAR: "bar" },
      },
      {
        description: "should parse many double quoted values",
        input: 'FOO="foo"\nBAR="bar"',
        want: { FOO: "foo", BAR: "bar" },
      },
      {
        description: "should parse many single quoted values",
        input: "FOO='foo'\nBAR='bar'",
        want: { FOO: "foo", BAR: "bar" },
      },
      {
        description: "should parse mix of double and single quoted values",
        input: `FOO="foo"\nBAR='bar'`,
        want: { FOO: "foo", BAR: "bar" },
      },
      {
        description: "should parse double quoted with escaped newlines",
        input: 'FOO="foo1\\nfoo2"\nBAR=bar',
        want: { FOO: "foo1\nfoo2", BAR: "bar" },
      },
      {
        description: "should parse escape sequences in order, from start to end",
        input: `BAZ=baz
ONE_NEWLINE="foo1\\nfoo2"
ONE_BSLASH_AND_N="foo3\\\\nfoo4"
ONE_BSLASH_AND_NEWLINE="foo5\\\\\\nfoo6"
TWO_BSLASHES_AND_N="foo7\\\\\\\\nfoo8"
BAR=bar`,
        want: {
          BAZ: "baz",
          ONE_NEWLINE: "foo1\nfoo2",
          ONE_BSLASH_AND_N: "foo3\\nfoo4",
          ONE_BSLASH_AND_NEWLINE: "foo5\\\nfoo6",
          TWO_BSLASHES_AND_N: "foo7\\\\nfoo8",
          BAR: "bar",
        },
      },
      {
        description: "should parse double quoted with multiple escaped newlines",
        input: 'FOO="foo1\\nfoo2\\nfoo3"\nBAR=bar',
        want: { FOO: "foo1\nfoo2\nfoo3", BAR: "bar" },
      },
      {
        description: "should parse double quoted with multiple escaped horizontal tabs",
        input: 'FOO="foo1\\tfoo2\\tfoo3"\nBAR=bar',
        want: { FOO: "foo1\tfoo2\tfoo3", BAR: "bar" },
      },
      {
        description: "should parse double quoted with multiple escaped vertical tabs",
        input: 'FOO="foo1\\vfoo2\\vfoo3"\nBAR=bar',
        want: { FOO: "foo1\vfoo2\vfoo3", BAR: "bar" },
      },
      {
        description: "should parse double quoted with multiple escaped carriage returns",
        input: 'FOO="foo1\\rfoo2\\rfoo3"\nBAR=bar',
        want: { FOO: "foo1\rfoo2\rfoo3", BAR: "bar" },
      },
      {
        description: "should leave single quotes when double quoted",
        input: `FOO="'foo'"`,
        want: { FOO: "'foo'" },
      },
      {
        description: "should leave double quotes when single quoted",
        input: `FOO='"foo"'`,
        want: { FOO: '"foo"' },
      },
      {
        description: "should unescape escape characters for double quoted values",
        input: 'FOO="foo1\\"foo2"',
        want: { FOO: 'foo1"foo2' },
      },
      {
        description: "should leave escape characters intact for single quoted values",
        input: "FOO='foo1\\'foo2'",
        want: { FOO: "foo1\\'foo2" },
      },
      {
        description: "should leave escape characters intact for unquoted values",
        input: "FOO=foo1\\'foo2",
        want: { FOO: "foo1\\'foo2" },
      },
      {
        description: "should parse empty value",
        input: "FOO=",
        want: { FOO: "" },
      },
      {
        description: "should parse keys with leading spaces",
        input: "        FOO=foo        ",
        want: { FOO: "foo" },
      },
      {
        description: "should parse values with trailing spaces (unquoted)",
        input: "FOO=foo        ",
        want: { FOO: "foo" },
      },
      {
        description: "should parse values with trailing spaces (single quoted)",
        input: "FOO='foo '        ",
        want: { FOO: "foo " },
      },
      {
        description: "should parse values with trailing spaces (double quoted)",
        input: 'FOO="foo "        ',
        want: { FOO: "foo " },
      },
      {
        description: "should throw away unquoted values following #",
        input: "FOO=foo#bar",
        want: { FOO: "foo" },
      },
      {
        description: "should keep values following # in singqle quotes",
        input: "FOO='foo#bar'",
        want: { FOO: "foo#bar" },
      },
      {
        description: "should keep values following # in double quotes",
        input: 'FOO="foo#bar"',
        want: { FOO: "foo#bar" },
      },
      {
        description: "should ignore leading/trailing spaces before the separator (unquoted)",
        input: "FOO   =      foo",
        want: { FOO: "foo" },
      },
      {
        description: "should ignore leading/trailing spaces before the separator (single quotes)",
        input: "FOO   =  'foo'",
        want: { FOO: "foo" },
      },
      {
        description: "should ignore leading/trailing spaces before the separator (double quotes)",
        input: 'FOO   =  "foo"',
        want: { FOO: "foo" },
      },
      {
        description: "should handle empty values",
        input: `
FOO=
BAR= "blah"
`,
        want: { FOO: "", BAR: "blah" },
      },
      {
        description: "should handle quoted values after a newline",
        input: `
FOO=
"blah"
`,
        want: { FOO: "blah" },
      },
      {
        description: "should ignore comments",
        input: `
      FOO=foo # comment
      # line comment 1
      # line comment 2
      BAR=bar # another comment
      `,
        want: { FOO: "foo", BAR: "bar" },
      },
      {
        description: "should ignore empty lines",
        input: `
      FOO=foo

      BAR=bar

      `,
        want: { FOO: "foo", BAR: "bar" },
      },
    ];

    tests.forEach(({ description, input, want }) => {
      it(description, () => {
        const { envs, errors } = env.parse(input);
        expect(envs).to.deep.equal(want);
        expect(errors).to.be.empty;
      });
    });

    it("should catch invalid lines", () => {
      expect(
        env.parse(`
BAR###
FOO=foo
// not a comment
=missing key
`),
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

      expect(() => {
        env.validateKey("EXT_INSTANCE_ID");
      }).to.throw("starts with a reserved prefix");
    });
  });

  describe("writeUserEnvs", () => {
    const createEnvFiles = (sourceDir: string, envs: Record<string, string>): void => {
      for (const [filename, data] of Object.entries(envs)) {
        fs.writeFileSync(path.join(sourceDir, filename), data);
      }
    };
    let tmpdir: string;

    beforeEach(() => {
      tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "test"));
    });

    afterEach(() => {
      rimraf(tmpdir);
      expect(() => {
        fs.statSync(tmpdir);
      }).to.throw();
    });

    it("never affects the filesystem if the list of keys to write is empty", () => {
      env.writeUserEnvs(
        {},
        { projectId: "project", projectAlias: "alias", functionsSource: tmpdir },
      );
      env.writeUserEnvs(
        {},
        { projectId: "project", projectAlias: "alias", functionsSource: tmpdir, isEmulator: true },
      );
      expect(() => fs.statSync(path.join(tmpdir, ".env.alias"))).to.throw;
      expect(() => fs.statSync(path.join(tmpdir, ".env.project"))).to.throw;
      expect(() => fs.statSync(path.join(tmpdir, ".env.local"))).to.throw;
    });

    it("touches .env.projectId if it doesn't already exist", () => {
      env.writeUserEnvs({ FOO: "bar" }, { projectId: "project", functionsSource: tmpdir });
      expect(() => fs.statSync(path.join(tmpdir, ".env.alias"))).to.throw;
      expect(!!fs.statSync(path.join(tmpdir, ".env.project"))).to.be.true;
      expect(() => fs.statSync(path.join(tmpdir, ".env.local"))).to.throw;
    });

    it("touches .env.local if it doesn't already exist in emulator mode", () => {
      env.writeUserEnvs(
        { FOO: "bar" },
        { projectId: "project", functionsSource: tmpdir, isEmulator: true },
      );
      expect(() => fs.statSync(path.join(tmpdir, ".env.alias"))).to.throw;
      expect(() => fs.statSync(path.join(tmpdir, ".env.project"))).to.throw;
      expect(!!fs.statSync(path.join(tmpdir, ".env.local"))).to.be.true;
    });

    it("throws if asked to write a key that already exists in .env.projectId", () => {
      createEnvFiles(tmpdir, {
        [".env.project"]: "FOO=foo",
      });
      expect(() =>
        env.writeUserEnvs({ FOO: "bar" }, { projectId: "project", functionsSource: tmpdir }),
      ).to.throw(FirebaseError);
    });

    it("is fine writing a key that already exists in .env.projectId but not .env.local, in emulator mode", () => {
      createEnvFiles(tmpdir, {
        [".env.project"]: "FOO=foo",
      });
      env.writeUserEnvs(
        { FOO: "bar" },
        { projectId: "project", functionsSource: tmpdir, isEmulator: true },
      );
      expect(
        env.loadUserEnvs({
          projectId: "project",
          projectAlias: "alias",
          functionsSource: tmpdir,
          isEmulator: true,
        })["FOO"],
      ).to.equal("bar");
    });

    it("throws if asked to write a key that already exists in any .env", () => {
      createEnvFiles(tmpdir, {
        [".env"]: "FOO=bar",
      });
      expect(() =>
        env.writeUserEnvs(
          { FOO: "baz" },
          { projectId: "project", projectAlias: "alias", functionsSource: tmpdir },
        ),
      ).to.throw(FirebaseError);
    });

    it("is fine writing a key that already exists in any .env but not .env.local, in emulator mode", () => {
      createEnvFiles(tmpdir, {
        [".env"]: "FOO=bar",
      });
      env.writeUserEnvs(
        { FOO: "baz" },
        { projectId: "project", projectAlias: "alias", functionsSource: tmpdir, isEmulator: true },
      );
      expect(
        env.loadUserEnvs({
          projectId: "project",
          projectAlias: "alias",
          functionsSource: tmpdir,
          isEmulator: true,
        })["FOO"],
      ).to.equal("baz");
    });

    it("throws if asked to write a key that already exists in .env.local, in emulator mode", () => {
      createEnvFiles(tmpdir, {
        [".env.local"]: "ASDF=foo",
      });
      expect(() =>
        env.writeUserEnvs(
          { ASDF: "bar" },
          { projectId: "project", functionsSource: tmpdir, isEmulator: true },
        ),
      ).to.throw(FirebaseError);
    });

    it("throws if asked to write a key that fails key format validation", () => {
      expect(() =>
        env.writeUserEnvs(
          { lowercase: "bar" },
          { projectId: "project", projectAlias: "alias", functionsSource: tmpdir },
        ),
      ).to.throw(env.KeyValidationError);
      expect(() =>
        env.writeUserEnvs(
          { GCP_PROJECT: "bar" },
          { projectId: "project", projectAlias: "alias", functionsSource: tmpdir },
        ),
      ).to.throw(env.KeyValidationError);
      expect(() =>
        env.writeUserEnvs(
          { FIREBASE_KEY: "bar" },
          { projectId: "project", projectAlias: "alias", functionsSource: tmpdir },
        ),
      ).to.throw(env.KeyValidationError);
    });

    it("writes the specified key to a .env.projectId that it created", () => {
      env.writeUserEnvs(
        { FOO: "bar" },
        { projectId: "project", projectAlias: "alias", functionsSource: tmpdir },
      );
      expect(
        env.loadUserEnvs({ projectId: "project", projectAlias: "alias", functionsSource: tmpdir })[
          "FOO"
        ],
      ).to.equal("bar");
    });

    it("writes the specified key to a .env.projectId that already existed", () => {
      createEnvFiles(tmpdir, {
        [".env.project"]: "",
      });
      env.writeUserEnvs(
        { FOO: "bar" },
        { projectId: "project", projectAlias: "alias", functionsSource: tmpdir },
      );
      expect(
        env.loadUserEnvs({ projectId: "project", projectAlias: "alias", functionsSource: tmpdir })[
          "FOO"
        ],
      ).to.equal("bar");
    });

    it("writes multiple keys at once", () => {
      env.writeUserEnvs(
        { FOO: "foo", BAR: "bar" },
        { projectId: "project", projectAlias: "alias", functionsSource: tmpdir },
      );
      const envs = env.loadUserEnvs({
        projectId: "project",
        projectAlias: "alias",
        functionsSource: tmpdir,
      });
      expect(envs["FOO"]).to.equal("foo");
      expect(envs["BAR"]).to.equal("bar");
    });

    it("escapes special characters so that parse() can reverse them", () => {
      env.writeUserEnvs(
        {
          ESCAPES: "\n\r\t\v",
          WITH_SLASHES: "\n\\\r\\\t\\\v",
          QUOTES: "'\"'",
        },
        { projectId: "project", projectAlias: "alias", functionsSource: tmpdir },
      );
      const envs = env.loadUserEnvs({
        projectId: "project",
        projectAlias: "alias",
        functionsSource: tmpdir,
      });
      expect(envs["ESCAPES"]).to.equal("\n\r\t\v");
      expect(envs["WITH_SLASHES"]).to.equal("\n\\\r\\\t\\\v");
      expect(envs["QUOTES"]).to.equal("'\"'");
    });

    it("shouldn't write anything if any of the keys fails key format validation", () => {
      try {
        env.writeUserEnvs(
          { FOO: "bar", lowercase: "bar" },
          { projectId: "project", functionsSource: tmpdir },
        );
      } catch (err: any) {
        // no-op
      }
      expect(env.loadUserEnvs({ projectId: "project", functionsSource: tmpdir })["FOO"]).to.be
        .undefined;
    });
  });

  describe("loadUserEnvs", () => {
    const createEnvFiles = (sourceDir: string, envs: Record<string, string>): void => {
      for (const [filename, data] of Object.entries(envs)) {
        fs.writeFileSync(path.join(sourceDir, filename), data);
      }
    };
    const projectInfo: Omit<env.UserEnvsOpts, "functionsSource"> = {
      projectId: "my-project",
      projectAlias: "dev",
    };
    let tmpdir: string;

    beforeEach(() => {
      tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "test"));
    });

    afterEach(() => {
      rimraf(tmpdir);
      expect(() => {
        fs.statSync(tmpdir);
      }).to.throw();
    });

    it("loads nothing if .env files are missing", () => {
      expect(env.loadUserEnvs({ ...projectInfo, functionsSource: tmpdir })).to.be.deep.equal({});
    });

    it("loads envs from .env file", () => {
      createEnvFiles(tmpdir, {
        ".env": "FOO=foo\nBAR=bar",
      });

      expect(env.loadUserEnvs({ ...projectInfo, functionsSource: tmpdir })).to.be.deep.equal({
        FOO: "foo",
        BAR: "bar",
      });
    });

    it("loads envs from .env file, ignoring comments", () => {
      createEnvFiles(tmpdir, {
        ".env": "# THIS IS A COMMENT\nFOO=foo # inline comments\nBAR=bar",
      });

      expect(env.loadUserEnvs({ ...projectInfo, functionsSource: tmpdir })).to.be.deep.equal({
        FOO: "foo",
        BAR: "bar",
      });
    });

    it("loads envs from .env.<project> file", () => {
      createEnvFiles(tmpdir, {
        [`.env.${projectInfo.projectId}`]: "FOO=foo\nBAR=bar",
      });

      expect(env.loadUserEnvs({ ...projectInfo, functionsSource: tmpdir })).to.be.deep.equal({
        FOO: "foo",
        BAR: "bar",
      });
    });

    it("loads envs from .env.<alias> file", () => {
      createEnvFiles(tmpdir, {
        [`.env.${projectInfo.projectAlias}`]: "FOO=foo\nBAR=bar",
      });

      expect(env.loadUserEnvs({ ...projectInfo, functionsSource: tmpdir })).to.be.deep.equal({
        FOO: "foo",
        BAR: "bar",
      });
    });

    it("loads envs, preferring ones from .env.<project>", () => {
      createEnvFiles(tmpdir, {
        ".env": "FOO=bad\nBAR=bar",
        [`.env.${projectInfo.projectId}`]: "FOO=good",
      });

      expect(env.loadUserEnvs({ ...projectInfo, functionsSource: tmpdir })).to.be.deep.equal({
        FOO: "good",
        BAR: "bar",
      });
    });

    it("loads envs, preferring ones from .env.<project> for emulators too", () => {
      createEnvFiles(tmpdir, {
        ".env": "FOO=bad\nBAR=bar",
        [`.env.${projectInfo.projectId}`]: "FOO=good",
      });

      expect(
        env.loadUserEnvs({ ...projectInfo, functionsSource: tmpdir, isEmulator: true }),
      ).to.be.deep.equal({
        FOO: "good",
        BAR: "bar",
      });
    });

    it("loads envs, preferring ones from .env.<alias>", () => {
      createEnvFiles(tmpdir, {
        ".env": "FOO=bad\nBAR=bar",
        [`.env.${projectInfo.projectAlias}`]: "FOO=good",
      });

      expect(env.loadUserEnvs({ ...projectInfo, functionsSource: tmpdir })).to.be.deep.equal({
        FOO: "good",
        BAR: "bar",
      });
    });

    it("loads envs, preferring ones from .env.<alias> for emulators too", () => {
      createEnvFiles(tmpdir, {
        ".env": "FOO=bad\nBAR=bar",
        [`.env.${projectInfo.projectAlias}`]: "FOO=good",
      });

      expect(
        env.loadUserEnvs({ ...projectInfo, functionsSource: tmpdir, isEmulator: true }),
      ).to.be.deep.equal({
        FOO: "good",
        BAR: "bar",
      });
    });

    it("loads envs ignoring .env.local", () => {
      createEnvFiles(tmpdir, {
        ".env": "FOO=bad\nBAR=bar",
        [`.env.${projectInfo.projectId}`]: "FOO=good",
        ".env.local": "FOO=bad",
      });

      expect(env.loadUserEnvs({ ...projectInfo, functionsSource: tmpdir })).to.be.deep.equal({
        FOO: "good",
        BAR: "bar",
      });
    });

    it("loads envs, preferring .env.local for the emulator", () => {
      createEnvFiles(tmpdir, {
        ".env": "FOO=bad\nBAR=bar",
        [`.env.${projectInfo.projectId}`]: "FOO=another bad",
        ".env.local": "FOO=good",
      });

      expect(
        env.loadUserEnvs({ ...projectInfo, functionsSource: tmpdir, isEmulator: true }),
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
        env.loadUserEnvs({ ...projectInfo, functionsSource: tmpdir });
      }).to.throw("Can't have both");
    });

    it("throws an error .env file is invalid", () => {
      createEnvFiles(tmpdir, {
        ".env": "BAH: foo",
      });

      expect(() => {
        env.loadUserEnvs({ ...projectInfo, functionsSource: tmpdir });
      }).to.throw("Failed to load");
    });

    it("throws an error .env file contains invalid keys", () => {
      createEnvFiles(tmpdir, {
        ".env": "FOO=foo",
        [`.env.${projectInfo.projectId}`]: "Foo=bad-key",
      });

      expect(() => {
        env.loadUserEnvs({ ...projectInfo, functionsSource: tmpdir });
      }).to.throw("Failed to load");
    });

    it("throws an error .env file contains reserved keys", () => {
      createEnvFiles(tmpdir, {
        ".env": "FOO=foo\nPORT=100",
      });

      expect(() => {
        env.loadUserEnvs({ ...projectInfo, functionsSource: tmpdir });
      }).to.throw("Failed to load");
    });
  });
});
