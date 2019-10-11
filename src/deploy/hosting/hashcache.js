const fs = require("fs-extra");
const path = require("path");
const logger = require("../../logger");

function cachePath(cwd, name) {
  return path.resolve(cwd, ".firebase/hosting." + name + ".cache");
}

exports.load = function(cwd, name) {
  try {
    const out = {};
    const lines = fs.readFileSync(cachePath(cwd, name), {
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
  for (const [path, d] of data) {
    count++;
    st += path + "," + d.mtime + "," + d.hash + "\n";
  }
  try {
    fs.outputFileSync(cachePath(cwd, name), st, { encoding: "utf8" });
    logger.debug("[hosting] hash cache [" + name + "] stored for", count, "files");
  } catch (e) {
    logger.debug("[hosting] unable to store hash cache [" + name + "]", e.stack);
  }
};
