import { expect } from "chai";
import { FirebaseError } from "../../error";
import { HostingConfig, HostingMultiple, HostingSingle } from "../../firebaseConfig";

import * as config from "../../hosting/config";
import { HostingOptions } from "../../hosting/options";
import { RequireAtLeastOne } from "../../metaprogramming";
import { cloneDeep } from "../../utils";
import { setEnabled } from "../../experiments";

function options(
  hostingConfig: HostingConfig,
  base?: Omit<HostingOptions, "config" | "rc">,
  targetsToSites?: Record<string, string[]>,
): HostingOptions {
  return {
    project: "project",
    config: {
      src: {
        hosting: hostingConfig,
      },
    },
    rc: {
      requireTarget: (project: string, type: string, name: string): string[] => {
        return targetsToSites?.[name] || [];
      },
    },
    cwd: __dirname + "/../fixtures/simplehosting",
    configPath: __dirname + "/../fixtures/simplehosting/firebase.json",
    ...base,
  };
}

describe("config", () => {
  describe("extract", () => {
    it("should handle no hosting config", () => {
      const opts = options({});
      delete opts.config.src.hosting;
      expect(config.extract(opts)).to.deep.equal([]);
    });

    it("should fail if both site and target are specified", () => {
      const singleSiteOpts = options({ site: "site", target: "target" });
      expect(() => config.extract(singleSiteOpts)).throws(
        FirebaseError,
        /configs should only include either/,
      );

      const manySiteOpts = options([{ site: "site", target: "target" }]);
      expect(() => config.extract(manySiteOpts)).throws(
        FirebaseError,
        /configs should only include either/,
      );
    });

    it("should always return an array", () => {
      const single: HostingMultiple[number] = { site: "site" };
      let extracted = config.extract(options(single));
      expect(extracted).to.deep.equal([single]);

      extracted = config.extract(options([single]));
      expect(extracted).to.deep.equal([single]);
    });

    it("should support legacy method of specifying site", () => {
      const opts = options({}, { site: "legacy-site" });
      const extracted = config.extract(opts);
      expect(extracted).to.deep.equal([{ site: "legacy-site" }]);
    });
  });

  describe("resolveTargets", () => {
    it("should not modify the config", () => {
      const cfg: HostingMultiple = [{ target: "target" }];
      const opts = options(cfg, {}, { target: ["site"] });
      config.resolveTargets(cfg, opts);
      expect(cfg).to.deep.equal([{ target: "target" }]);
    });

    it("should add sites when found", () => {
      const cfg: HostingMultiple = [{ target: "target" }];
      const opts = options(cfg, {}, { target: ["site"] });
      const resolved = config.resolveTargets(cfg, opts);
      expect(resolved).to.deep.equal([{ target: "target", site: "site" }]);
    });

    // Note: Not testing the case where the target cannot be found because this
    // exception comes out of the RC class, which is being mocked in tests.

    it("should prohibit multiple sites", () => {
      const cfg: HostingMultiple = [{ target: "target" }];
      const opts = options(cfg, {}, { target: ["site", "other-site"] });
      expect(() => config.resolveTargets(cfg, opts)).to.throw(
        FirebaseError,
        /is linked to multiple sites, but only one is permitted/,
      );
    });
  });

  describe("filterOnly", () => {
    const tests: Array<
      {
        desc: string;
        cfg: HostingMultiple;
        only?: string;
      } & RequireAtLeastOne<{
        want?: HostingMultiple;
        wantErr?: RegExp;
      }>
    > = [
      {
        desc: "a normal hosting config, specifying the default site",
        cfg: [{ site: "site" }],
        only: "hosting:site",
        want: [{ site: "site" }],
      },
      {
        desc: "a hosting config with multiple sites, no targets, specifying the second site",
        cfg: [{ site: "site" }, { site: "different-site" }],
        only: `hosting:different-site`,
        want: [{ site: "different-site" }],
      },
      {
        desc: "a normal hosting config with a target",
        cfg: [{ target: "main" }, { site: "site" }],
        only: "hosting:main",
        want: [{ target: "main" }],
      },
      {
        desc: "a hosting config with multiple targets, specifying one",
        cfg: [{ target: "t-one" }, { target: "t-two" }],
        only: "hosting:t-two",
        want: [{ target: "t-two" }],
      },
      {
        desc: "a hosting config with multiple targets, specifying all hosting",
        cfg: [{ target: "t-one" }, { target: "t-two" }],
        only: "hosting",
        want: [{ target: "t-one" }, { target: "t-two" }],
      },
      {
        desc: "a hosting config with multiple targets, specifying an invalid target",
        cfg: [{ target: "t-one" }, { target: "t-two" }],
        only: "hosting:t-three",
        wantErr: /Hosting site or target.+t-three.+not detected/,
      },
      {
        desc: "a hosting config with multiple sites but no targets, only an invalid target",
        cfg: [{ site: "s-one" }],
        only: "hosting:t-one",
        wantErr: /Hosting site or target.+t-one.+not detected/,
      },
      {
        desc: "a hosting config without an only string",
        cfg: [{ site: "site" }],
        want: [{ site: "site" }],
      },
      {
        desc: "a hosting config with a non-hosting only flag",
        cfg: [{ site: "site" }],
        only: "functions",
        want: [],
      },
    ];

    for (const t of tests) {
      it(`should be able to parse ${t.desc}`, () => {
        if (t.wantErr) {
          expect(() => config.filterOnly(t.cfg, t.only)).to.throw(FirebaseError, t.wantErr);
        } else {
          const got = config.filterOnly(t.cfg, t.only);
          expect(got).to.deep.equal(t.want);
        }
      });
    }
  });

  describe("with an except parameter, resolving targets", () => {
    const tests: Array<
      {
        desc: string;
        cfg: HostingMultiple;
        except?: string;
      } & RequireAtLeastOne<{
        want: HostingMultiple;
        wantErr: RegExp;
      }>
    > = [
      {
        desc: "a hosting config with multiple sites, no targets, omitting the second site",
        cfg: [{ site: "default-site" }, { site: "different-site" }],
        except: `hosting:different-site`,
        want: [{ site: "default-site" }],
      },
      {
        desc: "a normal hosting config with a target, omitting the target",
        cfg: [{ target: "main" }],
        except: "hosting:main",
        want: [],
      },
      {
        desc: "a hosting config with multiple targets, omitting one",
        cfg: [{ target: "t-one" }, { target: "t-two" }],
        except: "hosting:t-two",
        want: [{ target: "t-one" }],
      },
      {
        desc: "a hosting config with multiple targets, omitting all hosting",
        cfg: [{ target: "t-one" }, { target: "t-two" }],
        except: "hosting",
        want: [],
      },
      {
        desc: "a hosting config with multiple targets, omitting an invalid target",
        cfg: [{ target: "t-one" }, { target: "t-two" }],
        except: "hosting:t-three",
        want: [{ target: "t-one" }, { target: "t-two" }],
      },
      {
        desc: "a hosting config with no excpet string",
        cfg: [{ target: "target" }],
        want: [{ target: "target" }],
      },
      {
        desc: "a hosting config with a non-hosting except string",
        cfg: [{ target: "target" }],
        except: "functions",
        want: [{ target: "target" }],
      },
    ];

    for (const t of tests) {
      it(`should be able to parse ${t.desc}`, () => {
        if (t.wantErr) {
          expect(() => config.filterExcept(t.cfg, t.except)).to.throw(FirebaseError, t.wantErr);
        } else {
          const got = config.filterExcept(t.cfg, t.except);
          expect(got).to.deep.equal(t.want);
        }
      });
    }
  });

  it("normalize", () => {
    it("upgrades function configs", () => {
      const configs: HostingMultiple = [
        {
          site: "site",
          public: "public",
          rewrites: [
            {
              glob: "**",
              function: "functionId",
            },
            {
              glob: "**",
              function: "function2",
              region: "region",
            },
          ],
        },
      ];
      config.normalize(configs);
      expect(configs).to.deep.equal([
        {
          site: "site",
          public: "public",
          rewrites: [
            {
              glob: "**",
              function: {
                functionid: "functionId",
              },
            },
            {
              glob: "**",
              function: {
                functionId: "function2",
                region: "region",
              },
            },
          ],
        },
      ]);
    });

    it("leaves other rewrites alone", () => {
      const configs: HostingMultiple = [
        {
          site: "site",
          public: "public",
          rewrites: [
            {
              glob: "**",
              destination: "index.html",
            },
            {
              glob: "**",
              function: {
                functionId: "functionId",
              },
            },
            {
              glob: "**",
              run: {
                serviceId: "service",
              },
            },
            {
              glob: "**",
              dynamicLinks: true,
            },
          ],
        },
      ];
      const expected = cloneDeep(configs);
      config.normalize(configs);
      expect(configs).to.deep.equal(expected);
    });
  });

  const PUBLIC_DIR_ERROR_PREFIX = /Must supply a "public" or "source" directory/;
  describe("validate", () => {
    const tests: Array<{
      desc: string;
      site: HostingSingle;
      wantErr?: RegExp;
    }> = [
      {
        desc: "should error out if there is no public directory but a 'destination' rewrite",
        site: {
          rewrites: [
            { source: "/foo", destination: "/bar.html" },
            { source: "/baz", function: "app" },
          ],
        },
        wantErr: PUBLIC_DIR_ERROR_PREFIX,
      },
      {
        desc: "should error out if there is no public directory and an i18n with root",
        site: {
          i18n: { root: "/foo" },
          rewrites: [{ source: "/foo", function: "pass" }],
        },
        wantErr: PUBLIC_DIR_ERROR_PREFIX,
      },
      {
        desc: "should error out if there is a public direcotry and an i18n with no root",
        site: {
          public: "public",
          i18n: {} as unknown as { root: string },
          rewrites: [{ source: "/foo", function: "pass" }],
        },
        wantErr: /Must supply a "root"/,
      },
      {
        desc: "should error out if region is set and function is unset",
        site: {
          rewrites: [{ source: "/", region: "us-central1" } as any],
        },
        wantErr:
          /Rewrites only support 'region' as a top-level field when 'function' is set as a string/,
      },
      {
        desc: "should error out if region is set and functions is the new form",
        site: {
          rewrites: [
            {
              source: "/",
              region: "us-central1",
              function: {
                functionId: "id",
              },
            },
          ],
        },
        wantErr:
          /Rewrites only support 'region' as a top-level field when 'function' is set as a string/,
      },
      {
        desc: "should pass with public and nothing else",
        site: { public: "public" },
      },
      {
        desc: "should pass with no public but a function rewrite",
        site: {
          rewrites: [{ source: "/", function: "app" }],
        },
      },
      {
        desc: "should pass with no public but a run rewrite",
        site: {
          rewrites: [{ source: "/", run: { serviceId: "app" } }],
        },
      },
      {
        desc: "should pass with no public but a redirect",
        site: {
          redirects: [{ source: "/", destination: "https://google.com", type: 302 }],
        },
      },
    ];

    for (const t of tests) {
      it(t.desc, () => {
        // Setting experiment to "false" to handle mismatched error message.
        setEnabled("webframeworks", false);

        const configs: HostingMultiple = [{ site: "site", ...t.site }];
        if (t.wantErr) {
          expect(() => config.validate(configs, options(t.site))).to.throw(
            FirebaseError,
            t.wantErr,
          );
        } else {
          expect(() => config.validate(configs, options(t.site))).to.not.throw();
        }
      });
    }
  });
});
