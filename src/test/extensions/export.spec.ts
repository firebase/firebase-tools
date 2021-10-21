import { expect } from "chai";

import { parameterizeProjectId } from "../../extensions/export";

describe("ext:export helpers", () => {
  describe("parameterizeProjectId", () => {
    const TEST_PROJECT_ID = "test-project";
    const TEST_PROJECT_NUMBER = "123456789";
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
        desc: "should strip projectNumber",
        in: {
          param1: TEST_PROJECT_NUMBER,
          param2: `projects/${TEST_PROJECT_NUMBER}/secrets/my-secret/versions/1`,
        },
        expected: {
          param1: "${param:PROJECT_NUMBER}",
          param2: "projects/${param:PROJECT_NUMBER}/secrets/my-secret/versions/1",
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

        expect(parameterizeProjectId(TEST_PROJECT_ID, TEST_PROJECT_NUMBER, testSpec)).to.deep.equal(
          {
            instanceId: testSpec.instanceId,
            params: t.expected,
          }
        );
      });
    }
  });
});
