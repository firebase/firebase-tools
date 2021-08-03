import { expect } from "chai";
import * as mockfs from "mock-fs";

import * as env from "../../functions/env";

describe("functions/env", () => {
  describe("parse", () => {
    const tests: { description: string; input: string; want: Record<string, string> }[] = [
      {
        description: "should parse values with trailing spaces",
        input: "FOO=foo        ",
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
        description: "should parse double quoted with escaped newlines",
        input: 'FOO="foo1\\nfoo2"\nBAR=bar',
        want: { FOO: "foo1\nfoo2", BAR: "bar" },
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
    const projectInfo = { projectId: "my-project", projectAlias: "dev" };
    const testdir = "/path/to/dir";

    afterEach(() => {
      mockfs.restore();
    });

    it("loads nothing if .env files are missing", () => {
      mockfs({ [testdir]: {} });
      expect(env.load({ ...projectInfo, functionsSource: testdir })).to.be.deep.equal({});
    });

    it("loads envs from .env file", () => {
      mockfs({
        [testdir]: {
          ".env": "FOO=foo\nBAR=bar",
        },
      });

      expect(env.load({ ...projectInfo, functionsSource: testdir })).to.be.deep.equal({
        FOO: "foo",
        BAR: "bar",
      });
    });

    it("loads envs from .env file, ignoring comments", () => {
      mockfs({
        [testdir]: {
          ".env": "# THIS IS A COMMENT\nFOO=foo # inline comments\nBAR=bar",
        },
      });

      expect(env.load({ ...projectInfo, functionsSource: testdir })).to.be.deep.equal({
        FOO: "foo",
        BAR: "bar",
      });
    });

    it("loads envs from .env.<project> file", () => {
      mockfs({
        [testdir]: {
          [`.env.${projectInfo.projectId}`]: "FOO=foo\nBAR=bar",
        },
      });

      expect(env.load({ ...projectInfo, functionsSource: testdir })).to.be.deep.equal({
        FOO: "foo",
        BAR: "bar",
      });
    });

    it("loads envs from .env.<alias> file", () => {
      mockfs({
        [testdir]: {
          [`.env.${projectInfo.projectAlias}`]: "FOO=foo\nBAR=bar",
        },
      });

      expect(env.load({ ...projectInfo, functionsSource: testdir })).to.be.deep.equal({
        FOO: "foo",
        BAR: "bar",
      });
    });

    it("loads envs, preferring ones from .env.<project>", () => {
      mockfs({
        [testdir]: {
          ".env": "FOO=bad\nBAR=bar",
          [`.env.${projectInfo.projectId}`]: "FOO=good",
        },
      });

      expect(env.load({ ...projectInfo, functionsSource: testdir })).to.be.deep.equal({
        FOO: "good",
        BAR: "bar",
      });
    });

    it("loads envs, preferring ones from .env.<alias>", () => {
      mockfs({
        [testdir]: {
          ".env": "FOO=bad\nBAR=bar",
          [`.env.${projectInfo.projectAlias}`]: "FOO=good",
        },
      });

      expect(env.load({ ...projectInfo, functionsSource: testdir })).to.be.deep.equal({
        FOO: "good",
        BAR: "bar",
      });
    });

    it("throws an error if both .env.<project> and .env.<alias> exists", () => {
      mockfs({
        [testdir]: {
          ".env": "FOO=foo\nBAR=bar",
          [`.env.${projectInfo.projectId}`]: "FOO=not-foo",
          [`.env.${projectInfo.projectAlias}`]: "FOO=not-foo",
        },
      });

      expect(() => {
        env.load({ ...projectInfo, functionsSource: testdir });
      }).to.throw("Can't have both");
    });

    it("throws an error .env file is invalid", () => {
      mockfs({
        [testdir]: {
          ".env": "BAH: foo",
        },
      });

      expect(() => {
        env.load({ ...projectInfo, functionsSource: testdir });
      }).to.throw("Failed to load");
    });

    it("throws an error .env file contains invalid keys", () => {
      mockfs({
        [testdir]: {
          ".env": "FOO=foo",
          [`.env.${projectInfo.projectId}`]: "Foo=bad-key",
        },
      });

      expect(() => {
        env.load({ ...projectInfo, functionsSource: testdir });
      }).to.throw("Failed to load");
    });

    it("throws an error .env file contains reserved keys", () => {
      mockfs({
        [testdir]: {
          ".env": "FOO=foo\nPORT=100",
        },
      });

      expect(() => {
        env.load({ ...projectInfo, functionsSource: testdir });
      }).to.throw("Failed to load");
    });
  });
});
