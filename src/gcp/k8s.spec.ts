import { expect } from "chai";
import * as k8s from "./k8s";

describe("megabytes", () => {
  enum Bytes {
    KB = 1e3,
    MB = 1e6,
    GB = 1e9,
    KiB = 1 << 10,
    MiB = 1 << 20,
    GiB = 1 << 30,
  }

  it("Should handle decimal SI units", () => {
    expect(k8s.mebibytes("1000k")).to.equal((1000 * Bytes.KB) / Bytes.MiB);
    expect(k8s.mebibytes("1.5M")).to.equal((1.5 * Bytes.MB) / Bytes.MiB);
    expect(k8s.mebibytes("1G")).to.equal(Bytes.GB / Bytes.MiB);
  });

  it("Should handle binary SI units", () => {
    expect(k8s.mebibytes("1Mi")).to.equal(Bytes.MiB / Bytes.MiB);
    expect(k8s.mebibytes("1Gi")).to.equal(Bytes.GiB / Bytes.MiB);
  });

  it("Should handle no unit", () => {
    expect(k8s.mebibytes("100000")).to.equal(100000 / Bytes.MiB);
    expect(k8s.mebibytes("1e9")).to.equal(1e9 / Bytes.MiB);
    expect(k8s.mebibytes("1.5E6")).to.equal((1.5 * 1e6) / Bytes.MiB);
  });
});
