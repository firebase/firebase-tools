import { expect } from "chai";
import * as runv2 from "../../gcp/runv2";
import { BUILD_ENV_ANNOTATION, getBuildEnv, secretNames, toLocalBuildEnv } from "./buildEnv";

describe("run buildEnv", () => {
  const withAnnotation = (value: string): runv2.Service =>
    ({
      name: "projects/p/locations/us-central1/services/s",
      annotations: { other: "x", [BUILD_ENV_ANNOTATION]: value },
    }) as unknown as runv2.Service;

  describe("getBuildEnv", () => {
    it("returns {} without a service or annotation", () => {
      expect(getBuildEnv(undefined)).to.deep.equal({});
      expect(
        getBuildEnv({ annotations: { other: "x" } } as unknown as runv2.Service),
      ).to.deep.equal({});
    });

    it("parses a plain map like Cloud Run's buildConfig.environmentVariables", () => {
      expect(getBuildEnv(withAnnotation('{"A":"1","B":""}'))).to.deep.equal({ A: "1", B: "" });
    });

    it("parses secret references", () => {
      const env = {
        A: "1",
        TOKEN: { secret: "npm-token", version: "3" },
        LATEST: { secret: "s" },
        OTHER: { secret: "projects/q/secrets/t", version: "latest" },
      };
      expect(getBuildEnv(withAnnotation(JSON.stringify(env)))).to.deep.equal(env);
    });

    it("rejects invalid JSON and non-objects", () => {
      expect(() => getBuildEnv(withAnnotation("{"))).to.throw(
        `Invalid ${BUILD_ENV_ANNOTATION} annotation on projects/p/locations/us-central1/services/s: it isn't valid JSON.`,
      );
      for (const value of ["[]", "null", '"x"', "1"]) {
        expect(() => getBuildEnv(withAnnotation(value))).to.throw("it must be a JSON object.");
      }
    });

    it("rejects invalid values", () => {
      const invalid = [
        1,
        null,
        ["x"],
        {},
        { secret: 1 },
        { secret: "a/b" },
        { secret: "a@1" },
        { secret: "projects/q/secrets/t/versions/1" },
        { secret: "s", version: 1 },
        { secret: "s", version: "one" },
        { secret: "s", extra: "x" },
      ];
      for (const value of invalid) {
        expect(() => getBuildEnv(withAnnotation(JSON.stringify({ A: value })))).to.throw(
          'A must be a string or {"secret": "<name>", "version": "<number or latest>"}.',
        );
      }
    });
  });

  it("lists secret names", () => {
    expect(
      secretNames({ A: "1", B: { secret: "s" }, C: { secret: "t", version: "2" } }),
    ).to.deep.equal(["B", "C"]);
  });

  it("converts to local build env, available only to the build", () => {
    expect(
      toLocalBuildEnv({
        A: "1",
        B: { secret: "s" },
        C: { secret: "t", version: "2" },
        D: { secret: "projects/q/secrets/u" },
        E: { secret: "projects/q/secrets/v", version: "4" },
      }),
    ).to.deep.equal({
      A: { value: "1", availability: ["BUILD"] },
      B: { secret: "s@latest", availability: ["BUILD"] },
      C: { secret: "t@2", availability: ["BUILD"] },
      D: { secret: "projects/q/secrets/u/versions/latest", availability: ["BUILD"] },
      E: { secret: "projects/q/secrets/v/versions/4", availability: ["BUILD"] },
    });
  });
});
