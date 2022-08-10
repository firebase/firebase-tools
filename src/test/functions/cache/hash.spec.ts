import { expect } from "chai";
import { getLocalHash } from "../../../deploy/functions/cache/hash";
import * as backend from "../../../deploy/functions/backend";
import { resolve } from "path";

const EMPTY_WANT_BACKEND = {
  requiredAPIs: [],
  environmentVariables: {},
  endpoints: {},
} as backend.Backend;

// eslint-disable-next-line @typescript-eslint/require-await
describe("getLocalHash", () => {
  it("should return different hash given different files", async (done) => {
    const file1 = resolve("./mockdata/function_source_v1.txt");
    const file2 = resolve("./mockdata/function_source_v2.txt");

    const source1 = { functionsSourceV1: file1 };
    const source2 = { functionsSourceV1: file2 };

    const hash1 = await getLocalHash(source1, EMPTY_WANT_BACKEND);
    const hash2 = await getLocalHash(source2, EMPTY_WANT_BACKEND);

    expect(hash1).to.not.equal(hash2);
    done();
  });

  it("should return the same hash given the same file", async (done) => {
    const file1 = resolve("./mockdata/function_source_v1.txt");
    const file2 = resolve("./mockdata/function_source_v1.txt");

    const source1 = { functionsSourceV1: file1 };
    const source2 = { functionsSourceV1: file2 };

    const hash1 = await getLocalHash(source1, EMPTY_WANT_BACKEND);
    const hash2 = await getLocalHash(source2, EMPTY_WANT_BACKEND);

    expect(hash1).to.equal(hash2);
    done();
  });

  // TODO(tystark) test case for secret versions
  // TODO(tystark) test case for env variables
});
