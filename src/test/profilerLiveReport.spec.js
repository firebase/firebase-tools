"use strict";

const _ = require("lodash");
const chai = require("chai");
const fs = require("fs");
const path = require("path");

const profileLiveReporter = require("../profileLiveReporter");

const expect = chai.expect;

const fixturesDir = path.resolve(__dirname, "./fixtures");

const testData = path.resolve(fixturesDir, "profiler-data/sample.json");

const linesOfData = fs.readFileSync(testData, "utf8").split("\n");

class FakeStream {
  constructor(isTTY, rows, columns) {
    this.buffer = "";
    this.x = 0;
    this.y = 0;
    this.isTTY = isTTY;
    if (isTTY) {
      this.rows = rows;
      this.columns = columns;
    }
  }
  write(chunk) {
    if (this.isTTY) {
      let lines = this.buffer.split("\n");

      // check for overwriting lines
      while (lines.length > this.y + 1) {
        lines.pop();
      }

      // check for filling blank lines
      while (lines.length < this.y + 1) {
        lines.push("");
      }
      lines[this.y] = lines[this.y].substr(0, this.x).padEnd(this.x);

      // append the written data
      lines = (lines.join("\n") + chunk).split("\n");

      // check for scrolling line off screen
      while (lines.length > this.rows) {
        lines.shift();
      }
      this.buffer = lines.join("\n");
      this.y = lines.length - 1;
      this.x = lines.pop().length;
    } else {
      this.buffer += chunk;
    }
  }
  cursorTo(x, y) {
    expect(this.isTTY).to.be.true;
    this.x = x;
    if (y !== undefined) {
      this.y = 0;
    }
  }
  clearScreenDown() {
    expect(this.isTTY).to.be.true;
    let lines = this.buffer.split("\n");
    while (lines.length > this.y) {
      lines.shift();
    }
    if (lines[this.y]) {
      lines[this.y] = "";
    }
    this.buffer = lines.join("\n");
  }
  clearLine() {
    expect(this.isTTY).to.be.true;
    let lines = this.buffer.split("\n");
    if (lines[this.y]) {
      lines[this.y] = "";
    }
    this.buffer = lines.join("\n");
  }
  $getBuffer() {
    return this.buffer;
  }
  $getLastLine() {
    return this.buffer.split("\n").pop();
  }
  $getNextToLastLine() {
    return this.buffer
      .split("\n")
      .slice(-2)
      .shift();
  }
  $getNumLines() {
    return this.buffer.split("\n").length;
  }
}

const CHUNKS = {
  read: [
    { name: "listener-listen", path: ["red", "green", "blue"] },
    { name: "listener-listen", path: ["red", "green", "blue"], bytes: 0 },
    { name: "listener-listen", path: ["red", "green", "blue"], bytes: 10 },
    { name: "listener-listen", path: ["red", "green", "blue"], bytes: 20 },
    { name: "listener-listen", path: ["red", "green", "blue"], bytes: 30 },
    { name: "listener-listen", path: ["red", "green", "blue"], bytes: 40 },
    { name: "listener-listen", path: ["red", "green", "blue"], bytes: 111 },
    { name: "listener-broadcast", path: ["red", "green", "blue"], bytes: 222 },
    { name: "rest-read", path: ["red", "green", "blue"], bytes: 444 },
  ],
  write: [
    { name: "realtime-write", path: ["red", "green", "blue"], bytes: 1111 },
    { name: "rest-write", path: ["red", "green", "blue"], bytes: 2222 },
    { name: "on-disconnect-put", path: ["red", "green", "blue"], bytes: 4444 },
  ],
  update: [
    { name: "realtime-update", path: ["red", "green", "blue"], bytes: 111 },
    { name: "rest-update", path: ["red", "green", "blue"], bytes: 222 },
    { name: "on-disconnect-update", path: ["red", "green", "blue"], bytes: 444 },
  ],
  txn: [
    { name: "realtime-transaction", path: ["red", "green", "blue"], bytes: 11 },
    { name: "rest-transaction", path: ["red", "green", "blue"], bytes: 22 },
  ],
};

describe("profilerLiveReporter", function() {
  const TEST_OPTIONS_LIST = [
    { isTTY: true, rows: 150, columns: 200 },
    { isTTY: false },
    { isTTY: true, liveMinSize: 25, rows: 150, columns: 200 },
    { isTTY: false, liveMinSize: 1000000 },
  ];

  for (const testOptions of TEST_OPTIONS_LIST) {
    const reportOptions = `tty=${testOptions.isTTY} liveMinSize=${testOptions.liveMinSize}`;
    it("should correctly generate live report " + reportOptions, function() {
      const stream = new FakeStream(testOptions.isTTY, testOptions.rows, testOptions.columns);
      const liveMinSize = testOptions.liveMinSize || 0;
      const options = { live: true };
      if (testOptions.liveMinSize) {
        options.liveMinSize = testOptions.liveMinSize.toString();
      }
      const reporter = new profileLiveReporter.LiveReporter(options, stream);
      let beforeLines;
      let afterLines;

      beforeLines = stream.$getNumLines();
      reporter.begin();
      afterLines = stream.$getNumLines();

      if (testOptions.isTTY) {
        expect(afterLines).to.be.above(beforeLines);
      } else {
        expect(afterLines).to.be.equal(beforeLines);
      }

      let totals = {
        read: 0,
        write: 0,
        update: 0,
        txn: 0,
      };

      for (const type of Object.keys(CHUNKS)) {
        const list = CHUNKS[type];
        for (const item of list) {
          const bytes = item.bytes || 0;
          const chunk = `event: log\ndata: ${JSON.stringify(item)}`;
          const chunkBuffer = Buffer.from(chunk, "utf8");

          totals[type] += bytes;

          beforeLines = stream.$getNumLines();
          reporter.processChunk(chunkBuffer);
          afterLines = stream.$getNumLines();

          const lastLine = stream.$getLastLine();
          const prevLine = stream.$getNextToLastLine();

          if (!_.isUndefined(item.bytes) && bytes >= liveMinSize) {
            expect(afterLines).to.be.above(beforeLines);
            expect(prevLine).to.contain(bytes.toString());
          } else {
            expect(afterLines).to.be.equal(beforeLines);
          }

          if (testOptions.isTTY) {
            expect(lastLine).to.be.not.empty;
            expect(lastLine).to.contain(`${type}=${totals[type]}`);
          } else {
            expect(lastLine).to.be.empty;
          }
        }
      }

      if (testOptions.isTTY) {
        stream.cursorTo(0, 0);
        stream.clearScreenDown();
        reporter.processKey("t");
        stream.clearLine();
        const screenText = stream.$getBuffer();
        for (const key of Object.keys(totals)) {
          expect(screenText).to.includes(`${totals[key]}`);
        }
      }

      reporter.end();
    });
  }

  it(`should correctly process sample data`, function() {
    const stream = new FakeStream(true, 50, 100);
    const reporter = new profileLiveReporter.LiveReporter({ live: true }, stream);

    reporter.begin();
    for (const line of linesOfData) {
      const chunk = `event: log\ndata: ${line}`;
      reporter.processChunk(chunk);
    }

    reporter.processKey("c");
    reporter.processKey("t");
    stream.clearLine(); // remove prompt totals
    const screenText = stream.$getBuffer();
    reporter.end();

    expect(screenText).to.match(/bytes written[^\n]*\b135\b/i); // 135 of total writes in profiler-data/sample.json
    expect(screenText).to.match(/bytes read[^\n]*\b6334876\b/i); // 6334876 of total writes in profiler-data/sample.json
    expect(screenText).to.match(/bytes updated[^\n]*\b0\b/i); // 0 of total writes in profiler-data/sample.json
  });

  it(`should correctly handle keyboard commands`, function() {
    const stream = new FakeStream(true, 50, 100);
    const reporter = new profileLiveReporter.LiveReporter({ live: true }, stream);

    reporter.begin();

    expect(stream.$getLastLine()).to.include("help");
    expect(stream.$getLastLine()).to.include("?");

    // help
    let beforeLines = stream.$getNumLines();
    reporter.processKey("?");
    let afterLines = stream.$getNumLines();

    expect(afterLines).to.be.above(beforeLines);
    stream.clearLine();
    expect(stream.$getBuffer()).to.match(/\bq\b.*quit/);
    expect(stream.$getBuffer()).to.match(/[?].*help/);
    expect(stream.$getBuffer()).to.match(/\br\b.*reset/);
    expect(stream.$getBuffer()).to.match(/\bz\b.*zero/);
    expect(stream.$getBuffer()).to.match(/\bc\b.*clear/);
    expect(stream.$getBuffer()).to.match(/\bt\b.*total/);

    let item = { name: "listener-listen", path: ["red", "green", "blue"], bytes: 123456789 };
    let chunk = `event: log\ndata: ${JSON.stringify(item)}`;
    let chunkBuffer = Buffer.from(chunk, "utf8");
    reporter.processChunk(chunkBuffer);

    item = { name: "on-disconnect-put", path: ["red", "green", "orange"], bytes: 8 };
    chunk = `event: log\ndata: ${JSON.stringify(item)}`;
    chunkBuffer = Buffer.from(chunk, "utf8");
    reporter.processChunk(chunkBuffer);

    expect(stream.$getBuffer()).to.include(item.bytes.toString());

    // clear
    beforeLines = stream.$getNumLines();
    reporter.processKey("c");
    afterLines = stream.$getNumLines();
    expect(beforeLines).to.be.above(afterLines);

    stream.clearLine();
    expect(stream.$getBuffer()).to.not.include(item.bytes.toString());

    // totals
    beforeLines = stream.$getNumLines();
    reporter.processKey("t");
    afterLines = stream.$getNumLines();
    expect(afterLines).to.be.above(beforeLines);

    stream.clearLine();
    expect(stream.$getBuffer()).to.include(item.bytes.toString());

    // reset
    beforeLines = stream.$getNumLines();
    reporter.processKey("r");
    afterLines = stream.$getNumLines();
    expect(beforeLines).to.be.above(afterLines);
    reporter.processKey("t");
    // make sure the total bytes was reset by looking at totals
    expect(stream.$getBuffer()).to.not.include(item.bytes.toString());

    // zero
    reporter.processChunk(chunkBuffer);
    reporter.processKey("c");
    reporter.processKey("t");
    stream.clearLine();
    expect(stream.$getBuffer()).to.include(item.bytes.toString());
    reporter.processKey("z");
    reporter.processKey("c");
    reporter.processKey("t");
    stream.clearLine();
    expect(stream.$getBuffer()).to.not.include(item.bytes.toString());

    // quit
    reporter.processChunk(chunkBuffer);
    reporter.processKey("c");
    expect(reporter.processKey("q")).to.equal(true);
    expect(stream.$getBuffer()).to.include(item.bytes.toString());
  });

  it(`should correctly handle small console/terminal windows`, function() {
    const stream = new FakeStream(true, 30, 30);
    const reporter = new profileLiveReporter.LiveReporter({ live: true }, stream);

    reporter.begin();

    let item = { name: "realtime-transaction", path: ["red", "green", "blue"], bytes: 55 };
    let chunk = `event: log\ndata: ${JSON.stringify(item)}`;
    let chunkBuffer = Buffer.from(chunk, "utf8");
    reporter.processChunk(chunkBuffer);

    item = { name: "on-disconnect-update", path: ["red", "green", "blue"], bytes: 55 };
    chunk = `event: log\ndata: ${JSON.stringify(item)}`;
    chunkBuffer = Buffer.from(chunk, "utf8");
    reporter.processChunk(chunkBuffer);

    reporter.processKey("h");
    reporter.processKey("t");

    const lastLine = stream.$getLastLine();
    reporter.end();

    expect(lastLine).to.match(/ o=/i);
    expect(lastLine).to.match(/ r=/i);
    expect(lastLine).to.match(/ w=/i);
    expect(lastLine).to.match(/ t=/i);
  });
});
