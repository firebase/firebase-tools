import {
  RulesetVerificationOpts,
  StorageRulesRuntime,
} from "../../../src/emulator/storage/rules/runtime";
import { expect } from "chai";
import { StorageRulesFiles } from "../../emulator-tests/fixtures";
import * as jwt from "jsonwebtoken";
import { EmulatorLogger } from "../../../src/emulator/emulatorLogger";
import { ExpressionValue } from "../../../src/emulator/storage/rules/expressionValue";
import { RulesetOperationMethod } from "../../../src/emulator/storage/rules/types";
import { downloadIfNecessary } from "../../../src/emulator/downloadableEmulators";
import { Emulators } from "../../../src/emulator/types";
import { RulesResourceMetadata } from "../../../src/emulator/storage/metadata";

const TOKENS = {
  signedInUser: jwt.sign(
    {
      user_id: "mock-user",
    },
    "mock-secret",
  ),
};

function createFakeResourceMetadata(params: {
  size?: number;
  md5Hash?: string;
}): RulesResourceMetadata {
  return {
    name: "files/goat",
    bucket: "fake-app.appspot.com",
    generation: 1,
    metageneration: 1,
    size: params.size ?? 1024 /* 1 KiB */,
    timeCreated: new Date(),
    updated: new Date(),
    md5Hash: params.md5Hash ?? "fake-md5-hash",
    crc32c: "fake-crc32c",
    etag: "fake-etag",
    contentDisposition: "",
    contentEncoding: "",
    contentType: "",
    metadata: {},
  };
}

describe("Storage Rules Runtime", function () {
  let runtime: StorageRulesRuntime;

  // eslint-disable-next-line @typescript-eslint/no-invalid-this
  this.timeout(10000);

  before(async () => {
    await downloadIfNecessary(Emulators.STORAGE);

    runtime = new StorageRulesRuntime();
    (EmulatorLogger as any).prototype.log = console.log.bind(console);
    await runtime.start();
  });

  after(() => {
    runtime.stop();
  });

  it("should have a living child process", () => {
    expect(runtime.alive).to.be.true;
  });

  it("should load a basic ruleset", async () => {
    const { ruleset } = await runtime.loadRuleset({
      files: [StorageRulesFiles.readWriteIfAuth],
    });

    expect(ruleset).to.not.be.undefined;
  });

  it("should send errors on invalid ruleset compilation", async () => {
    const { ruleset, issues } = await runtime.loadRuleset({
      files: [
        {
          name: "/dev/null/storage.rules",
          content: `
            rules_version = '2';
            // Extra brace in the following line
            service firebase.storage {{
              match /b/{bucket}/o {
                match /{allPaths=**} {
                  allow read, write: if request.auth!=null;
                }
              }
            }
            `,
        },
      ],
    });

    expect(ruleset).to.be.undefined;
    expect(issues.errors.length).to.gt(0);
  });

  it("should reject an invalid evaluation", async () => {
    expect(
      await testIfPermitted(
        runtime,
        `
          rules_version = '2';
          service firebase.storage {
            match /b/{bucket}/o {
              match /{allPaths=**} {
                allow read, write: if false;
              }
            }
          }
          `,
        {
          token: TOKENS.signedInUser,
          method: RulesetOperationMethod.GET,
          path: "/b/BUCKET_NAME/o/num_check/filename.jpg",
          file: {},
        },
      ),
    ).to.be.false;
  });

  it("should accept a value evaluation", async () => {
    expect(
      await testIfPermitted(
        runtime,
        `
          rules_version = '2';
          service firebase.storage {
            match /b/{bucket}/o {
              match /{allPaths=**} {
                allow read, write: if true;
              }
            }
          }
          `,
        {
          token: TOKENS.signedInUser,
          method: RulesetOperationMethod.GET,
          path: "/b/BUCKET_NAME/o/num_check/filename.jpg",
          file: {},
        },
      ),
    ).to.be.true;
  });

  describe("request", () => {
    describe(".auth", () => {
      it("can read from auth.uid", async () => {
        expect(
          await testIfPermitted(
            runtime,
            `
            rules_version = '2';
            service firebase.storage {
              match /b/{bucket}/o/{sizeSegment=**} {
                allow read: if request.auth.uid == 'mock-user';
              }
            }
          `,
            {
              token: TOKENS.signedInUser,
              method: RulesetOperationMethod.GET,
              path: "/b/BUCKET_NAME/o/sizes/md",
              file: {},
            },
          ),
        ).to.be.true;
      });

      it("allows only authenticated reads", async () => {
        const rulesContent = `
          rules_version = '2';
          service firebase.storage {
            match /b/{bucket}/o/{sizeSegment=**} {
              allow read: if request.auth != null;
            }
          }
        `;

        // Authenticated reads are allowed
        expect(
          await testIfPermitted(runtime, rulesContent, {
            token: TOKENS.signedInUser,
            method: RulesetOperationMethod.GET,
            path: "/b/BUCKET_NAME/o/sizes/md",
            file: {},
          }),
        ).to.be.true;
        // Authenticated writes are not allowed
        expect(
          await testIfPermitted(runtime, rulesContent, {
            token: TOKENS.signedInUser,
            method: RulesetOperationMethod.WRITE,
            path: "/b/BUCKET_NAME/o/sizes/md",
            file: {},
          }),
        ).to.be.false;
        // Unautheticated reads are not allowed
        expect(
          await testIfPermitted(runtime, rulesContent, {
            method: RulesetOperationMethod.GET,
            path: "/b/BUCKET_NAME/o/sizes/md",
            file: {},
          }),
        ).to.be.false;
        // Unautheticated writes are not allowed
        expect(
          await testIfPermitted(runtime, rulesContent, {
            method: RulesetOperationMethod.WRITE,
            path: "/b/BUCKET_NAME/o/sizes/md",
            file: {},
          }),
        ).to.be.false;
      });
    });

    it(".path rules are respected", async () => {
      const rulesContent = `
        rules_version = '2';
        service firebase.storage {
          match /b/{bucket}/o {
            match /{allPaths=**} {
              // Test that request.path is relative to the service (firebase.storage) 
              allow read: if request.path[0] == "b" &&
                request.path[1] == "BUCKET_NAME" &&
                request.path[2] == "o" &&
                request.path[3] == "dir" &&
                request.path[4] == "subdir" &&
                request.path[5] == "image.png" &&
                request.path == path("/b/BUCKET_NAME/o/dir/subdir/image.png");
            }
          }
        }`;

      expect(
        await testIfPermitted(runtime, rulesContent, {
          token: TOKENS.signedInUser,
          method: RulesetOperationMethod.GET,
          path: "/b/BUCKET_NAME/o/dir/subdir/disallowed.png",
          file: {},
        }),
      ).to.be.false;
      expect(
        await testIfPermitted(runtime, rulesContent, {
          token: TOKENS.signedInUser,
          method: RulesetOperationMethod.GET,
          path: "/b/BUCKET_NAME/o/dir/subdir/image.png",
          file: {},
        }),
      ).to.be.true;
    });

    it(".resource rules are respected", async () => {
      const rulesContent = `
        rules_version = '2';
        service firebase.storage {
          match /b/{bucket}/o {
            match /files/{file} {
              allow read, write: if request.resource.size < 5 * 1024 * 1024;
            }
          }
        }`;

      expect(
        await testIfPermitted(runtime, rulesContent, {
          token: TOKENS.signedInUser,
          method: RulesetOperationMethod.WRITE,
          path: "/b/BUCKET_NAME/o/files/goat",
          file: { after: createFakeResourceMetadata({ size: 500 * 1024 /* 500 KiB */ }) },
        }),
      ).to.be.true;
      expect(
        await testIfPermitted(runtime, rulesContent, {
          token: TOKENS.signedInUser,
          method: RulesetOperationMethod.WRITE,
          path: "/b/BUCKET_NAME/o/files/goat",
          file: { after: createFakeResourceMetadata({ size: 10 * 1024 * 1024 /* 10 MiB */ }) },
        }),
      ).to.be.false;
    });
  });

  describe("resource", () => {
    it("should only read for small files", async () => {
      const rulesContent = `
        rules_version = '2';
        service firebase.storage {
          match /b/{bucket}/o {
            match /files/{file} {
              allow read: if resource.size < 5 * 1024 * 1024;
              allow write: if false;
            }
          }
        }`;

      expect(
        await testIfPermitted(runtime, rulesContent, {
          token: TOKENS.signedInUser,
          method: RulesetOperationMethod.GET,
          path: "/b/BUCKET_NAME/o/files/goat",
          file: { before: createFakeResourceMetadata({ size: 500 * 1024 /* 500 KiB */ }) },
        }),
      ).to.be.true;

      expect(
        await testIfPermitted(runtime, rulesContent, {
          token: TOKENS.signedInUser,
          method: RulesetOperationMethod.GET,
          path: "/b/BUCKET_NAME/o/files/goat",
          file: { before: createFakeResourceMetadata({ size: 10 * 1024 * 1024 /* 10 MiB */ }) },
        }),
      ).to.be.false;
    });

    it("should only permit upload if hash matches", async () => {
      const rulesContent = `
        rules_version = '2';
        service firebase.storage {
          match /b/{bucket}/o {
            match /files/{file} {
              allow read, write: if request.resource.md5Hash == resource.md5Hash;
            }
          }
        }`;
      const metadata1 = createFakeResourceMetadata({ md5Hash: "fake-md5-hash" });
      const metadata2 = createFakeResourceMetadata({ md5Hash: "different-md5-hash" });

      expect(
        await testIfPermitted(runtime, rulesContent, {
          token: TOKENS.signedInUser,
          method: RulesetOperationMethod.GET,
          path: "/b/BUCKET_NAME/o/files/goat",
          file: { before: metadata1, after: metadata1 },
        }),
      ).to.be.true;
      expect(
        await testIfPermitted(runtime, rulesContent, {
          token: TOKENS.signedInUser,
          method: RulesetOperationMethod.GET,
          path: "/b/BUCKET_NAME/o/files/goat",
          file: { before: metadata1, after: metadata2 },
        }),
      ).to.be.false;
    });
  });

  describe("features", () => {
    describe("ternary", () => {
      it("should support ternary operators", async () => {
        const rulesContent = `
        rules_version = '2';
        service firebase.storage {
          match /b/{bucket}/o {
            match /{file} {
              allow read: if request.path[3] == "test" ? true : false;
            }
          }
        }`;

        expect(
          await testIfPermitted(runtime, rulesContent, {
            method: RulesetOperationMethod.GET,
            path: "/b/BUCKET_NAME/o/test",
            file: {},
          }),
        ).to.be.true;

        expect(
          await testIfPermitted(runtime, rulesContent, {
            method: RulesetOperationMethod.GET,
            path: "/b/BUCKET_NAME/o/someRandomFile",
            file: {},
          }),
        ).to.be.false;
      });
    });
  });
});

async function testIfPermitted(
  runtime: StorageRulesRuntime,
  rulesetContent: string,
  verificationOpts: Omit<RulesetVerificationOpts, "projectId">,
  runtimeVariableOverrides: { [s: string]: ExpressionValue } = {},
) {
  const loadResult = await runtime.loadRuleset({
    files: [
      {
        name: "/dev/null/storage.rules",
        content: rulesetContent,
      },
    ],
  });

  if (!loadResult.ruleset) {
    throw new Error(JSON.stringify(loadResult.issues, undefined, 2));
  }

  const { permitted, issues } = await loadResult.ruleset.verify(
    { ...verificationOpts, projectId: "demo-project-id" },
    runtimeVariableOverrides,
  );

  if (permitted === undefined) {
    throw new Error(JSON.stringify(issues, undefined, 2));
  }

  return permitted;
}
