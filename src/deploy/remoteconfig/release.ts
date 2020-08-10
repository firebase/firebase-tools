import { publishTemplate } from "./functions";
import getProjectNumber = require("../../getProjectNumber");

module.exports = async function(context: any, options: any) {
  if (!context || !context.template) {
    return Promise.resolve();
  }
  const template = context.template;
  const projectNumber = await getProjectNumber(options);
  return publishTemplate(projectNumber, template, options);
};
