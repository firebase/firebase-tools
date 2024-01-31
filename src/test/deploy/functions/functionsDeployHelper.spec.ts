import { expect } from "chai";

import * as backend from "../../../deploy/functions/backend";
import * as helper from "../../../deploy/functions/functionsDeployHelper";
import { Options } from "../../../options";
import { DEFAULT_CODEBASE, ValidatedConfig } from "../../../functions/projectConfig";
import {
  EndpointFilter,
  parseFunctionSelector,
} from "../../../deploy/functions/functionsDeployHelper";

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
          codebase: "my-codebase",
          idChunks: ["group", "subgroup", "func"],
        }),
      ).to.be.true;
      expect(
        helper.endpointMatchesFilter(func, {
          ...BASE_FILTER,
          codebase: "my-codebase",
          idChunks: ["group", "subgroup"],
        }),
      ).to.be.true;
      expect(helper.endpointMatchesFilter(func, { ...BASE_FILTER, idChunks: ["group"] })).to.be
        .true;
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
      expected: EndpointFilter[];
    }

    const testcases: Testcase[] = [
      {
        desc: "parses selector without codebase",
        selector: "func",
        expected: [
          {
            codebase: DEFAULT_CODEBASE,
            idChunks: ["func"],
          },
          {
            codebase: "func",
          },
        ],
      },
      {
        desc: "parses group selector (with '.') without codebase",
        selector: "g1.func",
        expected: [
          {
            codebase: DEFAULT_CODEBASE,
            idChunks: ["g1", "func"],
          },
          {
            codebase: "g1.func",
          },
        ],
      },
      {
        desc: "parses group selector (with '-') without codebase",
        selector: "g1-func",
        expected: [
          {
            codebase: DEFAULT_CODEBASE,
            idChunks: ["g1", "func"],
          },
          {
            codebase: "g1-func",
          },
        ],
      },
      {
        desc: "parses group selector (with '-') with codebase",
        selector: "node:g1-func",
        expected: [
          {
            codebase: "node",
            idChunks: ["g1", "func"],
          },
        ],
      },
    ];

    for (const tc of testcases) {
      it(tc.desc, () => {
        const actual = parseFunctionSelector(tc.selector);

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
            codebase: "myFunc",
          },
          {
            codebase: DEFAULT_CODEBASE,
            idChunks: ["myOtherFunc"],
          },
          {
            codebase: "myOtherFunc",
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
          {
            codebase: "groupA.myFunc",
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

        const actual = helper.getEndpointFilters(options);

        expect(actual?.length).to.equal(tc.expected.length);
        expect(actual).to.deep.include.members(tc.expected);
      });
    }

    it("returns undefined given no only option", () => {
      expect(helper.getEndpointFilters({})).to.be.undefined;
    });

    it("returns undefined given no functions selector", () => {
      expect(helper.getEndpointFilters({ only: "hosting:siteA,storage:bucketB" })).to.be.undefined;
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
});
