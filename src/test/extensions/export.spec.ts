import { expect } from "chai";
import * as sinon from "sinon";

import { parameterizeProject, setSecretParamsToLatest } from "../../extensions/export";
import { InstanceSpec } from "../../deploy/extensions/planner";
import * as secretUtils from "../../extensions/secretsUtils";

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
    let getManagedSecretsStub: sinon.SinonStub;

    beforeEach(() => {
      getManagedSecretsStub = sinon.stub(secretUtils, "getManagedSecrets");
    });

    afterEach(() => {
      getManagedSecretsStub.restore();
    });
    const testSecretVersion = "projects/my-proj/secrets/secret-1/versions/3";
    const tests: {
      desc: string;
      managedSecrets: string[];
      expected: string;
    }[] = [
      {
        desc: "Should set managed secrets to latest",
        managedSecrets: [testSecretVersion],
        expected: "projects/my-proj/secrets/secret-1/versions/latest",
      },
      {
        desc: "Should not change other secrets that are not managed",
        managedSecrets: [],
        expected: "projects/my-proj/secrets/secret-1/versions/3",
      },
    ];
    for (const t of tests) {
      it(t.desc, async () => {
        const testSpec: InstanceSpec = {
          instanceId: "my-instance",
          params: { blah: testSecretVersion },
          extensionVersion: {
            name: "test",
            ref: "test/test@0.1.0",
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
                },
              ],
            },
          },
        };
        getManagedSecretsStub.resolves(t.managedSecrets);

        const res = await setSecretParamsToLatest(testSpec);

        expect(res.params["blah"]).to.equal(t.expected);
      });
    }
  });
});
