import { expect } from "chai";

import { stripProjectId } from "../../extensions/export";

describe("ext:export helpers", () => {
  describe("stripProjectId", () => {
    const TEST_PROJECT_ID = "test-project";
    const tests: {
      desc: string;
      in: Record<string, string>;
      expected: Record<string, string>;
    }[] = [
      {
        desc: "should strip projectId",
        in: {
          param1: TEST_PROJECT_ID,
          param2: `${TEST_PROJECT_ID}.appspot.com`,
        },
        expected: {
          param1: "${param:PROJECT_ID}",
          param2: "${param:PROJECT_ID}.appspot.com",
        },
      },
      {
        desc: "should not affect other params",
        in: {
          param1: "A param",
          param2: `Another param`,
        },
        expected: {
          param1: "A param",
          param2: `Another param`,
        },
      },
    ];
    for (const t of tests) {
      it(t.desc, () => {
        const testSpec = {
          instanceId: "my-instance",
          params: t.in,
        };

        expect(stripProjectId(TEST_PROJECT_ID, testSpec)).to.deep.equal({
          instanceId: testSpec.instanceId,
          params: t.expected,
        });
      });
    }
  });
});
