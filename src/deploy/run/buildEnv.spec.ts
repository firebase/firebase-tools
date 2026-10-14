import { expect } from "chai";
import * as runv2 from "../../gcp/runv2";
import {
  BUILD_ENV_ANNOTATION,
  getBuildEnv,
  nonSecretValues,
  secretNames,
  toLocalBuildEnv,
} from "./buildEnv";

describe("run buildEnv", () => {
  const web = { name: "projects/my-project/locations/us-central1/services/web" } as runv2.Service;
  /** The web service, with this build env annotation. */
  const withAnnotation = (value: string): runv2.Service => ({
    ...web,
    annotations: { [BUILD_ENV_ANNOTATION]: value },
  });

  describe("getBuildEnv", () => {
    it("returns {} without a service or annotation", () => {
      expect(getBuildEnv(undefined)).to.deep.equal({});
      expect(getBuildEnv({ ...web, annotations: { team: "frontend" } })).to.deep.equal({});
    });

    it("parses a plain map like Cloud Run's buildConfig.environmentVariables", () => {
      const env = { API_URL: "https://api.example.com", BASE_PATH: "" };
      expect(getBuildEnv(withAnnotation(JSON.stringify(env)))).to.deep.equal(env);
    });

    it("parses secrets written the way apphosting.yaml writes them", () => {
      const env = {
        API_URL: "https://api.example.com",
        NPM_TOKEN: { secret: "npm-token" },
        SENTRY_AUTH_TOKEN: { secret: "sentry-auth-token@2" },
        GITHUB_TOKEN: { secret: "projects/shared-secrets/secrets/github-token/versions/3" },
      };
      expect(getBuildEnv(withAnnotation(JSON.stringify(env)))).to.deep.equal(env);
    });

    it("rejects invalid JSON and non-objects", () => {
      expect(() => getBuildEnv(withAnnotation("API_URL=https://api.example.com"))).to.throw(
        `Invalid ${BUILD_ENV_ANNOTATION} annotation on projects/my-project/locations/us-central1/services/web: it isn't valid JSON.`,
      );
      for (const value of ["[]", "null", '"https://api.example.com"', "1"]) {
        expect(() => getBuildEnv(withAnnotation(value))).to.throw("it must be a JSON object.");
      }
    });

    it("converts numbers and booleans to strings, as apphosting.yaml does", () => {
      const annotation =
        '{"NEXT_TELEMETRY_DISABLED": 1, "CI": true, "DEBUG": false, "RATIO": 1.50}';
      expect(getBuildEnv(withAnnotation(annotation))).to.deep.equal({
        NEXT_TELEMETRY_DISABLED: "1",
        CI: "true",
        DEBUG: "false",
        // JSON doesn't keep how a number was written.
        RATIO: "1.5",
      });
    });

    it("rejects invalid values", () => {
      const invalid = [
        null,
        ["npm-token"],
        {},
        { secret: 1 },
        // The version goes in the secret string, e.g. "npm-token@3".
        { secret: "npm-token", version: "3" },
      ];
      for (const value of invalid) {
        expect(() => getBuildEnv(withAnnotation(JSON.stringify({ NPM_TOKEN: value })))).to.throw(
          'NPM_TOKEN must be a string, number, boolean, or {"secret": "<secret name>"}.',
        );
      }
    });
  });

  it("splits secrets from plain values", () => {
    const env = {
      API_URL: "https://api.example.com",
      NPM_TOKEN: { secret: "npm-token" },
      SENTRY_AUTH_TOKEN: { secret: "sentry-auth-token@2" },
    };
    expect(secretNames(env)).to.deep.equal(["NPM_TOKEN", "SENTRY_AUTH_TOKEN"]);
    expect(nonSecretValues(env)).to.deep.equal({ API_URL: "https://api.example.com" });
  });

  it("converts to local build env, available only to the build, with secrets unchanged", () => {
    expect(
      toLocalBuildEnv({
        API_URL: "https://api.example.com",
        NPM_TOKEN: { secret: "npm-token" },
        GITHUB_TOKEN: { secret: "projects/shared-secrets/secrets/github-token/versions/3" },
      }),
    ).to.deep.equal({
      API_URL: { value: "https://api.example.com", availability: ["BUILD"] },
      NPM_TOKEN: { secret: "npm-token", availability: ["BUILD"] },
      GITHUB_TOKEN: {
        secret: "projects/shared-secrets/secrets/github-token/versions/3",
        availability: ["BUILD"],
      },
    });
  });
});
