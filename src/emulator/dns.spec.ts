import { expect } from "chai";
import * as sinon from "sinon";
import { IPV4_LOOPBACK, IPV6_LOOPBACK, Resolver } from "./dns";

const IPV4_ADDR1 = { address: "169.254.20.1", family: 4 };
const IPV4_ADDR2 = { address: "169.254.20.2", family: 4 };
const IPV6_ADDR1 = { address: "fe80::1", family: 6 };
const IPV6_ADDR2 = { address: "fe80::2", family: 6 };

describe("Resolver", () => {
  describe("#lookupFirst", () => {
    it("should return the first value of result", async () => {
      const lookup = sinon.fake.resolves([IPV4_ADDR1, IPV4_ADDR2]);
      const resolver = new Resolver(lookup);
      await expect(resolver.lookupFirst("example.test")).to.eventually.eql(IPV4_ADDR1);
    });

    it("should prefer IPv4 addresss using the underlying lookup", async () => {
      const lookup = sinon.fake.resolves([IPV4_ADDR1, IPV4_ADDR2]);
      const resolver = new Resolver(lookup);
      await expect(resolver.lookupFirst("example.test")).to.eventually.eql(IPV4_ADDR1);
      expect(lookup).to.be.calledOnceWithExactly("example.test", sinon.match({ verbatim: false }));
    });

    it("should return cached result if available", async () => {
      const lookup = sinon.fake((hostname: string) => {
        return hostname === "example1.test" ? [IPV4_ADDR1, IPV6_ADDR1] : [IPV4_ADDR2, IPV6_ADDR2];
      });
      const resolver = new Resolver(lookup);
      await expect(resolver.lookupFirst("example1.test")).to.eventually.eql(IPV4_ADDR1);
      await expect(resolver.lookupFirst("example1.test")).to.eventually.eql(IPV4_ADDR1);
      expect(lookup).to.be.calledOnce; // the second call should not trigger lookup

      lookup.resetHistory();
      // A call with a different name should cause a cache miss.
      await expect(resolver.lookupFirst("example2.test")).to.eventually.eql(IPV4_ADDR2);
      expect(lookup).to.be.calledOnce;
    });

    it("should pre-populate localhost in cache to resolve to IPv4 loopback address", async () => {
      const lookup = sinon.fake.resolves([IPV4_ADDR1, IPV6_ADDR1]); // ignored
      const resolver = new Resolver(lookup);
      await expect(resolver.lookupFirst("localhost")).to.eventually.eql(IPV4_LOOPBACK);
      expect(lookup).not.to.be.called;
    });

    it("should parse and return IPv4 addresses without lookup", async () => {
      const lookup = sinon.fake.resolves([IPV4_ADDR1, IPV6_ADDR1]); // ignored
      const resolver = new Resolver(lookup);
      await expect(resolver.lookupFirst("127.0.0.1")).to.eventually.eql(IPV4_LOOPBACK);
      expect(lookup).not.to.be.called;
    });

    it("should parse and return IPv6 addresses without lookup", async () => {
      const lookup = sinon.fake.resolves([IPV4_ADDR1, IPV6_ADDR1]); // ignored
      const resolver = new Resolver(lookup);
      await expect(resolver.lookupFirst("::1")).to.eventually.eql(IPV6_LOOPBACK);
      expect(lookup).not.to.be.called;
    });
  });

  describe("#lookupAll", () => {
    it("should return all addresses returned", async () => {
      const lookup = sinon.fake.resolves([IPV4_ADDR1, IPV4_ADDR2]);
      const resolver = new Resolver(lookup);
      await expect(resolver.lookupAll("example.test")).to.eventually.eql([IPV4_ADDR1, IPV4_ADDR2]);
    });

    it("should request IPv4 addresses to be listed first using the underlying lookup", async () => {
      const lookup = sinon.fake.resolves([IPV4_ADDR1, IPV4_ADDR2]);
      const resolver = new Resolver(lookup);
      await expect(resolver.lookupAll("example.test")).to.eventually.eql([IPV4_ADDR1, IPV4_ADDR2]);
      expect(lookup).to.be.calledOnceWithExactly("example.test", sinon.match({ verbatim: false }));
    });

    it("should return cached results if available", async () => {
      const lookup = sinon.fake((hostname: string) => {
        return hostname === "example1.test" ? [IPV4_ADDR1, IPV6_ADDR1] : [IPV4_ADDR2, IPV6_ADDR2];
      });
      const resolver = new Resolver(lookup);
      await expect(resolver.lookupAll("example1.test")).to.eventually.eql([IPV4_ADDR1, IPV6_ADDR1]);
      await expect(resolver.lookupAll("example1.test")).to.eventually.eql([IPV4_ADDR1, IPV6_ADDR1]);
      expect(lookup).to.be.calledOnce; // the second call should not trigger lookup

      lookup.resetHistory();
      // A call with a different name should cause a cache miss.
      await expect(resolver.lookupAll("example2.test")).to.eventually.eql([IPV4_ADDR2, IPV6_ADDR2]);
      expect(lookup).to.be.calledOnce;
    });

    it("should pre-populate localhost in cache to resolve to IPv4 + IPv6 loopback addresses (in that order)", async () => {
      const lookup = sinon.fake.resolves([IPV4_ADDR1, IPV6_ADDR1]); // ignored
      const resolver = new Resolver(lookup);
      await expect(resolver.lookupAll("localhost")).to.eventually.eql([
        IPV4_LOOPBACK,
        IPV6_LOOPBACK,
      ]);
      expect(lookup).not.to.be.called;
    });
  });

  it("should parse and return IPv4 addresses without lookup", async () => {
    const lookup = sinon.fake.resolves([IPV4_ADDR1, IPV6_ADDR1]); // ignored
    const resolver = new Resolver(lookup);
    await expect(resolver.lookupAll("127.0.0.1")).to.eventually.eql([IPV4_LOOPBACK]);
    expect(lookup).not.to.be.called;
  });

  it("should parse and return IPv6 addresses without lookup", async () => {
    const lookup = sinon.fake.resolves([IPV4_ADDR1, IPV6_ADDR1]); // ignored
    const resolver = new Resolver(lookup);
    await expect(resolver.lookupAll("::1")).to.eventually.eql([IPV6_LOOPBACK]);
    expect(lookup).not.to.be.called;
  });
});
