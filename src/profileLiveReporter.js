"use strict";

const chalk = require("chalk");

const INSTRUCTION = "q=stop, ?=help";
const SIZE_LEN = Math.pow(2, 32).toString().length; // decimal digits to hold up to 4 GB
const NAME_MAP = {
  "listener-listen": ["READ value", "green", "read"],
  "listener-broadcast": ["READ update", "green", "read"],

  "realtime-write": ["WRITE", "cyan", "write"],
  "realtime-update": ["UPDATE", "yellow", "update"],
  "realtime-transaction": ["TRANSACTION", "magenta", "txn"],

  "rest-read": ["REST-READ", "green", "read"],
  "rest-write": ["REST-WRITE", "cyan", "write"],
  "rest-update": ["REST-UPDATE", "yellow", "update"],
  "rest-transaction": ["REST-TXN", "magenta", "txn"],

  "on-disconnect-put": ["DISC-WRITE", "red", "write"],
  "on-disconnect-update": ["DISC-UPDATE", "red", "update"],
};
const NAME_LEN = Object.values(NAME_MAP).reduce((max, x) => Math.max(x[0].length, max), 0);

/** @class */
class LiveReporter {
  /**
   * @param {object} [options]
   * @param {string} [options.liveMinSize] - ascii decimal number of min bytes to display detail
   * @param {boolean} [options.raw] - profile in raw mode
   * @param {WriteStream} [consoleStream] - stream for output
   */
  constructor(options, consoleStream) {
    this.stream = consoleStream || process.stdout;
    this.options = Object.assign({}, options || {});
    this.minDataSize = parseInt("0" + this.options.liveMinSize, 10);
    this.resetStats();
    this.buffer = "";
  }

  resetStats() {
    this.liveStats = {
      ops: 0,
      unparsable: 0,
      read: 0,
      write: 0,
      update: 0,
      txn: 0,
    };
  }

  begin() {
    this.displayHeaders();
    this.displayPrompt();
  }

  displayHeaders() {
    let line = "";
    if (this.stream.isTTY) {
      let headers = "Data Bytes".padStart(SIZE_LEN) + " ";
      headers += "I/O Type".padEnd(NAME_LEN) + " " + "PATH\n";
      this.stream.write(chalk.bold(headers));
      line += "".padEnd(SIZE_LEN, "=") + " ";
      line += "".padEnd(NAME_LEN, "=") + " ";
      line += "".padEnd(this.stream.columns - SIZE_LEN - NAME_LEN - 3, "=") + "\n";
      this.stream.write(line);
    }
  }

  /**
   * @param {Buffer} chunk - assume chunks can have a partial line or multiple lines
   */
  processChunk(chunk) {
    const lines = (this.buffer + chunk.toString()).split("\n");
    while (lines.length) {
      if (!lines[0].includes("{") && lines.length > 1) {
        // ignore complete lines that have no JSON object
        lines.shift();
      } else if (this.reportRecord(lines[0])) {
        lines.shift();
      } else {
        if (lines.length > 1) {
          // ignore complete lines that had unparsable JSON
          this.liveStats.unparsable++;
          lines.shift();
        } else {
          this.buffer = lines.join("\n");
          return;
        }
      }
    }
    this.buffer = "";
  }

  /**
   * @param {string} line
   * @return {boolean} true if line was consumed
   */
  reportRecord(line) {
    try {
      // clean off anything before the first open brace
      const cleaned = line.replace(/[^{]*?\{/, "{");
      const data = JSON.parse(cleaned);
      // flush the buffer since the parse succeeded
      this.buffer = "";
      const item = NAME_MAP[data.name || ""];
      if (data && item) {
        const bytes = data.bytes || 0;
        this.liveStats.ops++;
        this.liveStats[item[2]] += bytes;
        if (bytes >= this.minDataSize) {
          const size = data.bytes.toString().padStart(SIZE_LEN, " ");
          const op = item[0].padEnd(NAME_LEN, " ");
          const path = data.path && data.path.join("/");
          let line = `${size} ${op} ${path}`;
          if (this.stream.isTTY) {
            const columns = this.stream.columns;
            if (columns && line.length >= columns) {
              line = line.substr(0, columns - 2) + "…";
            }
            this.stream.clearLine();
          }
          // oput record
          this.stream.write(chalk[item[1]](line) + "\n");
        }
        this.displayPrompt();
      }
    } catch (e) {
      // must not have complete JSON record yet, report buffered data size
      this.displayPrompt();
      return false;
    }
    return true;
  }

  displayPrompt() {
    if (this.stream.isTTY) {
      this.stream.clearLine();
      // format live totals
      let prompt = Object.keys(this.liveStats).reduce((str, key) => {
        if (/read|write|update/.test(key) || this.liveStats[key]) {
          str += ` ${key}=${this.liveStats[key]}`;
        }
        return str;
      }, " ");
      // show amount of buffered chunks (if any)
      let buffered = this.buffer ? ` [${this.buffer.length}]` : "";
      let columns = this.stream.columns;
      if (prompt.length >= columns) {
        prompt = prompt.replace(/([a-z])[a-z]+/g, "$1").substr(0, columns - 1);
      }
      columns -= prompt.length;
      if (buffered.length < columns) {
        prompt += chalk.blue(buffered);
        columns -= buffered.length;
      }
      let instruction =
        " " +
        (INSTRUCTION.length >= columns ? INSTRUCTION.substr(0, columns - 2) + "…" : INSTRUCTION);
      this.stream.write(prompt + chalk.dim(instruction));
      this.stream.cursorTo(0);
    }
  }
  end() {
    if (this.stream.isTTY) {
      this.stream.clearLine();
    }
  }
  // eslint-disable-next-line require-jsdoc
  help() {
    let help = "";
    this.stream.clearLine();
    help += `\n  Shortcuts:\n`;
    help += `    q - quit, output ${this.options.raw ? "raw data" : "report"} \n`;
    help += `    ? - this help\n`;
    help += `    r - reset, zero counters and clear screen\n`;
    help += `    z - zero counters\n`;
    help += `    c - clear screen\n`;
    help += `    t - output totals\n\n`;
    this.stream.write(chalk.bold(help));
    this.displayPrompt();
  }
  displayTotals() {
    this.stream.clearLine();
    let quickStats = "";
    quickStats += `\nTotals:\n`;
    quickStats += `  Number of Operations: ${this.liveStats.ops}\n`;
    quickStats += `  Bytes Read: ${this.liveStats.read}\n`;
    quickStats += `  Bytes Written: ${this.liveStats.write}\n`;
    quickStats += `  Bytes Updated: ${this.liveStats.update}\n`;
    this.stream.write(chalk.bold(quickStats));
    if (this.liveStats.txn) {
      this.stream.write(chalk.bold(`  Bytes of Txn: ${this.liveStats.txn}\n`));
    }
    this.stream.write("\n");
    this.displayPrompt();
  }

  /**
   * @param {string} chunk keyboard input
   * @return {boolean} returns true if user wants to end profiling
   */
  processKey(chunk) {
    switch (chunk.toLowerCase()[0]) {
      case "q":
        this.displayTotals();
        return true;
      case "z":
        this.resetStats();
        this.displayPrompt();
        return false;
      case "c":
        this.stream.cursorTo(0, 0);
        this.stream.clearScreenDown();
        this.displayHeaders();
        this.displayPrompt();
        return false;
      case "r":
        this.stream.cursorTo(0, 0);
        this.stream.clearScreenDown();
        this.resetStats();
        this.displayHeaders();
        this.displayPrompt();
        return false;
      case "t":
        this.stream.clearLine();
        this.displayTotals();
        this.displayPrompt();
        return false;
      default:
        this.help();
        return false;
    }
  }
}

module.exports = {
  LiveReporter: LiveReporter,
};
