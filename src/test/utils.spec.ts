import { expect } from "chai";
import * as sinon from "sinon";

import * as utils from "../utils";

describe("utils", () => {
  describe("consoleUrl", () => {
    it("should create a console URL", () => {
      expect(utils.consoleUrl("projectId", "/foo/bar")).to.equal(
        "https://console.firebase.google.com/project/projectId/foo/bar",
      );
    });
  });

  describe("getInheritedOption", () => {
    it("should chain up looking for a key", () => {
      const o1 = {};
      const o2 = { parent: o1, foo: "bar" };
      const o3 = { parent: o2, bar: "foo" };
      const o4 = { parent: o3, baz: "zip" };

      expect(utils.getInheritedOption(o4, "foo")).to.equal("bar");
    });

    it("should return undefined if the key does not exist", () => {
      const o1 = {};
      const o2 = { parent: o1, foo: "bar" };
      const o3 = { parent: o2, bar: "foo" };
      const o4 = { parent: o3, baz: "zip" };

      expect(utils.getInheritedOption(o4, "zip")).to.equal(undefined);
    });
  });

  describe("envOverride", () => {
    it("should return the value if no current value exists", () => {
      expect(utils.envOverride("FOOBARBAZ", "notset")).to.equal("notset");
    });

    it("should set an override if it conflicts", () => {
      process.env.FOO_BAR_BAZ = "set";

      expect(utils.envOverride("FOO_BAR_BAZ", "notset")).to.equal("set");
      expect(utils.envOverrides).to.contain("FOO_BAR_BAZ");

      delete process.env.FOO_BAR_BAZ;
    });

    it("should coerce the value", () => {
      process.env.FOO_BAR_BAZ = "set";

      expect(utils.envOverride("FOO_BAR_BAZ", "notset", (s) => s.split(""))).to.deep.equal([
        "s",
        "e",
        "t",
      ]);

      delete process.env.FOO_BAR_BAZ;
    });

    it("should return provided value if coerce fails", () => {
      process.env.FOO_BAR_BAZ = "set";

      const coerce = () => {
        throw new Error();
      };
      expect(utils.envOverride("FOO_BAR_BAZ", "notset", coerce)).to.deep.equal("notset");

      delete process.env.FOO_BAR_BAZ;
    });
  });

  describe("isCloudEnvironment", () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should return false by default", () => {
      expect(utils.isCloudEnvironment()).to.be.false;
    });

    it("should return true when in codespaces", () => {
      process.env.CODESPACES = "true";
      expect(utils.isCloudEnvironment()).to.be.true;
    });

    it("should return true when in Cloud Workstations", () => {
      process.env.GOOGLE_CLOUD_WORKSTATIONS = "true";
      expect(utils.isCloudEnvironment()).to.be.true;
    });
  });

  describe("getDatabaseUrl", () => {
    it("should create a url for prod", () => {
      expect(utils.getDatabaseUrl("https://firebaseio.com", "fir-proj", "/")).to.equal(
        "https://fir-proj.firebaseio.com/",
      );
      expect(utils.getDatabaseUrl("https://firebaseio.com", "fir-proj", "/foo/bar")).to.equal(
        "https://fir-proj.firebaseio.com/foo/bar",
      );
      expect(utils.getDatabaseUrl("https://firebaseio.com", "fir-proj", "/foo/bar.json")).to.equal(
        "https://fir-proj.firebaseio.com/foo/bar.json",
      );
      expect(
        utils.getDatabaseUrl(
          "https://some-namespace.europe-west1.firebasedatabase.app",
          "some-namespace",
          "/foo/bar.json",
        ),
      ).to.equal("https://some-namespace.europe-west1.firebasedatabase.app/foo/bar.json");
      expect(
        utils.getDatabaseUrl(
          "https://europe-west1.firebasedatabase.app",
          "some-namespace",
          "/foo/bar.json",
        ),
      ).to.equal("https://some-namespace.europe-west1.firebasedatabase.app/foo/bar.json");
    });

    it("should create a url for the emulator", () => {
      expect(utils.getDatabaseUrl("http://localhost:9000", "fir-proj", "/")).to.equal(
        "http://localhost:9000/?ns=fir-proj",
      );
      expect(utils.getDatabaseUrl("http://localhost:9000", "fir-proj", "/foo/bar")).to.equal(
        "http://localhost:9000/foo/bar?ns=fir-proj",
      );
      expect(utils.getDatabaseUrl("http://localhost:9000", "fir-proj", "/foo/bar.json")).to.equal(
        "http://localhost:9000/foo/bar.json?ns=fir-proj",
      );
    });
  });

  describe("getDatabaseViewDataUrl", () => {
    it("should get a view data url for legacy prod URL", () => {
      expect(
        utils.getDatabaseViewDataUrl("https://firebaseio.com", "fir-proj", "fir-ns", "/foo/bar"),
      ).to.equal(
        "https://console.firebase.google.com/project/fir-proj/database/fir-ns/data/foo/bar",
      );
    });

    it("should get a view data url for new prod URL", () => {
      expect(
        utils.getDatabaseViewDataUrl(
          "https://firebasedatabase.app",
          "fir-proj",
          "fir-ns",
          "/foo/bar",
        ),
      ).to.equal(
        "https://console.firebase.google.com/project/fir-proj/database/fir-ns/data/foo/bar",
      );
    });

    it("should get a view data url for the emulator", () => {
      expect(
        utils.getDatabaseViewDataUrl("http://localhost:9000", "fir-proj", "fir-ns", "/foo/bar"),
      ).to.equal("http://localhost:9000/foo/bar.json?ns=fir-ns");
    });
  });

  describe("addDatabaseNamespace", () => {
    it("should add the namespace for prod", () => {
      expect(utils.addDatabaseNamespace("https://firebaseio.com/", "fir-proj")).to.equal(
        "https://fir-proj.firebaseio.com/",
      );
      expect(utils.addDatabaseNamespace("https://firebaseio.com/foo/bar", "fir-proj")).to.equal(
        "https://fir-proj.firebaseio.com/foo/bar",
      );
    });

    it("should add the namespace for the emulator", () => {
      expect(utils.addDatabaseNamespace("http://localhost:9000/", "fir-proj")).to.equal(
        "http://localhost:9000/?ns=fir-proj",
      );
      expect(utils.addDatabaseNamespace("http://localhost:9000/foo/bar", "fir-proj")).to.equal(
        "http://localhost:9000/foo/bar?ns=fir-proj",
      );
    });
  });

  describe("addSubdomain", () => {
    it("should add a subdomain", () => {
      expect(utils.addSubdomain("https://example.com", "sub")).to.equal("https://sub.example.com");
    });
  });

  describe("endpoint", () => {
    it("should join our strings", () => {
      expect(utils.endpoint(["foo", "bar"])).to.equal("/foo/bar");
    });
  });

  describe("promiseAllSettled", () => {
    it("should settle all promises", async () => {
      const result = await utils.promiseAllSettled([
        Promise.resolve("foo"),
        Promise.reject("bar"),
        Promise.resolve("baz"),
      ]);
      expect(result).to.deep.equal([
        { state: "fulfilled", value: "foo" },
        { state: "rejected", reason: "bar" },
        { state: "fulfilled", value: "baz" },
      ]);
    });
  });

  describe("promiseProps", () => {
    it("should resolve all promises", async () => {
      const o = {
        foo: new Promise((resolve) => {
          setTimeout(() => {
            resolve("1");
          });
        }),
        bar: Promise.resolve("2"),
      };

      const result = await utils.promiseProps(o);
      expect(result).to.deep.equal({
        foo: "1",
        bar: "2",
      });
    });

    it("should pass through objects", async () => {
      const o = {
        foo: new Promise((resolve) => {
          setTimeout(() => {
            resolve("1");
          });
        }),
        bar: ["bar"],
      };

      const result = await utils.promiseProps(o);
      expect(result).to.deep.equal({
        foo: "1",
        bar: ["bar"],
      });
    });

    it("should reject if a promise rejects", async () => {
      const o = {
        foo: new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error("1"));
          });
        }),
        bar: Promise.resolve("2"),
      };

      return expect(utils.promiseProps(o)).to.eventually.be.rejected;
    });
  });

  describe("datetimeString", () => {
    it("should output the date in the correct format", () => {
      // Don't worry about the hour since timezones screw everything up.
      expect(utils.datetimeString(new Date("February 22, 2020 11:35:45-07:00"))).to.match(
        /^2020-02-22 \d\d:35:45$/,
      );
      expect(utils.datetimeString(new Date("February 7, 2020 11:35:45-07:00"))).to.match(
        /^2020-02-07 \d\d:35:45$/,
      );
      expect(utils.datetimeString(new Date("February 7, 2020 8:01:01-07:00"))).to.match(
        /^2020-02-07 \d\d:01:01$/,
      );
    });
  });

  describe("streamToString/stringToStream", () => {
    it("should be able to create and read streams", async () => {
      const stream = utils.stringToStream("hello world");
      if (!stream) {
        throw new Error("stream came back undefined");
      }
      await expect(utils.streamToString(stream)).to.eventually.equal("hello world");
    });
  });

  describe("allSettled", () => {
    it("handles arrays of length zero", async () => {
      const res = await utils.allSettled([]);
      expect(res).to.deep.equal([]);
    });

    it("handles a simple success", async () => {
      const res = await utils.allSettled([Promise.resolve(42)]);
      expect(res).to.deep.equal([
        {
          status: "fulfilled",
          value: 42,
        },
      ]);
    });

    it("handles a simple failure", async () => {
      const res = await utils.allSettled([Promise.reject(new Error("oh noes!"))]);
      expect(res.length).to.equal(1);
      expect(res[0].status).to.equal("rejected");
      expect((res[0] as utils.PromiseRejectedResult).reason).to.be.instanceOf(Error);
      expect((res[0] as any).reason?.message).to.equal("oh noes!");
    });

    it("waits for all settled", async () => {
      // Intetionally failing with a non-error to make matching easier
      const reject = Promise.reject("fail fast");
      const resolve = new Promise((res) => {
        setTimeout(() => res(42), 20);
      });

      const results = await utils.allSettled([reject, resolve]);
      expect(results).to.deep.equal([
        { status: "rejected", reason: "fail fast" },
        { status: "fulfilled", value: 42 },
      ]);
    });
  });

  describe("groupBy", () => {
    it("should transform simple array by fn", () => {
      const arr = [3.4, 1.2, 7.7, 2, 3.9];
      expect(utils.groupBy(arr, Math.floor)).to.deep.equal({
        1: [1.2],
        2: [2],
        3: [3.4, 3.9],
        7: [7.7],
      });
    });

    it("should transform array of objects by fn", () => {
      const arr = [
        { id: 1, location: "us" },
        { id: 2, location: "us" },
        { id: 3, location: "asia" },
        { id: 4, location: "europe" },
        { id: 5, location: "asia" },
      ];
      expect(utils.groupBy(arr, (obj) => obj.location)).to.deep.equal({
        us: [
          { id: 1, location: "us" },
          { id: 2, location: "us" },
        ],
        asia: [
          { id: 3, location: "asia" },
          { id: 5, location: "asia" },
        ],
        europe: [{ id: 4, location: "europe" }],
      });
    });
  });

  describe("withTimeout", () => {
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
      clock = sinon.useFakeTimers();
      clock.reset();
    });

    afterEach(() => {
      clock.restore();
    });

    it("should fulfill if the original promise fulfills within timeout", async () => {
      const promise = new Promise((resolve) => {
        setTimeout(() => resolve("foo"), 1000);
      });
      const wrapped = utils.withTimeout(5000, promise);

      clock.tick(1001);
      await expect(wrapped).to.eventually.equal("foo");
    });

    it("should reject if the original promise rejects within timeout", async () => {
      const promise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("oh snap")), 1000);
      });
      const wrapped = utils.withTimeout(5000, promise);

      clock.tick(1001);
      await expect(wrapped).to.be.rejectedWith("oh snap");
    });

    it("should reject with timeout if the original promise takes too long to fulfill", async () => {
      const promise = new Promise((resolve) => {
        setTimeout(() => resolve(42), 1000);
      });
      const wrapped = utils.withTimeout(5000, promise);

      clock.tick(5001);
      await expect(wrapped).to.be.rejectedWith("Timed out.");
    });

    it("should reject with timeout if the original promise takes too long to reject", async () => {
      const promise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("oh snap")), 10000);
      });
      const wrapped = utils.withTimeout(5000, promise);

      clock.tick(5001);
      await expect(wrapped).to.be.rejectedWith("Timed out.");
    });
  });

  describe("debounce", () => {
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
      clock = sinon.useFakeTimers();
    });

    afterEach(() => {
      clock.restore();
    });

    it("should be called only once in the given time interval", () => {
      const fn = sinon.stub();
      const debounced = utils.debounce(fn, 1000);

      for (let i = 0; i < 100; i++) {
        debounced(i);
      }

      clock.tick(1001);
      expect(fn).to.be.calledOnce;
      expect(fn).to.be.calledOnceWith(99);
    });

    it("should be called only once if it is called many times within the interval", () => {
      const fn = sinon.stub();
      const debounced = utils.debounce(fn, 1000);

      for (let i = 0; i < 100; i++) {
        debounced(i);
        clock.tick(999);
      }

      clock.tick(1001);
      expect(fn).to.be.calledOnce;
      expect(fn).to.be.calledOnceWith(99);
    });

    it("should be called only once within the interval if leading is provided", () => {
      const fn = sinon.stub();
      const debounced = utils.debounce(fn, 1000, { leading: true });

      for (let i = 0; i < 100; i++) {
        debounced(i);
      }

      clock.tick(999);
      expect(fn).to.be.calledOnce;
      expect(fn).to.be.calledOnceWith(0);
    });

    it("should be called twice with leading", () => {
      const fn = sinon.stub();
      const debounced = utils.debounce(fn, 1000, { leading: true });

      for (let i = 0; i < 100; i++) {
        debounced(i);
      }

      clock.tick(1500);
      expect(fn).to.be.calledTwice;
      expect(fn).to.be.calledWith(0);
      expect(fn).to.be.calledWith(99);
    });
  });

  describe("connnectableHostname", () => {
    it("should change wildcard IP addresses to corresponding loopbacks", () => {
      expect(utils.connectableHostname("0.0.0.0")).to.equal("127.0.0.1");
      expect(utils.connectableHostname("::")).to.equal("::1");
      expect(utils.connectableHostname("[::]")).to.equal("[::1]");
    });
    it("should not change non-wildcard IP addresses or hostnames", () => {
      expect(utils.connectableHostname("169.254.20.1")).to.equal("169.254.20.1");
      expect(utils.connectableHostname("fe80::1")).to.equal("fe80::1");
      expect(utils.connectableHostname("[fe80::2]")).to.equal("[fe80::2]");
      expect(utils.connectableHostname("example.com")).to.equal("example.com");
    });
  });
});
