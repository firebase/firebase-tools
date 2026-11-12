import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";

import { Command } from "../command";
import { FirebaseError } from "../error";
import * as prompt from "../prompt";
import {
  CrashlyticsCommandOptions,
  CrashlyticsFilterCommandOptions,
  parseEventFilters,
  parsePositiveIntOption,
  requireAppId,
  withEventFilterOptions,
  writeOutputFileIfRequested,
} from "./commandUtils";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("crashlytics commandUtils", () => {
  const androidAppId = "1:1234567890:android:abcdef1234567890";
  const webAppId = "1:1234567890:web:abcdef1234567890";

  afterEach(() => {
    sinon.restore();
  });

  describe("requireAppId", () => {
    it("should return trimmed appId when provided", () => {
      const options = { app: `  ${androidAppId}  ` } as CrashlyticsCommandOptions;
      expect(requireAppId(options)).to.equal(androidAppId);
    });

    it("should throw FirebaseError when appId is missing or blank", () => {
      expect(() => requireAppId({} as CrashlyticsCommandOptions)).to.throw(
        FirebaseError,
        "Must specify '--app <appId>'",
      );
      expect(() => requireAppId({ app: "   " } as CrashlyticsCommandOptions)).to.throw(
        FirebaseError,
        "Must specify '--app <appId>'",
      );
    });
  });

  describe("parsePositiveIntOption", () => {
    it("should return defaultValue when value is undefined or empty", () => {
      expect(parsePositiveIntOption(undefined, "--limit", { defaultValue: 10 })).to.equal(10);
      expect(parsePositiveIntOption("", "--limit", { defaultValue: 10 })).to.equal(10);
    });

    it("should parse valid positive integer strings and numbers", () => {
      expect(parsePositiveIntOption("5", "--limit", { defaultValue: 10, max: 100 })).to.equal(5);
      expect(parsePositiveIntOption(25, "--limit", { defaultValue: 10, max: 100 })).to.equal(25);
    });

    it("should throw FirebaseError for non-integers, zero, negative numbers, or values above max", () => {
      expect(() => parsePositiveIntOption("abc", "--limit", { defaultValue: 10 })).to.throw(
        FirebaseError,
        "'--limit' must be a positive integer.",
      );
      expect(() => parsePositiveIntOption("0", "--limit", { defaultValue: 10 })).to.throw(
        FirebaseError,
        "'--limit' must be a positive integer.",
      );
      expect(() => parsePositiveIntOption("-3", "--limit", { defaultValue: 10 })).to.throw(
        FirebaseError,
        "'--limit' must be a positive integer.",
      );
      expect(() =>
        parsePositiveIntOption("101", "--limit", { defaultValue: 10, max: 100 }),
      ).to.throw(FirebaseError, "'--limit' must be between 1 and 100.");
    });
  });

  describe("writeOutputFileIfRequested", () => {
    it("should return false when output option is not set", async () => {
      const wrote = await writeOutputFileIfRequested({ ok: true }, {} as CrashlyticsCommandOptions);
      expect(wrote).to.be.false;
    });

    it("should write formatted JSON without prompting when file does not exist", async () => {
      sinon.stub(fs, "existsSync").returns(false);
      const writeStub = sinon.stub(fs, "outputFileSync");
      const confirmStub = sinon.stub(prompt, "confirm");

      const wrote = await writeOutputFileIfRequested({ id: "123" }, {
        output: "/tmp/out.json",
      } as CrashlyticsCommandOptions);

      expect(wrote).to.be.true;
      expect(confirmStub.called).to.be.false;
      expect(writeStub.calledOnceWithExactly("/tmp/out.json", '{\n  "id": "123"\n}\n', "utf8")).to
        .be.true;
    });

    it("should prompt when file exists and write if confirmed", async () => {
      sinon.stub(fs, "existsSync").returns(true);
      const writeStub = sinon.stub(fs, "outputFileSync");
      const confirmStub = sinon.stub(prompt, "confirm").resolves(true);

      const wrote = await writeOutputFileIfRequested({ id: "123" }, {
        output: "/tmp/out.json",
        force: true,
        nonInteractive: false,
      } as CrashlyticsCommandOptions);

      expect(wrote).to.be.true;
      expect(confirmStub.calledOnce).to.be.true;
      expect(writeStub.calledOnce).to.be.true;
    });

    it("should not write file when overwrite prompt is declined", async () => {
      sinon.stub(fs, "existsSync").returns(true);
      const writeStub = sinon.stub(fs, "outputFileSync");
      sinon.stub(prompt, "confirm").resolves(false);

      const wrote = await writeOutputFileIfRequested({ id: "123" }, {
        output: "/tmp/out.json",
      } as CrashlyticsCommandOptions);

      expect(wrote).to.be.true;
      expect(writeStub.called).to.be.false;
    });

    it("should create missing parent directories for --output", async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crashlytics-out-"));
      try {
        const outputPath = path.join(dir, "nested", "out.json");
        const wrote = await writeOutputFileIfRequested({ ok: true }, {
          output: outputPath,
        } as CrashlyticsCommandOptions);
        expect(wrote).to.be.true;
        expect(JSON.parse(fs.readFileSync(outputPath, "utf8"))).to.deep.equal({ ok: true });
      } finally {
        fs.removeSync(dir);
      }
    });

    it("should throw a FirebaseError when the output file cannot be written", async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crashlytics-out-"));
      try {
        const blocker = path.join(dir, "not-a-dir");
        fs.writeFileSync(blocker, "x"); // a file where a directory is expected -> ENOTDIR
        await expect(
          writeOutputFileIfRequested({ ok: true }, {
            output: path.join(blocker, "out.json"),
          } as CrashlyticsCommandOptions),
        ).to.be.rejectedWith(FirebaseError, "Failed to write output to");
      } finally {
        fs.removeSync(dir);
      }
    });
  });

  describe("withEventFilterOptions and parseEventFilters", () => {
    it("should register filter options on a Command instance", () => {
      const cmd = withEventFilterOptions(new Command("crashlytics:events:list"));
      expect(cmd).to.be.instanceOf(Command);
    });

    it("should parse comma-separated filter flags into an EventFilter", () => {
      const options = {
        issueId: "issue_1",
        variantId: "variant_1",
        versions: "1.0.0 (100), 2.0.0 (200)",
        errorTypes: "FATAL, NON_FATAL",
        signals: "SIGNAL_FRESH,SIGNAL_REGRESSED",
        osNames: "Android (14)",
        deviceNames: "Google (Pixel 8)",
        deviceFormFactors: "PHONE, TABLET",
      } as CrashlyticsFilterCommandOptions;

      const filter = parseEventFilters(options, androidAppId);
      expect(filter).to.deep.equal({
        intervalStartTime: undefined,
        intervalEndTime: undefined,
        versionDisplayNames: ["1.0.0 (100)", "2.0.0 (200)"],
        issueId: "issue_1",
        issueVariantId: "variant_1",
        issueErrorTypes: ["FATAL", "NON_FATAL"],
        issueSignals: ["SIGNAL_FRESH", "SIGNAL_REGRESSED"],
        operatingSystemDisplayNames: ["Android (14)"],
        deviceDisplayNames: ["Google (Pixel 8)"],
        deviceFormFactors: ["PHONE", "TABLET"],
        browserFilterDisplayNames: undefined,
      });
    });

    it("should parse web filter flags including browser names", () => {
      const filter = parseEventFilters(
        {
          versions: "2.4.0, 2.4.1",
          browserNames: "Chrome (123), Firefox (120)",
        } as CrashlyticsFilterCommandOptions,
        webAppId,
      );
      expect(filter?.versionDisplayNames).to.deep.equal(["2.4.0", "2.4.1"]);
      expect(filter?.browserFilterDisplayNames).to.deep.equal(["Chrome (123)", "Firefox (120)"]);
    });

    it("should throw FirebaseError on invalid enum values", () => {
      expect(() =>
        parseEventFilters(
          { errorTypes: "FATAL,INVALID_TYPE" } as CrashlyticsFilterCommandOptions,
          androidAppId,
        ),
      ).to.throw(FirebaseError, "Invalid value 'INVALID_TYPE' for '--error-types'");

      expect(() =>
        parseEventFilters(
          { signals: "SIGNAL_UNKNOWN" } as CrashlyticsFilterCommandOptions,
          androidAppId,
        ),
      ).to.throw(FirebaseError, "Invalid value 'SIGNAL_UNKNOWN' for '--signals'");

      expect(() =>
        parseEventFilters(
          { deviceFormFactors: "LAPTOP" } as CrashlyticsFilterCommandOptions,
          androidAppId,
        ),
      ).to.throw(FirebaseError, "Invalid value 'LAPTOP' for '--device-form-factors'");
    });

    it("should include topVersions displayName hint when mobile version is missing build number", () => {
      expect(() =>
        parseEventFilters({ versions: "2.4.0" } as CrashlyticsFilterCommandOptions, androidAppId),
      ).to.throw(
        FirebaseError,
        `--versions must match pattern 'version (build)'. Use the displayName values from the topVersions report (e.g. "2.4.0 (240)").`,
      );
    });

    it("should allow plain version strings for web apps", () => {
      const filter = parseEventFilters(
        { versions: "2.4.0, 2.4.1" } as CrashlyticsFilterCommandOptions,
        webAppId,
      );
      expect(filter?.versionDisplayNames).to.deep.equal(["2.4.0", "2.4.1"]);
    });

    it("should reject mobile-only flags for web apps", () => {
      expect(() =>
        parseEventFilters(
          { signals: "SIGNAL_FRESH" } as CrashlyticsFilterCommandOptions,
          "1:1234567890:web:abcdef",
        ),
      ).to.throw(FirebaseError, "--signals is only supported for Android and Apple apps");

      expect(() =>
        parseEventFilters(
          {
            variantId: "v1",
            deviceNames: "Google (Pixel 8)",
            deviceFormFactors: "PHONE",
          } as CrashlyticsFilterCommandOptions,
          "1:1234567890:web:abcdef",
        ),
      ).to.throw(
        FirebaseError,
        "--variant-id, --device-names, --device-form-factors are only supported for Android and Apple apps",
      );
    });

    it("should reject web-only flags for mobile apps", () => {
      expect(() =>
        parseEventFilters(
          { browserNames: "Chrome (123)" } as CrashlyticsFilterCommandOptions,
          "1:1234567890:android:abcdef",
        ),
      ).to.throw(FirebaseError, "--browser-names is only supported for web apps");

      expect(() =>
        parseEventFilters(
          { browserNames: "Safari (17)" } as CrashlyticsFilterCommandOptions,
          "1:1234567890:ios:abcdef",
        ),
      ).to.throw(FirebaseError, "--browser-names is only supported for web apps");
    });

    it("should allow platform-specific flags when appId platform is unknown", () => {
      const filter = parseEventFilters(
        {
          signals: "SIGNAL_FRESH",
          browserNames: "Chrome (123)",
        } as CrashlyticsFilterCommandOptions,
        "1:1234567890:macos:abcdef",
      );
      expect(filter?.issueSignals).to.deep.equal(["SIGNAL_FRESH"]);
      expect(filter?.browserFilterDisplayNames).to.deep.equal(["Chrome (123)"]);
    });

    it("should translate validator field names to CLI flag names", () => {
      expect(() =>
        parseEventFilters(
          { deviceNames: "Pixel 8" } as CrashlyticsFilterCommandOptions,
          androidAppId,
        ),
      ).to.throw(FirebaseError, "--device-names must match pattern 'manufacturer (device)'");

      expect(() =>
        parseEventFilters(
          { osNames: "Android 14" } as CrashlyticsFilterCommandOptions,
          androidAppId,
        ),
      ).to.throw(FirebaseError, "--os-names must match pattern 'os (version)'");
    });

    describe("time flags", () => {
      const daysAgo = (n: number): Date => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
      const recentDate = daysAgo(2).toISOString().slice(0, 10); // YYYY-MM-DD

      it("should reject non-ISO values with a format hint", () => {
        for (const startTime of ["10", "11/01/2026", "2026-11-01T08:00:00"]) {
          expect(() =>
            parseEventFilters({ startTime } as CrashlyticsFilterCommandOptions, androidAppId),
          ).to.throw(
            FirebaseError,
            `Invalid --start-time '${startTime}'. Use an ISO 8601 date or timestamp`,
          );
        }
        expect(() =>
          parseEventFilters(
            { endTime: "2026-11-01T08:00:00" } as CrashlyticsFilterCommandOptions,
            androidAppId,
          ),
        ).to.throw(
          FirebaseError,
          "Invalid --end-time '2026-11-01T08:00:00'. Use an ISO 8601 date or timestamp",
        );
      });

      it("should normalize date-only and offset timestamps to UTC", () => {
        const filter = parseEventFilters(
          {
            startTime: recentDate,
            endTime: `${recentDate}T08:00:00-07:00`,
          } as CrashlyticsFilterCommandOptions,
          androidAppId,
        );
        expect(filter?.intervalStartTime).to.equal(`${recentDate}T00:00:00.000Z`);
        expect(filter?.intervalEndTime).to.equal(`${recentDate}T15:00:00.000Z`);
      });

      it("should reject --start-time after or equal to --end-time", () => {
        expect(() =>
          parseEventFilters(
            {
              startTime: daysAgo(1).toISOString(),
              endTime: daysAgo(2).toISOString(),
            } as CrashlyticsFilterCommandOptions,
            androidAppId,
          ),
        ).to.throw(FirebaseError, "'--start-time' must be before '--end-time'.");

        expect(() =>
          parseEventFilters(
            {
              startTime: recentDate,
              endTime: `${recentDate}T00:00:00Z`,
            } as CrashlyticsFilterCommandOptions,
            androidAppId,
          ),
        ).to.throw(FirebaseError, "'--start-time' must be before '--end-time'.");
      });

      it("should use flag names in the 90-day error", () => {
        expect(() =>
          parseEventFilters(
            { startTime: daysAgo(120).toISOString() } as CrashlyticsFilterCommandOptions,
            androidAppId,
          ),
        ).to.throw(FirebaseError, "'--start-time' must be within the last 90 days");
      });

      it("should require --start-time when --end-time is set", () => {
        expect(() =>
          parseEventFilters(
            { endTime: daysAgo(1).toISOString() } as CrashlyticsFilterCommandOptions,
            androidAppId,
          ),
        ).to.throw(FirebaseError, "'--end-time' requires '--start-time'.");
      });
    });
  });
});
