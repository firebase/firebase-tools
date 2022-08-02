import { expect } from "chai";
import { toSerializedDate } from "../../../emulator/storage/metadata";

describe("toSerializedDate", () => {
  it("correctly serializes date", () => {
    const testDate = new Date("2022-01-01T00:00:00.000Z");

    expect(toSerializedDate(testDate)).to.equal("2022-01-01T00:00:00.000Z");
  });
});
