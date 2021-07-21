import { expect } from "chai";
import { FirebaseError } from "../../error";

import { normalizedHostingConfigs } from "../../hosting/normalizedHostingConfigs";

describe("normalizedHostingConfigs", () => {
  it("should fail if both site and target are specified", () => {
    const singleHostingConfig = { site: "site", target: "target" };
    const cmdConfig = {
      site: "default-site",
      config: { get: () => singleHostingConfig },
    };
    expect(() => normalizedHostingConfigs(cmdConfig)).to.throw(
      FirebaseError,
      /configs should only include either/
    );

    const hostingConfig = [{ site: "site", target: "target" }];
    const newCmdConfig = {
      site: "default-site",
      config: { get: () => hostingConfig },
    };
    expect(() => normalizedHostingConfigs(newCmdConfig)).to.throw(
      FirebaseError,
      /configs should only include either/
    );
  });

  it("should not modify the config when resolving targets", () => {
    const singleHostingConfig = { target: "target" };
    const cmdConfig = {
      site: "default-site",
      config: { get: () => singleHostingConfig },
      rc: { requireTarget: () => ["default-site"] },
    };
    normalizedHostingConfigs(cmdConfig, { resolveTargets: true });
    expect(singleHostingConfig).to.deep.equal({ target: "target" });
  });

  describe("without an only parameter", () => {
    const DEFAULT_SITE = "default-hosting-site";
    const baseConfig = { public: "public", ignore: ["firebase.json"] };
    const tests = [
      {
        desc: "a normal hosting config",
        cfg: Object.assign({}, baseConfig),
        want: [Object.assign({}, baseConfig, { site: DEFAULT_SITE })],
      },
      {
        desc: "no hosting config",
        want: [],
      },
      {
        desc: "a normal hosting config with a target",
        cfg: Object.assign({}, baseConfig, { target: "main" }),
        want: [Object.assign({}, baseConfig, { target: "main" })],
      },
      {
        desc: "a hosting config with multiple targets",
        cfg: [
          Object.assign({}, baseConfig, { target: "t-one" }),
          Object.assign({}, baseConfig, { target: "t-two" }),
        ],
        want: [
          Object.assign({}, baseConfig, { target: "t-one" }),
          Object.assign({}, baseConfig, { target: "t-two" }),
        ],
      },
    ];

    for (const t of tests) {
      it(`should be able to parse ${t.desc}`, () => {
        const cmdConfig = {
          site: DEFAULT_SITE,
          config: { get: () => t.cfg },
        };
        const got = normalizedHostingConfigs(cmdConfig);
        expect(got).to.deep.equal(t.want);
      });
    }
  });

  describe("with an only parameter, resolving targets", () => {
    const DEFAULT_SITE = "default-hosting-site";
    const TARGETED_SITE = "targeted-site";
    const baseConfig = { public: "public", ignore: ["firebase.json"] };
    const tests = [
      {
        desc: "a normal hosting config, specifying the default site",
        cfg: Object.assign({}, baseConfig),
        only: `hosting:${DEFAULT_SITE}`,
        want: [Object.assign({}, baseConfig, { site: DEFAULT_SITE })],
      },
      {
        desc: "a hosting config with multiple sites, no targets, specifying the second site",
        cfg: [
          Object.assign({}, baseConfig, { site: DEFAULT_SITE }),
          Object.assign({}, baseConfig, { site: "different-site" }),
        ],
        only: `hosting:different-site`,
        want: [Object.assign({}, baseConfig, { site: "different-site" })],
      },
      {
        desc: "a normal hosting config with a target",
        cfg: Object.assign({}, baseConfig, { target: "main" }),
        only: "hosting:main",
        want: [Object.assign({}, baseConfig, { target: "main", site: TARGETED_SITE })],
      },
      {
        desc: "a hosting config with multiple targets, specifying one",
        cfg: [
          Object.assign({}, baseConfig, { target: "t-one" }),
          Object.assign({}, baseConfig, { target: "t-two" }),
        ],
        only: "hosting:t-two",
        want: [Object.assign({}, baseConfig, { target: "t-two", site: TARGETED_SITE })],
      },
      {
        desc: "a hosting config with multiple targets, specifying all hosting",
        cfg: [
          Object.assign({}, baseConfig, { target: "t-one" }),
          Object.assign({}, baseConfig, { target: "t-two" }),
        ],
        only: "hosting",
        want: [
          Object.assign({}, baseConfig, { target: "t-one", site: TARGETED_SITE }),
          Object.assign({}, baseConfig, { target: "t-two", site: TARGETED_SITE }),
        ],
      },
      {
        desc: "a hosting config with multiple targets, specifying an invalid target",
        cfg: [
          Object.assign({}, baseConfig, { target: "t-one" }),
          Object.assign({}, baseConfig, { target: "t-two" }),
        ],
        only: "hosting:t-three",
        wantErr: /Hosting site or target.+t-three.+not detected/,
      },
      {
        desc: "a hosting config with multiple targets, with multiple matching targets",
        cfg: [
          Object.assign({}, baseConfig, { target: "t-one" }),
          Object.assign({}, baseConfig, { target: "t-one" }),
        ],
        only: "hosting:t-one",
        targetedSites: [TARGETED_SITE, TARGETED_SITE],
        wantErr: /Hosting target.+t-one.+linked to multiple sites/,
      },
      {
        desc: "a hosting config with multiple sites but no targets, only all hosting",
        cfg: [Object.assign({}, baseConfig), Object.assign({}, baseConfig)],
        only: "hosting",
        wantErr: /Must supply either "site" or "target"/,
      },
      {
        desc: "a hosting config with multiple sites but no targets, only an invalid target",
        cfg: [Object.assign({}, baseConfig), Object.assign({}, baseConfig)],
        only: "hosting:t-one",
        wantErr: /Hosting site or target.+t-one.+not detected/,
      },
    ];

    for (const t of tests) {
      it(`should be able to parse ${t.desc}`, () => {
        if (!Array.isArray(t.targetedSites)) {
          t.targetedSites = [TARGETED_SITE];
        }
        const cmdConfig = {
          site: DEFAULT_SITE,
          only: t.only,
          config: { get: () => t.cfg },
          rc: { requireTarget: () => t.targetedSites },
        };

        if (t.wantErr) {
          expect(() => normalizedHostingConfigs(cmdConfig, { resolveTargets: true })).to.throw(
            FirebaseError,
            t.wantErr
          );
        } else {
          const got = normalizedHostingConfigs(cmdConfig, { resolveTargets: true });
          expect(got).to.deep.equal(t.want);
        }
      });
    }
  });

  describe("with an except parameter, resolving targets", () => {
    const DEFAULT_SITE = "default-hosting-site";
    const TARGETED_SITE = "targeted-site";
    const baseConfig = { public: "public", ignore: ["firebase.json"] };
    const tests = [
      {
        desc: "a normal hosting config, omitting the default site",
        cfg: Object.assign({}, baseConfig),
        except: `hosting:${DEFAULT_SITE}`,
        want: [],
      },
      {
        desc: "a hosting config with multiple sites, no targets, omitting the second site",
        cfg: [
          Object.assign({}, baseConfig, { site: DEFAULT_SITE }),
          Object.assign({}, baseConfig, { site: "different-site" }),
        ],
        except: `hosting:different-site`,
        want: [Object.assign({}, baseConfig, { site: DEFAULT_SITE })],
      },
      {
        desc: "a normal hosting config with a target, omitting the target",
        cfg: Object.assign({}, baseConfig, { target: "main" }),
        except: "hosting:main",
        want: [],
      },
      {
        desc: "a hosting config with multiple targets, omitting one",
        cfg: [
          Object.assign({}, baseConfig, { target: "t-one" }),
          Object.assign({}, baseConfig, { target: "t-two" }),
        ],
        except: "hosting:t-two",
        want: [Object.assign({}, baseConfig, { target: "t-one", site: TARGETED_SITE })],
      },
      {
        desc: "a hosting config with multiple targets, omitting all hosting",
        cfg: [
          Object.assign({}, baseConfig, { target: "t-one" }),
          Object.assign({}, baseConfig, { target: "t-two" }),
        ],
        except: "hosting",
        want: [],
      },
      {
        desc: "a hosting config with multiple targets, omitting an invalid target",
        cfg: [
          Object.assign({}, baseConfig, { target: "t-one" }),
          Object.assign({}, baseConfig, { target: "t-two" }),
        ],
        except: "hosting:t-three",
        want: [
          Object.assign({}, baseConfig, { target: "t-one", site: TARGETED_SITE }),
          Object.assign({}, baseConfig, { target: "t-two", site: TARGETED_SITE }),
        ],
      },
      {
        desc: "a hosting config with multiple targets, with multiple matching targets",
        cfg: [
          Object.assign({}, baseConfig, { target: "t-one" }),
          Object.assign({}, baseConfig, { target: "t-one" }),
          Object.assign({}, baseConfig, { target: "t-other" }),
        ],
        except: "hosting:t-other",
        targetedSites: [TARGETED_SITE, TARGETED_SITE],
        wantErr: /Hosting target.+t-one.+linked to multiple sites/,
      },
      {
        desc: "a hosting config with multiple sites but no targets, only all hosting",
        cfg: [Object.assign({}, baseConfig), Object.assign({}, baseConfig)],
        except: "hosting:site",
        wantErr: /Must supply either "site" or "target"/,
      },
    ];

    for (const t of tests) {
      it(`should be able to parse ${t.desc}`, () => {
        if (!Array.isArray(t.targetedSites)) {
          t.targetedSites = [TARGETED_SITE];
        }
        const cmdConfig = {
          site: DEFAULT_SITE,
          except: t.except,
          config: { get: () => t.cfg },
          rc: { requireTarget: () => t.targetedSites },
        };

        if (t.wantErr) {
          expect(() => normalizedHostingConfigs(cmdConfig, { resolveTargets: true })).to.throw(
            FirebaseError,
            t.wantErr
          );
        } else {
          const got = normalizedHostingConfigs(cmdConfig, { resolveTargets: true });
          expect(got).to.deep.equal(t.want);
        }
      });
    }
  });
});
