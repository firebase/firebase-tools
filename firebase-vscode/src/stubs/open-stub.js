const vscode = require("vscode");

module.exports = async (target, options) => {
  vscode.env.openExternal(target);
};
