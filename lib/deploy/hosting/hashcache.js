const fs = require("fs-extra");
const path = require("path");
const logger = require("../../logger");

exports.load = function(cwd) {
  try {
    const out = {};
    lines = fs.readFileSync(path.resolve(cwd, ".firebase/hostingcache"), { encoding: "utf8" });
    lines.split("\n").forEach(function(line) {
      const d = line.split(",");
      if (d.length === 3) {
        out[d[0]] = { mtime: parseInt(d[1]), hash: d[2] };
      }
    });
    return out;
  } catch (e) {
    if (e.code === "ENOENT") {
      logger.debug("[hosting] hash cache not populated");
    } else {
      logger.debug("[hosting] hash cache load error:", e.message);
    }
    return {};
  }
};

exports.dump = function(cwd, data) {
  let st = "";
  let count = 0;
  for (let path in data) {
    count++;
    st += path + "," + data[path].mtime + "," + data[path].hash + "\n";
  }
  fs.outputFileSync(path.resolve(cwd, ".firebase/hostingcache"), st, { encoding: "utf8" });
  logger.debug("[hosting] hash cache stored for", count, "files");
};
