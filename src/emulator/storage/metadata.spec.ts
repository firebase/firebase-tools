import { expect } from "chai";
import { toSerializedDate } from "./metadata";

describe("toSerializedDate", () => {
  it("correctly serializes date", () => {
    const testDate = new Date("2022-01-01T00:00:00.000Z");

    expect(toSerializedDate(testDate)).to.equal("2022-01-01T00:00:00.000Z");
  });
  it("correctly serializes date with different timezone", () => {
    const testDate = new Date("2022-01-01T00:00:00.000+07:00");

    expect(toSerializedDate(testDate)).to.equal("2021-12-31T17:00:00.000Z");
  });
});
