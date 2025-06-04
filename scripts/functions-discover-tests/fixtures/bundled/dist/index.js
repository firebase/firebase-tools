/**
 * Minimal example of a "bundled" function source.
 *
 * Instead of actually bundling the source code, we manually annotate
 * the exported function with the __endpoint property to test the situation
 * where the distributed package doesn't include Firebase Functions SDK as a
 * dependency.
 */

const hello = (req, resp) => {
  resp.send("hello");
};

hello.__endpoint = {
  platform: "gcfv2",
  region: "region",
  httpsTrigger: {},
};

exports.hello = hello;
