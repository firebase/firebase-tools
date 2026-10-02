import { expect } from "chai";

import * as projectConfig from "./projectConfig";
import * as experiments from "../experiments";
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

    describe("kit", () => {
      beforeEach(() => {
        experiments.setEnabled("kits", true);
      });

      afterEach(() => {
        experiments.setEnabled("kits", null);
      });

      const VALID_KIT_CONFIG = {
        kit: "firestore-bigquery-export",
        sourcePackage: {
          name: "@firebase-function-kits/firestore-bigquery-export",
        },
        instances: {
          "firestore-bigquery-export": "config/bq-instance-1",
        },
        source: "functions/kits/bigquery-export",
        runtime: "nodejs22" as const,
      };

      it("fails validation if kits experiment is disabled", () => {
        experiments.setEnabled("kits", false);
        const config: projectConfig.NormalizedConfig = [VALID_KIT_CONFIG];
        expect(() => projectConfig.validate(config)).to.throw(
          FirebaseError,
          /Cannot use functions kits because the experiment .*kits.* is not enabled/,
        );
      });

      it("passes validation for a valid kit config", () => {
        const config: projectConfig.NormalizedConfig = [VALID_KIT_CONFIG];
        expect(projectConfig.validate(config)).to.deep.equal([VALID_KIT_CONFIG]);
      });

      it("fails validation if both kit and codebase are specified", () => {
        const config = [{ ...VALID_KIT_CONFIG, codebase: "my-codebase" }];
        // @ts-expect-error Should not specify both kit and codebase
        expect(() => projectConfig.validate(config)).to.throw(
          FirebaseError,
          /Cannot specify both 'kit' and 'codebase'/,
        );
      });

      it("fails validation if both kit and remoteSource are specified", () => {
        const config = [
          {
            ...VALID_KIT_CONFIG,
            remoteSource: { repository: "repo", ref: "main" },
          },
        ];
        // @ts-expect-error Should not specify both kit and remoteSource
        expect(() => projectConfig.validate(config)).to.throw(
          FirebaseError,
          /Cannot specify both 'kit' and 'remoteSource'/,
        );
      });

      it("fails validation if kit is missing source", () => {
        const config = [{ kit: "firestore-bigquery-export", instances: { inst1: "path" } }];
        // @ts-expect-error kit requires source
        expect(() => projectConfig.validate(config)).to.throw(
          FirebaseError,
          /Must specify 'source' in a functions kit config/,
        );
      });

      it("fails validation if kit is missing instances", () => {
        const config = [
          { kit: "firestore-bigquery-export", source: "functions/kits/bigquery-export" },
        ];
        // @ts-expect-error kit requires instances
        expect(() => projectConfig.validate(config)).to.throw(
          FirebaseError,
          /Must specify 'instances' as an object mapping instance IDs to configuration paths/,
        );
      });

      it("fails validation if instances is not an object", () => {
        const config = [
          {
            kit: "firestore-bigquery-export",
            source: "functions/kits/bigquery-export",
            instances: ["invalid-array-instance"],
          },
        ];
        // @ts-expect-error instances must be an object
        expect(() => projectConfig.validate(config)).to.throw(
          FirebaseError,
          /Must specify 'instances' as an object mapping instance IDs to configuration paths/,
        );
      });

      it("fails validation for duplicate kit names", () => {
        const config: projectConfig.NormalizedConfig = [
          VALID_KIT_CONFIG,
          { ...VALID_KIT_CONFIG, source: "functions/kits/bigquery-export-2" },
        ];
        expect(() => projectConfig.validate(config)).to.throw(
          FirebaseError,
          /functions.kit must be unique but 'firestore-bigquery-export' was used more than once/,
        );
      });

      it("fails validation if prefix is specified in a kit config", () => {
        const config = [{ ...VALID_KIT_CONFIG, prefix: "my-prefix" }];
        // @ts-expect-error Should not specify prefix in kit config
        expect(() => projectConfig.validate(config)).to.throw(
          FirebaseError,
          /Cannot specify 'prefix' in a functions kit config/,
        );
      });

      it("fails validation if kit instance IDs are duplicated across kits", () => {
        const config: projectConfig.NormalizedConfig = [
          VALID_KIT_CONFIG,
          {
            kit: "another-kit",
            source: "functions/kits/another",
            instances: {
              "firestore-bigquery-export": "config/bq-instance-2",
            },
          },
        ];
        expect(() => projectConfig.validate(config)).to.throw(
          FirebaseError,
          /functions kit instance ID must be unique across all kits, but 'firestore-bigquery-export' was used more than once/,
        );
      });

      it("fails validation given invalid kit name", () => {
        const config = [{ ...VALID_KIT_CONFIG, kit: "Invalid-Kit-Name!" }];
        expect(() => projectConfig.validate(config as any)).to.throw(
          FirebaseError,
          /Invalid kit name/,
        );
      });

      it("fails validation given long kit name (>40 chars)", () => {
        const config = [{ ...VALID_KIT_CONFIG, kit: "a".repeat(41) }];
        expect(() => projectConfig.validate(config as any)).to.throw(
          FirebaseError,
          /Invalid kit name/,
        );
      });

      it("fails validation given invalid instance ID format", () => {
        const config = [
          {
            ...VALID_KIT_CONFIG,
            instances: { "Invalid_Instance!": "config/path" },
          },
        ];
        expect(() => projectConfig.validate(config as any)).to.throw(
          FirebaseError,
          /Invalid kit instance ID/,
        );
      });

      it("fails validation if validateKitInstanceId is called with invalid ID format", () => {
        expect(() => projectConfig.validateKitInstanceId("Invalid_Instance!")).to.throw(
          FirebaseError,
          /Invalid kit instance ID/,
        );
        expect(() => projectConfig.validateKitInstanceId("-invalid")).to.throw(
          FirebaseError,
          /Invalid kit instance ID.*cannot start or end with a dash/,
        );
      });

      it("fails validation if validateAndAddKitInstances is called with duplicate instance IDs", () => {
        expect(() =>
          projectConfig.validateAndAddKitInstances(["inst1", "inst1"], new Set()),
        ).to.throw(
          FirebaseError,
          /functions kit instance ID must be unique across all kits, but 'inst1' was used more than once/,
        );
      });

      it("adds instance IDs to the provided set when validateAndAddKitInstances succeeds", () => {
        const set = new Set(["existing-inst"]);
        projectConfig.validateAndAddKitInstances(["inst1", "inst2"], set);
        expect(Array.from(set)).to.deep.equal(["existing-inst", "inst1", "inst2"]);
      });

      it("fails validation if instance ID starts with a dash", () => {
        const config = [
          {
            ...VALID_KIT_CONFIG,
            instances: { "-invalid-instance": "config/path" },
          },
        ];
        expect(() => projectConfig.validate(config as any)).to.throw(
          FirebaseError,
          /Invalid kit instance ID.*cannot start or end with a dash/,
        );
      });

      it("fails validation if instance ID ends with a dash", () => {
        const config = [
          {
            ...VALID_KIT_CONFIG,
            instances: { "invalid-instance-": "config/path" },
          },
        ];
        expect(() => projectConfig.validate(config as any)).to.throw(
          FirebaseError,
          /Invalid kit instance ID.*cannot start or end with a dash/,
        );
      });

      it("fails validation if kit instance IDs are duplicated across kits", () => {
        const config: projectConfig.NormalizedConfig = [
          VALID_KIT_CONFIG,
          {
            kit: "another-kit",
            source: "functions/kits/another",
            instances: {
              "firestore-bigquery-export": "config/bq-instance-2",
            },
          },
        ];
        expect(() => projectConfig.validate(config)).to.throw(
          FirebaseError,
          /functions kit instance ID must be unique across all kits, but 'firestore-bigquery-export' was used more than once/,
        );
      });

      it("fails validation if codebase name conflicts with a kit instance ID", () => {
        const config: projectConfig.NormalizedConfig = [
          { source: "functions", codebase: "bq-instance-1" },
          {
            kit: "my-kit",
            source: "functions/kits/my-kit",
            instances: {
              "bq-instance-1": "config/bq-instance-1",
            },
          },
        ];
        expect(() => projectConfig.validate(config)).to.throw(
          FirebaseError,
          /functions codebase name and kit instance ID must be mutually exclusive, but 'bq-instance-1' was used as both a codebase name and a kit instance ID/,
        );
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

  describe("isLocalConfig/isRemoteConfig/isKitConfig", () => {
    beforeEach(() => {
      experiments.setEnabled("kits", true);
    });

    afterEach(() => {
      experiments.setEnabled("kits", null);
    });

    const localCfg = { source: "local" };
    const remoteCfg = {
      remoteSource: { repository: "repo", ref: "main" },
      runtime: "nodejs20" as const,
    };
    const kitCfg = {
      kit: "my-kit",
      source: "kits/my-kit",
      instances: {
        "my-kit": "kits/my-kit",
      },
    };

    it("isLocalConfig narrow correctly", () => {
      const local = projectConfig.validate([localCfg])[0];
      const remote = projectConfig.validate([remoteCfg])[0];
      const kit = projectConfig.validate([kitCfg])[0];

      expect(projectConfig.isLocalConfig(local)).to.equal(true);
      expect(projectConfig.isRemoteConfig(local)).to.equal(false);
      expect(projectConfig.isKitConfig(local)).to.equal(false);

      expect(projectConfig.isLocalConfig(remote)).to.equal(false);
      expect(projectConfig.isRemoteConfig(remote)).to.equal(true);
      expect(projectConfig.isKitConfig(remote)).to.equal(false);

      expect(projectConfig.isLocalConfig(kit)).to.equal(false);
      expect(projectConfig.isRemoteConfig(kit)).to.equal(false);
      expect(projectConfig.isKitConfig(kit)).to.equal(true);
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

    it("returns instance configDir for kit configs when instanceId is provided", () => {
      experiments.setEnabled("kits", true);
      try {
        const cfg = projectConfig.validate([
          {
            kit: "my-kit",
            sourcePackage: { name: "@firebase-function-kits/my-kit" },
            source: "kit-source",
            instances: {
              "inst-alpha": "config/inst-alpha",
              "inst-beta": "config/inst-beta",
            },
          },
        ])[0];
        expect(projectConfig.resolveConfigDir(cfg, "inst-alpha")).to.equal("config/inst-alpha");
        expect(projectConfig.resolveConfigDir(cfg, "inst-beta")).to.equal("config/inst-beta");
        expect(projectConfig.resolveConfigDir(cfg)).to.be.undefined;
      } finally {
        experiments.setEnabled("kits", null);
      }
    });
  });

  describe("shouldUseRuntimeConfig", () => {
    const testCases = [
      {
        description:
          "returns true for local codebase without disallowLegacyRuntimeConfig (default)",
        config: { source: "functions" },
        expected: true,
      },
      {
        description: "returns true for local codebase with disallowLegacyRuntimeConfig=false",
        config: { source: "functions", disallowLegacyRuntimeConfig: false },
        expected: true,
      },
      {
        description: "returns false for local codebase with disallowLegacyRuntimeConfig=true",
        config: { source: "functions", disallowLegacyRuntimeConfig: true },
        expected: false,
      },
      {
        description: "returns false for remote source",
        config: {
          remoteSource: { repository: "repo", ref: "main" },
          runtime: "nodejs20",
        },
        expected: false,
      },
      {
        description: "returns false for remote source even with disallowLegacyRuntimeConfig=false",
        config: {
          remoteSource: { repository: "repo", ref: "main" },
          runtime: "nodejs20",
          disallowLegacyRuntimeConfig: false,
        },
        expected: false,
      },
    ];

    for (const tc of testCases) {
      it(tc.description, () => {
        const config = projectConfig.validate([tc.config as any])[0];
        expect(projectConfig.shouldUseRuntimeConfig(config)).to.equal(tc.expected);
      });
    }
  });

  describe("configForCodebase", () => {
    beforeEach(() => {
      experiments.setEnabled("kits", true);
    });

    afterEach(() => {
      experiments.setEnabled("kits", null);
    });

    it("returns config for standard codebase name", () => {
      const config = projectConfig.validate([{ codebase: "my-codebase", source: "functions" }]);
      expect(projectConfig.configForCodebase(config, "my-codebase")).to.deep.equal(config[0]);
    });

    it("returns config for kit instance ID", () => {
      const config = projectConfig.validate([
        {
          kit: "my-kit",
          source: "kits/my-kit",
          instances: { "instance-1": "cfg1", "instance-2": "cfg2" },
        },
      ]);
      expect(projectConfig.configForCodebase(config, "instance-1")).to.deep.equal(config[0]);
      expect(projectConfig.configForCodebase(config, "instance-2")).to.deep.equal(config[0]);
    });

    it("throws if codebase or instance ID is not found", () => {
      const config = projectConfig.validate([{ codebase: "my-codebase", source: "functions" }]);
      expect(() => projectConfig.configForCodebase(config, "unknown")).to.throw(
        FirebaseError,
        /No functions config found for codebase or kit instance unknown/,
      );
    });
  });
});
