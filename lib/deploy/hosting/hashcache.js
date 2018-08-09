const fs = require("fs-extra");
const path = require("path");
const logger = require("../../logger");

function cachePath(cwd, name) {
  return path.resolve(cwd, ".firebase/hosting." + name + ".cache");
}

exports.load = function(cwd, name) {
  try {
    const out = {};
    lines = fs.readFileSync(cachePath(cwd, name), {
      encoding: "utf8",
    });
    lines.split("\n").forEach(function(line) {
      const d = line.split(",");
      if (d.length === 3) {
        out[d[0]] = { mtime: parseInt(d[1]), hash: d[2] };
      }
    });
    return out;
  } catch (e) {
    if (e.code === "ENOENT") {
      logger.debug("[hosting] hash cache [" + name + "] not populated");
    } else {
      logger.debug("[hosting] hash cache [" + name + "] load error:", e.message);
    }
    return {};
  }
};

exports.dump = function(cwd, name, data) {
  let st = "";
  let count = 0;
  for (let path in data) {
    count++;
    st += path + "," + data[path].mtime + "," + data[path].hash + "\n";
  }
  fs.outputFileSync(cachePath(cwd, name), st, { encoding: "utf8" });
  logger.debug("[hosting] hash cache [" + name + "] stored for", count, "files");
};
