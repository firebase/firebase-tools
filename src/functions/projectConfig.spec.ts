import { expect } from "chai";

import * as projectConfig from "./projectConfig";
import { FirebaseError } from "../error";

const TEST_CONFIG_0 = { source: "foo" };

describe("projectConfig", () => {
  describe("normalize", () => {
    it("normalizes singleton config", () => {
      expect(projectConfig.normalize(TEST_CONFIG_0)).to.deep.equal([TEST_CONFIG_0]);
    });

    it("normalizes array config", () => {
      expect(projectConfig.normalize([TEST_CONFIG_0, TEST_CONFIG_0])).to.deep.equal([
        TEST_CONFIG_0,
        TEST_CONFIG_0,
      ]);
    });

    it("throws error if given empty config", () => {
      expect(() => projectConfig.normalize([])).to.throw(FirebaseError);
    });
  });

  describe("validate", () => {
    it("passes validation for simple config", () => {
      expect(projectConfig.validate([TEST_CONFIG_0])).to.deep.equal([
        { ...TEST_CONFIG_0, codebase: "default" },
      ]);
    });

    it("fails validation given config w/o source", () => {
      // @ts-expect-error invalid function config for test
      expect(() => projectConfig.validate([{ runtime: "nodejs22" }])).to.throw(
        FirebaseError,
        /codebase source must be specified/,
      );
    });

    it("fails validation given config w/ empty source", () => {
      expect(() => projectConfig.validate([{ source: "" }])).to.throw(
        FirebaseError,
        /codebase source must be specified/,
      );
    });

    it("passes validation for multi-instance config with same source", () => {
      const config: projectConfig.NormalizedConfig = [
        { source: "foo", codebase: "bar" },
        { source: "foo", codebase: "baz", prefix: "prefix-two" },
      ];
      expect(projectConfig.validate(config)).to.deep.equal(config);
    });

    it("passes validation for multi-instance config with one missing codebase", () => {
      const config: projectConfig.NormalizedConfig = [
        { source: "foo", codebase: "bar", prefix: "bar-prefix" },
        { source: "foo" },
      ];
      const expected = [
        { source: "foo", codebase: "bar", prefix: "bar-prefix" },
        { source: "foo", codebase: "default" },
      ];
      expect(projectConfig.validate(config)).to.deep.equal(expected);
    });

    it("fails validation for multi-instance config with missing codebase and a default codebase", () => {
      const config: projectConfig.NormalizedConfig = [
        { source: "foo", codebase: "default" },
        { source: "foo" },
      ];
      expect(() => projectConfig.validate(config)).to.throw(
        FirebaseError,
        /functions.codebase must be unique but 'default' was used more than once./,
      );
    });

    it("fails validation for multi-instance config with multiple missing codebases", () => {
      const config: projectConfig.NormalizedConfig = [{ source: "foo" }, { source: "foo" }];
      expect(() => projectConfig.validate(config)).to.throw(
        FirebaseError,
        /functions.codebase must be unique but 'default' was used more than once./,
      );
    });

    it("fails validation given codebase name with capital letters", () => {
      expect(() => projectConfig.validate([{ ...TEST_CONFIG_0, codebase: "ABCDE" }])).to.throw(
        FirebaseError,
        /Invalid codebase name/,
      );
    });

    it("fails validation given codebase name with invalid characters", () => {
      expect(() => projectConfig.validate([{ ...TEST_CONFIG_0, codebase: "abc.efg" }])).to.throw(
        FirebaseError,
        /Invalid codebase name/,
      );
    });

    it("fails validation given long codebase name", () => {
      expect(() =>
        projectConfig.validate([
          {
            ...TEST_CONFIG_0,
            codebase: "thisismorethan63characterslongxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
          },
        ]),
      ).to.throw(FirebaseError, /Invalid codebase name/);
    });

    it("fails validation given prefix with invalid characters", () => {
      expect(() => projectConfig.validate([{ ...TEST_CONFIG_0, prefix: "abc.efg" }])).to.throw(
        FirebaseError,
        /Invalid prefix/,
      );
    });

    it("fails validation given prefix with capital letters", () => {
      expect(() => projectConfig.validate([{ ...TEST_CONFIG_0, prefix: "ABC" }])).to.throw(
        FirebaseError,
        /Invalid prefix/,
      );
    });

    it("fails validation given prefix starting with a digit", () => {
      expect(() => projectConfig.validate([{ ...TEST_CONFIG_0, prefix: "1abc" }])).to.throw(
        FirebaseError,
        /Invalid prefix/,
      );
    });

    it("fails validation given a duplicate source/prefix pair", () => {
      const config: projectConfig.NormalizedConfig = [
        { source: "foo", codebase: "bar", prefix: "a" },
        { source: "foo", codebase: "baz", prefix: "a" },
      ];
      expect(() => projectConfig.validate(config)).to.throw(
        FirebaseError,
        /More than one functions config specifies the same source directory \('foo'\) and prefix \('a'\)/,
      );
    });

    it("fails validation for multi-instance config with same source and no prefixes", () => {
      const config: projectConfig.NormalizedConfig = [
        { source: "foo", codebase: "bar" },
        { source: "foo", codebase: "baz" },
      ];
      expect(() => projectConfig.validate(config)).to.throw(
        FirebaseError,
        /More than one functions config specifies the same source directory \('foo'\) and prefix \(''\)/,
      );
    });

    it("should allow a single function in an array to have a default codebase", () => {
      const config: projectConfig.NormalizedConfig = [{ source: "foo" }];
      const expected = [{ source: "foo", codebase: "default" }];
      expect(projectConfig.validate(config)).to.deep.equal(expected);
    });

    describe("remoteSource", () => {
      const VALID_REMOTE_CONFIG = {
        remoteSource: { repository: "repo", ref: "main" },
        runtime: "nodejs20",
      } as const;

      it("passes validation for a valid remoteSource config", () => {
        const config: projectConfig.NormalizedConfig = [VALID_REMOTE_CONFIG];
        const expected = [{ ...VALID_REMOTE_CONFIG, codebase: "default" }];
        expect(projectConfig.validate(config)).to.deep.equal(expected);
      });

      it("passes validation for a mixed local and remote source config", () => {
        const config: projectConfig.NormalizedConfig = [
          { source: "local/path", codebase: "local" },
          { ...VALID_REMOTE_CONFIG, codebase: "remote" },
        ];
        expect(projectConfig.validate(config)).to.deep.equal(config);
      });

      it("fails validation if both source and remoteSource are present", () => {
        const config = [{ ...VALID_REMOTE_CONFIG, source: "local" }];
        // @ts-expect-error Should not be able to specify both source and remoteSource
        expect(() => projectConfig.validate(config)).to.throw(
          FirebaseError,
          /Cannot specify both 'source' and 'remoteSource'/,
        );
      });

      it("fails validation if neither source nor remoteSource are present", () => {
        const config = [{ runtime: "nodejs20" }];
        // @ts-expect-error Must specify either source or remoteSource
        expect(() => projectConfig.validate(config)).to.throw(
          FirebaseError,
          /Must specify either 'source' or 'remoteSource'/,
        );
      });

      it("fails validation if remoteSource is missing runtime", () => {
        const config = [{ remoteSource: { repository: "repo", ref: "main" } }];
        // @ts-expect-error remoteSource requires runtime
        expect(() => projectConfig.validate(config)).to.throw(
          FirebaseError,
          /functions.runtime is required when using remoteSource/,
        );
      });

      it("fails validation if remoteSource is missing repository", () => {
        const config = [{ remoteSource: { ref: "main" }, runtime: "nodejs20" }];
        // @ts-expect-error remoteSource requires repository
        expect(() => projectConfig.validate(config)).to.throw(
          FirebaseError,
          /remoteSource requires 'repository' and 'ref'/,
        );
      });

      it("fails validation for duplicate remote source/prefix pairs", () => {
        const config: projectConfig.NormalizedConfig = [
          { ...VALID_REMOTE_CONFIG, codebase: "bar" },
          { ...VALID_REMOTE_CONFIG, codebase: "baz" },
        ];
        expect(() => projectConfig.validate(config)).to.throw(
          FirebaseError,
          /More than one functions config specifies the same remote source \('repo'\) and prefix \(''\)/,
        );
      });

      it("passes validation for different remote sources with the same prefix", () => {
        const config: projectConfig.NormalizedConfig = [
          { ...VALID_REMOTE_CONFIG, codebase: "bar" },
          {
            remoteSource: { repository: "repo2", ref: "main" },
            runtime: "nodejs20",
            codebase: "baz",
          },
        ];
        expect(projectConfig.validate(config)).to.deep.equal(config);
      });
    });
  });

  describe("normalizeAndValidate", () => {
    it("returns normalized config for singleton config", () => {
      expect(projectConfig.normalizeAndValidate(TEST_CONFIG_0)).to.deep.equal([
        { ...TEST_CONFIG_0, codebase: "default" },
      ]);
    });

    it("returns normalized config for multi-resource config", () => {
      expect(projectConfig.normalizeAndValidate([TEST_CONFIG_0])).to.deep.equal([
        { ...TEST_CONFIG_0, codebase: "default" },
      ]);
    });

    it("fails validation given singleton config w/o source", () => {
      // @ts-expect-error invalid function config for test
      expect(() => projectConfig.normalizeAndValidate({ runtime: "nodejs22" })).to.throw(
        FirebaseError,
        /codebase source must be specified/,
      );
    });

    it("fails validation given singleton config w empty source", () => {
      expect(() => projectConfig.normalizeAndValidate({ source: "" })).to.throw(
        FirebaseError,
        /codebase source must be specified/,
      );
    });

    it("fails validation given multi-resource config w/o source", () => {
      // @ts-expect-error invalid function config for test
      expect(() => projectConfig.normalizeAndValidate([{ runtime: "nodejs22" }])).to.throw(
        FirebaseError,
        /codebase source must be specified/,
      );
    });

    it("fails validation given config w/ duplicate codebase", () => {
      expect(() =>
        projectConfig.normalizeAndValidate([
          { ...TEST_CONFIG_0, codebase: "foo" },
          { ...TEST_CONFIG_0, codebase: "foo", source: "bar" },
        ]),
      ).to.throw(FirebaseError, /functions.codebase must be unique/);
    });
  });

  describe("isLocalConfig/isRemoteConfig", () => {
    const localCfg = { source: "local" };
    const remoteCfg = {
      remoteSource: { repository: "repo", ref: "main" },
      runtime: "nodejs20" as const,
    };
    it("isLocalConfig narrow correctly", () => {
      const local = projectConfig.validate([localCfg])[0];
      const remote = projectConfig.validate([remoteCfg])[0];

      expect(projectConfig.isLocalConfig(local)).to.equal(true);
      expect(projectConfig.isRemoteConfig(local)).to.equal(false);
      expect(projectConfig.isLocalConfig(remote)).to.equal(false);
      expect(projectConfig.isRemoteConfig(remote)).to.equal(true);
    });

    it("isRemoteConfig narrow correctly", () => {
      const local = projectConfig.validate([localCfg])[0];
      const remote = projectConfig.validate([remoteCfg])[0];

      expect(projectConfig.isRemoteConfig(local)).to.equal(false);
      expect(projectConfig.isRemoteConfig(remote)).to.equal(true);
    });
  });

  describe("requireLocal", () => {
    it("does not throw for local cfg and throws for remote", () => {
      const local = projectConfig.validate([{ source: "local" }])[0];
      expect(() => projectConfig.requireLocal(local)).to.not.throw();
    });

    it("throws for remote", () => {
      const remote = projectConfig.validate([
        { remoteSource: { repository: "repo", ref: "main" }, runtime: "nodejs20" },
      ])[0];
      expect(() => projectConfig.requireLocal(remote, "msg")).to.throw(FirebaseError, /msg/);
    });
  });

  describe("resolveConfigDir", () => {
    it("prefers configDir, falls back to source, and returns undefined for remote without configDir", () => {
      const cfg = projectConfig.validate([{ source: "functions", configDir: "cfg" }])[0];
      expect(projectConfig.resolveConfigDir(cfg)).to.equal("cfg");

      const remoteCfg = projectConfig.validate([
        {
          remoteSource: { repository: "repo", ref: "main" },
          runtime: "nodejs20",
          configDir: "cfg",
        },
      ])[0];
      expect(projectConfig.resolveConfigDir(remoteCfg)).to.equal("cfg");
    });

    it("falls back to source if configDir is missing", () => {
      const cfg = projectConfig.validate([{ source: "functions" }])[0];
      expect(projectConfig.resolveConfigDir(cfg)).to.equal("functions");
    });

    it("returns undefined for remote w/o configDir", () => {
      const cfg = projectConfig.validate([
        {
          remoteSource: { repository: "repo", ref: "main" },
          runtime: "nodejs20",
        },
      ])[0];
      expect(projectConfig.resolveConfigDir(cfg)).to.be.undefined;
    });
  });
});
