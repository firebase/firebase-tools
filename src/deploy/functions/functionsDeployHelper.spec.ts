import { expect } from "chai";

import * as backend from "./backend";
import * as helper from "./functionsDeployHelper";
import { Options } from "../../options";
import { DEFAULT_CODEBASE, ValidatedConfig } from "../../functions/projectConfig";
import { EndpointFilter, parseFunctionSelector } from "./functionsDeployHelper";
import * as experiments from "../../experiments";

describe("functionsDeployHelper", () => {
  const ENDPOINT: backend.Endpoint = {
    id: "foo",
    platform: "gcfv1",
    project: "project",
    region: "us-central1",
    runtime: "nodejs16",
    entryPoint: "function",
    httpsTrigger: {},
    codebase: DEFAULT_CODEBASE,
  };

  const BASE_FILTER = {
    codebase: DEFAULT_CODEBASE,
  };

  const TEST_CONFIG: ValidatedConfig = [
    { source: "functions", codebase: DEFAULT_CODEBASE },
  ] as ValidatedConfig;

  describe("endpointMatchesFilter", () => {
    it("should match empty filter", () => {
      const func = { ...ENDPOINT, id: "id" };
      expect(helper.endpointMatchesFilter(func, { ...BASE_FILTER, idChunks: [] })).to.be.true;
    });

    it("should match full names", () => {
      const func = { ...ENDPOINT, id: "id" };
      expect(helper.endpointMatchesFilter(func, { ...BASE_FILTER, idChunks: ["id"] })).to.be.true;
    });

    it("should match group prefixes", () => {
      const func = { ...ENDPOINT, id: "group-subgroup-func" };
      expect(
        helper.endpointMatchesFilter(func, {
          ...BASE_FILTER,
          idChunks: ["group", "subgroup", "func"],
        }),
      ).to.be.true;
      expect(
        helper.endpointMatchesFilter(func, {
          ...BASE_FILTER,
          idChunks: ["group", "subgroup"],
        }),
      ).to.be.true;
      expect(helper.endpointMatchesFilter(func, { ...BASE_FILTER, idChunks: ["group"] })).to.be
        .true;
    });

    it("should not match function that id that don't match", () => {
      const func = { ...ENDPOINT, id: "id" };
      expect(helper.endpointMatchesFilter(func, { ...BASE_FILTER, idChunks: ["group"] })).to.be
        .false;
    });

    it("should not match function in different codebase", () => {
      const func = { ...ENDPOINT, id: "group-subgroup-func" };

      expect(
        helper.endpointMatchesFilter(func, {
          ...BASE_FILTER,
          codebase: "another-codebase",
          idChunks: ["group", "subgroup", "func"],
        }),
      ).to.be.false;
      expect(
        helper.endpointMatchesFilter(func, {
          ...BASE_FILTER,
          codebase: "another-codebase",
          idChunks: ["group", "subgroup"],
        }),
      ).to.be.false;
      expect(
        helper.endpointMatchesFilter(func, {
          ...BASE_FILTER,
          codebase: "another-codebase",
          idChunks: ["group"],
        }),
      ).to.be.false;
    });

    it("should match function if backend's codebase is undefined", () => {
      const func = { ...ENDPOINT, id: "group-subgroup-func" };
      delete func.codebase;

      expect(
        helper.endpointMatchesFilter(func, {
          ...BASE_FILTER,
          codebase: DEFAULT_CODEBASE,
          idChunks: ["group", "subgroup", "func"],
        }),
      ).to.be.true;
      expect(
        helper.endpointMatchesFilter(func, {
          ...BASE_FILTER,
          codebase: DEFAULT_CODEBASE,
          idChunks: ["group", "subgroup"],
        }),
      ).to.be.true;
      expect(helper.endpointMatchesFilter(func, { ...BASE_FILTER, idChunks: ["group"] })).to.be
        .true;
      expect(
        helper.endpointMatchesFilter(func, {
          ...BASE_FILTER,
          codebase: "non-default-codebase",
          idChunks: ["group", "subgroup", "func"],
        }),
      ).to.be.false;
    });

    it("should match function matching ids given no codebase", () => {
      const func = { ...ENDPOINT, id: "group-subgroup-func" };

      expect(
        helper.endpointMatchesFilter(func, {
          ...BASE_FILTER,
          codebase: undefined,
          idChunks: ["group", "subgroup", "func"],
        }),
      ).to.be.true;
      expect(
        helper.endpointMatchesFilter(func, {
          ...BASE_FILTER,
          codebase: undefined,
          idChunks: ["group", "subgroup"],
        }),
      ).to.be.true;
      expect(
        helper.endpointMatchesFilter(func, {
          ...BASE_FILTER,
          codebase: undefined,
          idChunks: ["group"],
        }),
      ).to.be.true;
    });

    it("should match all functions in a codebase when idChunks is not provided", () => {
      const func1 = { ...ENDPOINT, id: "func1", codebase: "my-codebase" };
      const func2 = { ...ENDPOINT, id: "func2", codebase: "my-codebase" };
      const otherFunc = { ...ENDPOINT, id: "func3", codebase: "other-codebase" };
      const undefinedFunc = { ...ENDPOINT, id: "func4", codebase: undefined };

      const filter: EndpointFilter = { codebase: "my-codebase" };
      expect(helper.endpointMatchesFilter(func1, filter)).to.be.true;
      expect(helper.endpointMatchesFilter(func2, filter)).to.be.true;
      expect(helper.endpointMatchesFilter(otherFunc, filter)).to.be.false;
      expect(helper.endpointMatchesFilter(undefinedFunc, filter)).to.be.false;
    });

    it("should match a specific function in a specific codebase when multiple codebases have functions with the same name", () => {
      const funcInCodebaseA = { ...ENDPOINT, id: "foo", codebase: "codebaseA" };
      const funcInCodebaseB = { ...ENDPOINT, id: "foo", codebase: "codebaseB" };

      const filter: EndpointFilter = {
        codebase: "codebaseA",
        idChunks: ["foo"],
      };

      expect(helper.endpointMatchesFilter(funcInCodebaseA, filter)).to.be.true;
      expect(helper.endpointMatchesFilter(funcInCodebaseB, filter)).to.be.false;
    });

    it("should not match overlapping codebase names", () => {
      const instance1Func = { ...ENDPOINT, id: "foo", codebase: "kit-firestore-to-bigquery" };
      const instance2Func = { ...ENDPOINT, id: "foo", codebase: "kit-firestore-to-bigquery-abcd" };

      const filter: EndpointFilter = {
        codebase: "kit-firestore-to-bigquery",
      };

      expect(helper.endpointMatchesFilter(instance1Func, filter)).to.be.true;
      expect(helper.endpointMatchesFilter(instance2Func, filter)).to.be.false;
    });

    it("should not match functions with overlapping word prefixes", () => {
      const appFunc = { ...ENDPOINT, id: "app-render" };
      const appleFunc = { ...ENDPOINT, id: "apple-pay" };

      const filter: EndpointFilter = {
        codebase: DEFAULT_CODEBASE,
        idChunks: ["app"],
      };

      expect(helper.endpointMatchesFilter(appFunc, filter)).to.be.true;
      expect(helper.endpointMatchesFilter(appleFunc, filter)).to.be.false;
    });
  });

  describe("endpointMatchesAnyFilters", () => {
    it("should match given no filters", () => {
      const func = { ...ENDPOINT, id: "id" };
      expect(helper.endpointMatchesAnyFilter(func)).to.be.true;
    });

    it("should match against one filter", () => {
      const func = { ...ENDPOINT, id: "id" };
      expect(
        helper.endpointMatchesAnyFilter(func, [
          { ...BASE_FILTER, idChunks: ["id"] },
          { ...BASE_FILTER, idChunks: ["group"] },
        ]),
      ).to.be.true;
    });

    it("should exclude functions that don't match", () => {
      const func = { ...ENDPOINT, id: "id" };
      expect(
        helper.endpointMatchesAnyFilter(func, [
          { ...BASE_FILTER, idChunks: ["group"] },
          { ...BASE_FILTER, idChunks: ["other-group"] },
        ]),
      ).to.be.false;
    });
  });

  describe("parseFunctionSelector", () => {
    interface Testcase {
      desc: string;
      selector: string;
      config: ValidatedConfig;
      expected: EndpointFilter[];
    }

    const testcases: Testcase[] = [
      {
        desc: "parses selector without codebase (not a codebase name)",
        selector: "func",
        config: [{ source: "functions", codebase: DEFAULT_CODEBASE }] as ValidatedConfig,
        expected: [
          {
            codebase: DEFAULT_CODEBASE,
            idChunks: ["func"],
          },
        ],
      },
      {
        desc: "parses selector without codebase (matches codebase name)",
        selector: "func",
        config: [
          { source: "functions", codebase: DEFAULT_CODEBASE },
          { source: "other", codebase: "func" },
        ] as ValidatedConfig,
        expected: [
          {
            codebase: "func",
          },
        ],
      },
      {
        desc: "parses group selector (with '.') without codebase",
        selector: "g1.func",
        config: [{ source: "functions", codebase: DEFAULT_CODEBASE }] as ValidatedConfig,
        expected: [
          {
            codebase: DEFAULT_CODEBASE,
            idChunks: ["g1", "func"],
          },
        ],
      },
      {
        desc: "parses group selector (with '-') without codebase",
        selector: "g1-func",
        config: [{ source: "functions", codebase: DEFAULT_CODEBASE }] as ValidatedConfig,
        expected: [
          {
            codebase: DEFAULT_CODEBASE,
            idChunks: ["g1", "func"],
          },
        ],
      },
      {
        desc: "parses group selector (with '-') with codebase",
        selector: "node:g1-func",
        config: [{ source: "functions", codebase: DEFAULT_CODEBASE }] as ValidatedConfig,
        expected: [
          {
            codebase: "node",
            idChunks: ["g1", "func"],
          },
        ],
      },
      {
        desc: "parses codebase-qualified selector (codebase:func)",
        selector: "codebaseA:foo",
        config: [
          { source: "functions", codebase: "codebaseA" },
          { source: "other", codebase: "codebaseB" },
        ] as ValidatedConfig,
        expected: [
          {
            codebase: "codebaseA",
            idChunks: ["foo"],
          },
        ],
      },
    ];

    for (const tc of testcases) {
      it(tc.desc, () => {
        const actual = parseFunctionSelector(tc.selector, tc.config);

        expect(actual.length).to.equal(tc.expected.length);
        expect(actual).to.deep.include.members(tc.expected);
      });
    }
  });

  describe("getEndpointFilters", () => {
    interface Testcase {
      desc: string;
      only: string;
      expected: EndpointFilter[];
    }

    const testcases: Testcase[] = [
      {
        desc: "should parse multiple selectors",
        only: "functions:myFunc,functions:myOtherFunc",
        expected: [
          {
            codebase: DEFAULT_CODEBASE,
            idChunks: ["myFunc"],
          },
          {
            codebase: DEFAULT_CODEBASE,
            idChunks: ["myOtherFunc"],
          },
        ],
      },
      {
        desc: "should parse nested selector",
        only: "functions:groupA.myFunc",
        expected: [
          {
            codebase: DEFAULT_CODEBASE,
            idChunks: ["groupA", "myFunc"],
          },
        ],
      },
      {
        desc: "should parse selector with codebase",
        only: "functions:my-codebase:myFunc,functions:another-codebase:anotherFunc",
        expected: [
          {
            codebase: "my-codebase",
            idChunks: ["myFunc"],
          },
          {
            codebase: "another-codebase",
            idChunks: ["anotherFunc"],
          },
        ],
      },
      {
        desc: "should parse nested selector with codebase",
        only: "functions:my-codebase:groupA.myFunc",
        expected: [
          {
            codebase: "my-codebase",
            idChunks: ["groupA", "myFunc"],
          },
        ],
      },
    ];

    for (const tc of testcases) {
      it(tc.desc, () => {
        const options = {
          only: tc.only,
        } as Options;

        const actual = helper.getEndpointFilters(options, TEST_CONFIG);

        expect(actual?.length).to.equal(tc.expected.length);
        expect(actual).to.deep.include.members(tc.expected);
      });
    }

    it("returns undefined given no only option", () => {
      expect(helper.getEndpointFilters({}, TEST_CONFIG)).to.be.undefined;
    });

    it("returns undefined given no functions selector", () => {
      expect(helper.getEndpointFilters({ only: "hosting:siteA,storage:bucketB" }, TEST_CONFIG)).to
        .be.undefined;
    });

    it("should create codebase filter when selector matches kit instance ID", () => {
      experiments.setEnabled("kits", true);
      const config = [
        {
          kit: "my-kit",
          source: "kits/my-kit",
          instances: { "inst-1": "cfg1", "inst-2": "cfg2" },
        },
      ] as ValidatedConfig;

      const filters = helper.getEndpointFilters({ only: "functions:inst-1" }, config);
      expect(filters).to.deep.equal([{ codebase: "inst-1" }]);
      experiments.setEnabled("kits", null);
    });

    it("should create only codebase filter when selector matches codebase name", () => {
      const config: ValidatedConfig = [
        { source: "functions", codebase: DEFAULT_CODEBASE },
        { source: "other-functions", codebase: "other" },
      ] as ValidatedConfig;

      const options = {
        only: "functions:other",
      } as Options;

      const actual = helper.getEndpointFilters(options, config);

      expect(actual).to.deep.equal([{ codebase: "other" }]);
    });

    it("should create default codebase filter when selector does not match codebase name", () => {
      const config: ValidatedConfig = [
        { source: "functions", codebase: DEFAULT_CODEBASE },
        { source: "python-functions", codebase: "python" },
      ] as ValidatedConfig;

      const options = {
        only: "functions:other",
      } as Options;

      const actual = helper.getEndpointFilters(options, config);

      expect(actual?.length).to.equal(1);
      expect(actual).to.deep.equal([{ codebase: DEFAULT_CODEBASE, idChunks: ["other"] }]);
    });
  });

  describe("targetCodebases", () => {
    const config: ValidatedConfig = [
      {
        source: "foo",
        codebase: "default",
      },
      {
        source: "bar",
        codebase: "foobar",
      },
    ];

    it("returns all codebases in firebase.json with empty filters", () => {
      expect(helper.targetCodebases(config)).to.have.members(["default", "foobar"]);
    });

    it("returns only codebases included in the filters", () => {
      const filters: EndpointFilter[] = [
        {
          codebase: "default",
        },
      ];
      expect(helper.targetCodebases(config, filters)).to.have.members(["default"]);
    });

    it("correctly deals with duplicate entries", () => {
      const filters: EndpointFilter[] = [
        {
          codebase: "default",
        },
        {
          codebase: "default",
        },
      ];
      expect(helper.targetCodebases(config, filters)).to.have.members(["default"]);
    });

    it("returns all codebases given filter without codebase specified", () => {
      const filters: EndpointFilter[] = [
        {
          idChunks: ["foo", "bar"],
        },
      ];
      expect(helper.targetCodebases(config, filters)).to.have.members(["default", "foobar"]);
    });

    it("returns kit instance IDs as targeted codebases", () => {
      experiments.setEnabled("kits", true);
      const kitConfig: ValidatedConfig = [
        {
          kit: "my-kit",
          source: "kits/my-kit",
          instances: { "inst-1": "c1", "inst-2": "c2" },
        } as ValidatedConfig[number],
        {
          source: "foo",
          codebase: "default",
        },
      ];
      const filters: EndpointFilter[] = [{ codebase: "inst-1" }];
      expect(helper.targetCodebases(kitConfig, filters)).to.have.members(["inst-1"]);
      experiments.setEnabled("kits", null);
    });
  });

  describe("groupEndpointsByCodebase", () => {
    function endpointsOf(b: backend.Backend): string[] {
      return backend.allEndpoints(b).map((e) => backend.functionName(e));
    }

    it("groups codebase using codebase property", () => {
      const wantBackends: Record<string, backend.Backend> = {
        default: backend.of(
          { ...ENDPOINT, id: "default-0", codebase: "default" },
          { ...ENDPOINT, id: "default-1", codebase: "default" },
        ),
        cb: backend.of(
          { ...ENDPOINT, id: "cb-0", codebase: "cb" },
          { ...ENDPOINT, id: "cb-1", codebase: "cb" },
        ),
      };
      const haveBackend = backend.of(
        { ...ENDPOINT, id: "default-0", codebase: "default" },
        { ...ENDPOINT, id: "default-1", codebase: "default" },
        { ...ENDPOINT, id: "cb-0", codebase: "cb" },
        { ...ENDPOINT, id: "cb-1", codebase: "cb" },
        { ...ENDPOINT, id: "orphan", codebase: "orphan" },
      );

      const got = helper.groupEndpointsByCodebase(wantBackends, backend.allEndpoints(haveBackend));
      for (const codebase of Object.keys(got)) {
        expect(endpointsOf(got[codebase])).to.have.members(endpointsOf(wantBackends[codebase]));
      }
    });

    it("claims endpoint with matching name regardless of codebase property", () => {
      const wantBackends: Record<string, backend.Backend> = {
        default: backend.of(
          { ...ENDPOINT, id: "default-0", codebase: "default" },
          { ...ENDPOINT, id: "default-1", codebase: "default" },
        ),
        cb: backend.of(
          { ...ENDPOINT, id: "cb-0", codebase: "cb" },
          { ...ENDPOINT, id: "cb-1", codebase: "cb" },
        ),
      };
      let haveBackend = backend.of(
        { ...ENDPOINT, id: "default-0", codebase: "cb" },
        { ...ENDPOINT, id: "default-1", codebase: "cb" },
        { ...ENDPOINT, id: "cb-0", codebase: "cb" },
        { ...ENDPOINT, id: "cb-1", codebase: "cb" },
        { ...ENDPOINT, id: "orphan", codebase: "orphan" },
      );

      let got = helper.groupEndpointsByCodebase(wantBackends, backend.allEndpoints(haveBackend));
      for (const codebase of Object.keys(got)) {
        expect(endpointsOf(got[codebase])).to.have.members(endpointsOf(wantBackends[codebase]));
      }

      // Do it again, this time labeling with default codebase to make sure that arbitrary ordering does not matter.
      haveBackend = backend.of(
        { ...ENDPOINT, id: "default-0", codebase: "default" },
        { ...ENDPOINT, id: "default-1", codebase: "default" },
        { ...ENDPOINT, id: "cb-0", codebase: "default" },
        { ...ENDPOINT, id: "cb-1", codebase: "default" },
        { ...ENDPOINT, id: "orphan", codebase: "orphan" },
      );
      got = helper.groupEndpointsByCodebase(wantBackends, backend.allEndpoints(haveBackend));
      for (const codebase of Object.keys(got)) {
        expect(endpointsOf(got[codebase])).to.have.members(endpointsOf(wantBackends[codebase]));
      }
    });
  });

  describe("parseDeleteFilters", () => {
    it("should return codebase filter when target matches an active codebase", () => {
      const result = helper.parseDeleteFilters(["myCodebase"], ["default", "myCodebase"]);
      expect(result).to.deep.equal([{ codebase: "myCodebase" }]);
    });

    it("should strip default codebase restriction for unqualified function name so it matches globally", () => {
      const result = helper.parseDeleteFilters(["myFunc"], ["default", "myCodebase"]);
      expect(result).to.deep.equal([{ idChunks: ["myFunc"] }]);
    });

    it("should retain codebase restriction when explicitly qualified with colon", () => {
      const result = helper.parseDeleteFilters(["default:myFunc"], ["default", "myCodebase"]);
      expect(result).to.deep.equal([{ codebase: "default", idChunks: ["myFunc"] }]);
    });
  });

  describe("detectCodebaseAndIdCollisions", () => {
    const ep1: backend.Endpoint = {
      ...ENDPOINT,
      id: "api",
      codebase: "default",
    };
    const ep2: backend.Endpoint = {
      ...ENDPOINT,
      id: "api-func",
      codebase: "python-cb",
    };

    it("should detect exact ID collision between codebase name and endpoint id", () => {
      const collisions = helper.detectCodebaseAndIdCollisions(["api"], ["default", "api"], [ep1]);
      expect(collisions).to.have.lengthOf(1);
      expect(collisions[0]).to.deep.include({
        filter: "api",
        codebase: "default",
        workaroundCommand: "firebase functions:delete default:api",
      });
    });

    it("should detect group prefix collision between codebase name and endpoint id", () => {
      const collisions = helper.detectCodebaseAndIdCollisions(
        ["api"],
        ["default", "api", "python-cb"],
        [ep2],
      );
      expect(collisions).to.have.lengthOf(1);
      expect(collisions[0]).to.deep.include({
        filter: "api",
        codebase: "python-cb",
        workaroundCommand: "firebase functions:delete python-cb:api",
      });
    });

    it("should return empty when filter is qualified with colon", () => {
      const collisions = helper.detectCodebaseAndIdCollisions(
        ["default:api"],
        ["default", "api"],
        [ep1],
      );
      expect(collisions).to.be.empty;
    });

    it("should return empty when filter is not an active codebase", () => {
      const collisions = helper.detectCodebaseAndIdCollisions(["nonCodebase"], ["default"], [ep1]);
      expect(collisions).to.be.empty;
    });
  });
});
