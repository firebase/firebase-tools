import { expect } from "chai";
import * as runv2 from "../../gcp/runv2";
import { BUILD_ENV_ANNOTATION, getBuildEnv, secretNames, toLocalBuildEnv } from "./buildEnv";

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

    it("parses secret references", () => {
      const env = {
        API_URL: "https://api.example.com",
        NPM_TOKEN: { secret: "npm-token" },
        SENTRY_AUTH_TOKEN: { secret: "sentry-auth-token", version: "2" },
        GITHUB_TOKEN: { secret: "projects/shared-secrets/secrets/github-token", version: "latest" },
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

    it("rejects invalid values", () => {
      const invalid = [
        1,
        null,
        ["npm-token"],
        {},
        { secret: 1 },
        { secret: "secrets/npm-token" },
        { secret: "npm-token@3" },
        { secret: "projects/shared-secrets/secrets/npm-token/versions/3" },
        { secret: "npm-token", version: 3 },
        { secret: "npm-token", version: "v3" },
        { secret: "npm-token", project: "shared-secrets" },
      ];
      for (const value of invalid) {
        expect(() => getBuildEnv(withAnnotation(JSON.stringify({ NPM_TOKEN: value })))).to.throw(
          'NPM_TOKEN must be a string or {"secret": "<name>", "version": "<number or latest>"}.',
        );
      }
    });
  });

  it("lists secret names", () => {
    const env = {
      API_URL: "https://api.example.com",
      NPM_TOKEN: { secret: "npm-token" },
      SENTRY_AUTH_TOKEN: { secret: "sentry-auth-token", version: "2" },
    };
    expect(secretNames(env)).to.deep.equal(["NPM_TOKEN", "SENTRY_AUTH_TOKEN"]);
  });

  it("converts to local build env, available only to the build", () => {
    expect(
      toLocalBuildEnv({
        API_URL: "https://api.example.com",
        NPM_TOKEN: { secret: "npm-token" },
        SENTRY_AUTH_TOKEN: { secret: "sentry-auth-token", version: "2" },
        GITHUB_TOKEN: { secret: "projects/shared-secrets/secrets/github-token" },
        CMS_TOKEN: { secret: "projects/shared-secrets/secrets/cms-token", version: "4" },
      }),
    ).to.deep.equal({
      API_URL: { value: "https://api.example.com", availability: ["BUILD"] },
      NPM_TOKEN: { secret: "npm-token@latest", availability: ["BUILD"] },
      SENTRY_AUTH_TOKEN: { secret: "sentry-auth-token@2", availability: ["BUILD"] },
      GITHUB_TOKEN: {
        secret: "projects/shared-secrets/secrets/github-token/versions/latest",
        availability: ["BUILD"],
      },
      CMS_TOKEN: {
        secret: "projects/shared-secrets/secrets/cms-token/versions/4",
        availability: ["BUILD"],
      },
    });
  });
});
