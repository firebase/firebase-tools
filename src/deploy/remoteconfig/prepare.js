import * as fs from "fs";
const rcGet  = require ("../../remoteconfig/get");
const getProjectId = require("../../getProjectId");
const _load = require("../../config");

module.exports = async function(context, options) {
  // if (!context.remoteconfig || !context.remoteconfig.deploy) {
  //   return Promise.resolve();
  // }
  console.log("start validation")
  console.log(options)
  var filePath = options.config.get("remoteconfig.template"); //var filePath = options.config.get("remoteconfig.template");
  const templateString = fs.readFileSync(filePath, 'utf8');
  const template = JSON.parse(templateString);
  const projectId = getProjectId(options);
  template.etag = await createEtag(projectId);
  validateInputRemoteConfigTemplate(template);
  console.log("finish validation")
  return Promise.resolve();
}

async function createEtag(projectId) {
  //console.log(projectId)
  const template = await rcGet.getTemplate(projectId)
  //console.log(template)
  const etag = "etag-" + projectId + "-" + template?.version?.versionNumber;
  //console.log(etag)
  return etag;
}

function validateInputRemoteConfigTemplate(template) {
  const templateCopy = JSON.parse(JSON.stringify(template)); // Deep copy
  console.log(templateCopy)
  if (!templateCopy || templateCopy == 'null' || templateCopy == 'undefined') {   
    throw new Error(
      //'invalid-argument',
      `Invalid Remote Config template: ${JSON.stringify(templateCopy)}`);
  }
  if (typeof(templateCopy.etag) !== "string" || templateCopy.etag == "") { 
    throw new Error(
      //'invalid-argument',
      'ETag must be a non-empty string.');
  }
  if (!templateCopy.parameters || templateCopy.parameters == 'null' || templateCopy.parameters == 'undefined') {
    throw new Error(
      //'invalid-argument',
      'Remote Config parameters must be a non-null object');
  }
  if (!templateCopy.parameterGroups || templateCopy.parameterGroups == 'null' || templateCopy.parameterGroups == 'undefined') {
    throw new Error(
      //'invalid-argument',
      'Remote Config parameter groups must be a non-null object');
  }
  if (!Array.isArray(templateCopy.conditions)) {
    throw new Error(
      //'invalid-argument',
      'Remote Config conditions must be an array');
  }
  if (typeof templateCopy.version !== 'undefined') {
    // exclude output only properties and keep the only input property: description
    templateCopy.version = { description: templateCopy.version.description };
  }
  return templateCopy;
}
