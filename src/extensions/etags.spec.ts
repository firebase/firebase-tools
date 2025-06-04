import { expect } from "chai";

import * as etags from "./etags";
import * as rc from "../rc";

const TEST_PROJECT = "test-project";

function dummyRc(etagMap: Record<string, string>) {
  return new rc.RC(undefined, {
    etags: {
      "test-project": {
        extensionInstances: etagMap,
      },
    },
  });
}

function extensionInstanceHelper(instanceId: string, etag?: string) {
  const ret = {
    instanceId,
    etag,
  };
  return ret;
}

describe("detectEtagChanges", () => {
  const testCases: {
    desc: string;
    rc: rc.RC;
    instances: { instanceId: string; etag?: string }[];
    expected: string[];
  }[] = [
    {
      desc: "should not detect changes if there is no previously saved etags",
      rc: dummyRc({}),
      instances: [extensionInstanceHelper("test", "abc123")],
      expected: [],
    },
    {
      desc: "should detect changes if a new instance was installed out of band",
      rc: dummyRc({ test: "abc123" }),
      instances: [
        extensionInstanceHelper("test", "abc123"),
        extensionInstanceHelper("test2", "def456"),
      ],
      expected: ["test2"],
    },
    {
      desc: "should detect changes if an instance was changed out of band",
      rc: dummyRc({ test: "abc123" }),
      instances: [extensionInstanceHelper("test", "def546")],
      expected: ["test"],
    },
    {
      desc: "should detect changes if an instance was deleted out of band",
      rc: dummyRc({ test: "abc123" }),
      instances: [],
      expected: ["test"],
    },
  ];
  for (const tc of testCases) {
    it(tc.desc, () => {
      const result = etags.detectEtagChanges(tc.rc, TEST_PROJECT, tc.instances);
      expect(result).to.have.same.members(tc.expected);
    });
  }
});
