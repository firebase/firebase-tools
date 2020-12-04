import { expect } from "chai";
import * as sinon from "sinon";

import * as extensionsApi from "../../extensions/extensionsApi";
import { listExtensions } from "../../extensions/listExtensions";

const MOCK_INSTANCES = [
  {
    name: "projects/my-test-proj/instances/image-resizer",
    createTime: "2019-05-19T00:20:10.416947Z",
    updateTime: "2019-05-19T00:20:10.416947Z",
    state: "ACTIVE",
    config: {
      name:
        "projects/my-test-proj/instances/image-resizer/configurations/95355951-397f-4821-a5c2-9c9788b2cc63",
      createTime: "2019-05-19T00:20:10.416947Z",
      source: {
        state: "ACTIVE",
        spec: {
          author: {
            authorName: "Firebase",
            url: "https://firebase.google.com",
          },
        },
      },
    },
  },
  {
    name: "projects/my-test-proj/instances/image-resizer-1",
    createTime: "2019-06-19T00:20:10.416947Z",
    updateTime: "2019-06-19T00:21:06.722782Z",
    state: "ACTIVE",
    config: {
      name:
        "projects/my-test-proj/instances/image-resizer-1/configurations/5b1fb749-764d-4bd1-af60-bb7f22d27860",
      createTime: "2019-06-19T00:21:06.722782Z",
    },
  },
];

const PROJECT_ID = "my-test-proj";

describe("listExtensions", () => {
  let listInstancesStub: sinon.SinonStub;

  beforeEach(() => {
    listInstancesStub = sinon.stub(extensionsApi, "listInstances");
  });

  afterEach(() => {
    listInstancesStub.restore();
  });

  it("should return an empty array if no extensions have been installed", async () => {
    listInstancesStub.returns(Promise.resolve([]));

    const result = await listExtensions(PROJECT_ID);

    expect(result).to.eql({ instances: [] });
  });

  it("should return a sorted array of extension instances", async () => {
    listInstancesStub.returns(Promise.resolve(MOCK_INSTANCES));

    const result = await listExtensions(PROJECT_ID);

    const expected = [
      {
        name: "projects/my-test-proj/instances/image-resizer-1",
        createTime: "2019-06-19T00:20:10.416947Z",
        updateTime: "2019-06-19T00:21:06.722782Z",
        state: "ACTIVE",
        config: {
          name:
            "projects/my-test-proj/instances/image-resizer-1/configurations/5b1fb749-764d-4bd1-af60-bb7f22d27860",
          createTime: "2019-06-19T00:21:06.722782Z",
        },
      },
      {
        name: "projects/my-test-proj/instances/image-resizer",
        createTime: "2019-05-19T00:20:10.416947Z",
        updateTime: "2019-05-19T00:20:10.416947Z",
        state: "ACTIVE",
        config: {
          name:
            "projects/my-test-proj/instances/image-resizer/configurations/95355951-397f-4821-a5c2-9c9788b2cc63",
          createTime: "2019-05-19T00:20:10.416947Z",
          source: {
            state: "ACTIVE",
            spec: {
              author: {
                authorName: "Firebase",
                url: "https://firebase.google.com",
              },
            },
          },
        },
      },
    ];
    expect(result).to.eql({ instances: expected });
  });
});
