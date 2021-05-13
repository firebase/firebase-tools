import { expect } from "chai";
import { validateDeploy } from "../../../deploy/hosting/validate";

const PUBLIC_DIR_ERROR_PREFIX = 'Must supply a "public" directory';

describe("validateDeploy()", () => {
  function testDeploy(merge: any) {
    return () => {
      validateDeploy(
        {
          site: "test-site",
          version: "abc123",
          config: { ...merge },
        },
        {
          cwd: __dirname + "/../../fixtures/simplehosting",
          configPath: __dirname + "/../../fixtures/simplehosting/firebase.json",
        }
      );
    };
  }

  it("should error out if there is no public directory but a 'destination' rewrite", () => {
    expect(
      testDeploy({
        rewrites: [
          { source: "/foo", destination: "/bar.html" },
          { source: "/baz", function: "app" },
        ],
      })
    ).to.throw(PUBLIC_DIR_ERROR_PREFIX);
  });

  it("should error out if there is no public directory and no rewrites or redirects", () => {
    expect(testDeploy({})).to.throw(PUBLIC_DIR_ERROR_PREFIX);
  });

  it("should error out if there is no public directory and an i18n with root", () => {
    expect(
      testDeploy({
        i18n: { root: "/foo" },
        rewrites: [{ source: "/foo", function: "pass" }],
      })
    ).to.throw(PUBLIC_DIR_ERROR_PREFIX);
  });

  it("should error out if there is a public directory and an i18n with no root", () => {
    expect(
      testDeploy({
        public: "public",
        i18n: {},
        rewrites: [{ source: "/foo", function: "pass" }],
      })
    ).to.throw('Must supply a "root"');
  });

  it("should pass with public and nothing else", () => {
    expect(testDeploy({ public: "public" })).not.to.throw();
  });

  it("should pass with no public but a function rewrite", () => {
    expect(testDeploy({ rewrites: [{ source: "/", function: "app" }] })).not.to.throw();
  });

  it("should pass with no public but a run rewrite", () => {
    expect(testDeploy({ rewrites: [{ source: "/", run: { serviceId: "app" } }] })).not.to.throw();
  });

  it("should pass with no public but a redirect", () => {
    expect(
      testDeploy({ redirects: [{ source: "/", destination: "https://google.com/", type: 302 }] })
    ).not.to.throw();
  });
});
