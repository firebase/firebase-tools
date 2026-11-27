import { expect } from "chai";
import { sanitizeLockfileContent } from "./sanitize-lockfile";

interface LockfileFixture {
  packages: Record<string, { version: string; resolved: string }>;
}

describe("sanitize-lockfile", () => {
  it("rewrites unscoped package URLs from custom mirrors to registry.npmjs.org", () => {
    const input = JSON.stringify(
      {
        packages: {
          "node_modules/webdriverio": {
            version: "9.2.6",
            resolved:
              "https://us-npm.pkg.dev/artifact-foundry-prod/ah-3p-staging-npm/webdriverio/-/webdriverio-9.2.6.tgz",
          },
        },
      },
      null,
      2,
    );

    const parsed = JSON.parse(sanitizeLockfileContent(input)) as LockfileFixture;
    expect(parsed.packages["node_modules/webdriverio"].resolved).to.equal(
      "https://registry.npmjs.org/webdriverio/-/webdriverio-9.2.6.tgz",
    );
  });

  it("rewrites scoped package URLs with standard tarball filenames", () => {
    const input = JSON.stringify(
      {
        packages: {
          "node_modules/@babel/core": {
            version: "7.28.0",
            resolved: "http://custom-mirror.internal:999/npm/repo/@babel/core/-/core-7.28.0.tgz",
          },
        },
      },
      null,
      2,
    );

    const parsed = JSON.parse(sanitizeLockfileContent(input)) as LockfileFixture;
    expect(parsed.packages["node_modules/@babel/core"].resolved).to.equal(
      "https://registry.npmjs.org/@babel/core/-/core-7.28.0.tgz",
    );
  });

  it("strips duplicate @scope/ prefixes after /-/ in scoped package tarball URLs", () => {
    const input = JSON.stringify(
      {
        packages: {
          "node_modules/@babel/core": {
            version: "7.28.0",
            resolved:
              "https://us-npm.pkg.dev/artifact-foundry-prod/npm-3p-trusted/@babel/core/-/@babel/core-7.28.0.tgz",
          },
        },
      },
      null,
      2,
    );

    const parsed = JSON.parse(sanitizeLockfileContent(input)) as LockfileFixture;
    expect(parsed.packages["node_modules/@babel/core"].resolved).to.equal(
      "https://registry.npmjs.org/@babel/core/-/core-7.28.0.tgz",
    );
  });

  it("is idempotent on canonical registry.npmjs.org URLs", () => {
    const input = JSON.stringify(
      {
        packages: {
          "node_modules/lodash": {
            version: "4.18.0",
            resolved: "https://registry.npmjs.org/lodash/-/lodash-4.18.0.tgz",
          },
          "node_modules/@babel/core": {
            version: "7.28.0",
            resolved: "https://registry.npmjs.org/@babel/core/-/core-7.28.0.tgz",
          },
        },
      },
      null,
      2,
    );

    expect(sanitizeLockfileContent(input)).to.equal(input);
  });
});
