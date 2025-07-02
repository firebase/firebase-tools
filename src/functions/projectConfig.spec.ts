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
      expect(projectConfig.validate([TEST_CONFIG_0])).to.deep.equal([TEST_CONFIG_0]);
    });

    it("fails validation given config w/o source", () => {
      expect(() => projectConfig.validate([{ runtime: "nodejs22" }])).to.throw(
        FirebaseError,
        /codebase source or remoteSource must be specified/,
      );
    });

    it("fails validation given config w/ empty source", () => {
      expect(() => projectConfig.validate([{ source: "" }])).to.throw(
        FirebaseError,
        /codebase source or remoteSource must be specified/,
      );
    });

    it("fails validation given config w/ duplicate source", () => {
      expect(() =>
        projectConfig.validate([TEST_CONFIG_0, { ...TEST_CONFIG_0, codebase: "unique-codebase" }]),
      ).to.throw(FirebaseError, /source must be unique/);
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
  });

  describe("normalizeAndValidate", () => {
    it("returns normalized config for singleton config", () => {
      expect(projectConfig.normalizeAndValidate(TEST_CONFIG_0)).to.deep.equal([TEST_CONFIG_0]);
    });

    it("returns normalized config for multi-resource config", () => {
      expect(projectConfig.normalizeAndValidate([TEST_CONFIG_0])).to.deep.equal([TEST_CONFIG_0]);
    });

    it("fails validation given singleton config w/o source", () => {
      expect(() => projectConfig.normalizeAndValidate({ runtime: "nodejs22" })).to.throw(
        FirebaseError,
        /codebase source or remoteSource must be specified/,
      );
    });

    it("fails validation given singleton config w empty source", () => {
      expect(() => projectConfig.normalizeAndValidate({ source: "" })).to.throw(
        FirebaseError,
        /codebase source or remoteSource must be specified/,
      );
    });

    it("fails validation given multi-resource config w/o source", () => {
      expect(() => projectConfig.normalizeAndValidate([{ runtime: "nodejs22" }])).to.throw(
        FirebaseError,
        /codebase source or remoteSource must be specified/,
      );
    });

    it("fails validation given config w/ duplicate source", () => {
      expect(() => projectConfig.normalizeAndValidate([TEST_CONFIG_0, TEST_CONFIG_0])).to.throw(
        FirebaseError,
        /functions.source must be unique/,
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

  describe("validateRemoteSource", () => {
    it("should accept valid GitHub HTTPS URLs", () => {
      expect(() => 
        projectConfig.validateRemoteSource({ repo: "https://github.com/firebase/functions-samples", ref: "main" })
      ).not.to.throw();
      
      expect(() => 
        projectConfig.validateRemoteSource({ repo: "https://github.com/user-name/repo_name", ref: "v1.0.0" })
      ).not.to.throw();
      
      expect(() => 
        projectConfig.validateRemoteSource({ repo: "https://github.com/org/repo", ref: "abc123def456" })
      ).not.to.throw();
    });

    it("should accept valid paths", () => {
      expect(() => 
        projectConfig.validateRemoteSource({ 
          repo: "https://github.com/org/repo", 
          ref: "main",
          path: "functions/api"
        })
      ).not.to.throw();
      
      expect(() => 
        projectConfig.validateRemoteSource({ 
          repo: "https://github.com/org/repo", 
          ref: "main",
          path: "src/functions/image-processor"
        })
      ).not.to.throw();
    });

    it("should reject invalid paths", () => {
      expect(() => 
        projectConfig.validateRemoteSource({ 
          repo: "https://github.com/org/repo", 
          ref: "main",
          path: "/absolute/path"
        })
      ).to.throw(FirebaseError, /Path should be relative/);
      
      expect(() => 
        projectConfig.validateRemoteSource({ 
          repo: "https://github.com/org/repo", 
          ref: "main",
          path: "../parent"
        })
      ).to.throw(FirebaseError, /cannot contain '\.\.'/);
      
      expect(() => 
        projectConfig.validateRemoteSource({ 
          repo: "https://github.com/org/repo", 
          ref: "main",
          path: "functions/"
        })
      ).to.throw(FirebaseError, /should not end with/);
    });

    it("should reject invalid GitHub URLs", () => {
      expect(() => 
        projectConfig.validateRemoteSource({ repo: "http://github.com/firebase/functions-samples", ref: "main" })
      ).to.throw(FirebaseError, /Invalid remote source repository URL/);
      
      expect(() => 
        projectConfig.validateRemoteSource({ repo: "https://gitlab.com/firebase/functions-samples", ref: "main" })
      ).to.throw(FirebaseError, /Invalid remote source repository URL/);
      
      expect(() => 
        projectConfig.validateRemoteSource({ repo: "git@github.com:firebase/functions-samples.git", ref: "main" })
      ).to.throw(FirebaseError, /Invalid remote source repository URL/);
    });

    it("should reject invalid refs", () => {
      expect(() => 
        projectConfig.validateRemoteSource({ repo: "https://github.com/firebase/functions-samples", ref: "main!" })
      ).to.throw(FirebaseError, /Invalid remote source ref/);
      
      expect(() => 
        projectConfig.validateRemoteSource({ repo: "https://github.com/firebase/functions-samples", ref: "../evil" })
      ).to.throw(FirebaseError, /Invalid remote source ref/);
    });

    it("should reject missing fields", () => {
      expect(() => 
        projectConfig.validateRemoteSource({ repo: "", ref: "main" })
      ).to.throw(FirebaseError, /must specify both/);
      
      expect(() => 
        projectConfig.validateRemoteSource({ repo: "https://github.com/firebase/functions-samples", ref: "" })
      ).to.throw(FirebaseError, /must specify both/);
    });
  });

  describe("remote source validation", () => {
    const TEST_REMOTE_CONFIG = { 
      remoteSource: { 
        repo: "https://github.com/firebase/functions-samples", 
        ref: "main" 
      } 
    };

    it("passes validation for remote source config", () => {
      const validated = projectConfig.validate([TEST_REMOTE_CONFIG]);
      expect(validated[0]).to.include({ codebase: "default" });
      expect(validated[0].remoteSource).to.deep.equal(TEST_REMOTE_CONFIG.remoteSource);
    });

    it("fails validation given config with both source and remoteSource", () => {
      expect(() => 
        projectConfig.validate([{ 
          source: "functions",
          remoteSource: TEST_REMOTE_CONFIG.remoteSource
        }])
      ).to.throw(FirebaseError, /Cannot specify both 'source' and 'remoteSource'/);
    });

    it("handles multiple codebases with mixed sources", () => {
      const validated = projectConfig.validate([
        { source: "functions1", codebase: "local-functions" },
        { ...TEST_REMOTE_CONFIG, codebase: "remote-functions" }
      ]);
      expect(validated).to.have.length(2);
      expect(validated[0]).to.include({ source: "functions1", codebase: "local-functions" });
      expect(validated[1]).to.include({ codebase: "remote-functions" });
      expect(validated[1].remoteSource).to.deep.equal(TEST_REMOTE_CONFIG.remoteSource);
    });

    it("rejects duplicate remote sources", () => {
      expect(() => 
        projectConfig.validate([
          { ...TEST_REMOTE_CONFIG, codebase: "codebase1" },
          { ...TEST_REMOTE_CONFIG, codebase: "codebase2" }
        ])
      ).to.throw(FirebaseError, /source must be unique/);
    });
  });
});
