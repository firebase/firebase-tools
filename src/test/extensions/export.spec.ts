import { expect } from "chai";

import { parameterizeProject, setSecretParamsToLatest } from "../../extensions/export";
import { DeploymentInstanceSpec } from "../../deploy/extensions/planner";
import { ParamType } from "../../extensions/extensionsApi";

describe("ext:export helpers", () => {
  describe("parameterizeProject", () => {
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

        expect(parameterizeProject(TEST_PROJECT_ID, TEST_PROJECT_NUMBER, testSpec)).to.deep.equal({
          instanceId: testSpec.instanceId,
          params: t.expected,
        });
      });
    }
  });

  describe("setSecretVersionsToLatest", () => {
    const testSecretVersion = "projects/my-proj/secrets/secret-1/versions/3";
    const tests: {
      desc: string;
      params: Record<string, string>;
      expected: string;
    }[] = [
      {
        desc: "Should set active secrets to latest",
        params: { blah: testSecretVersion, notSecret: "something else" },
        expected: "projects/my-proj/secrets/secret-1/versions/latest",
      },
    ];
    for (const t of tests) {
      it(t.desc, async () => {
        const testSpec: DeploymentInstanceSpec = {
          instanceId: "my-instance",
          params: t.params,
          extensionVersion: {
            name: "test",
            ref: "test/test@0.1.0",
            state: "PUBLISHED",
            hash: "abc123",
            sourceDownloadUri: "test.com",
            spec: {
              name: "blah",
              version: "0.1.0",
              sourceUrl: "blah.com",
              resources: [],
              params: [
                {
                  param: "blah",
                  label: "blah",
                  type: ParamType.SECRET,
                },
                {
                  param: "notSecret",
                  label: "blah",
                },
              ],
            },
          },
        };

        const res = await setSecretParamsToLatest(testSpec);

        expect(res.params["blah"]).to.equal(t.expected);
        expect(res.params["notSecret"]).to.equal(t.params["notSecret"]);
      });
    }
  });
});
