const { merge } = require("webpack-merge");
const TerserPlugin = require("terser-webpack-plugin");
const common = require("./webpack.common.js");

module.exports = common.map((config) =>
  merge(config, {
    mode: "production",
    optimization: {
      minimize: true,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            keep_classnames: /AbortSignal/,
            keep_fnames: /AbortSignal/,
          },
          parallel: 2,
        }),
        "...",
      ],
    },
  }),
);
