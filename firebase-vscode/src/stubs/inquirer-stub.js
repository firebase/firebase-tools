const inquirer = module.exports;

let pluginLogger = {
  debug: () => {},
};
const optionsKey = Symbol("options");
inquirer[optionsKey] = {};

inquirer.setInquirerOptions = (inquirerOptions) => {
  inquirer[optionsKey] = inquirerOptions;
};

inquirer.setInquirerLogger = (logger) => {
  pluginLogger = logger;
};

inquirer.prompt = async (prompts) => {
  const answers = {};
  for (const prompt of prompts) {
    if (inquirer[optionsKey].hasOwnProperty(prompt.name)) {
      answers[prompt.name] = inquirer[optionsKey][prompt.name];
    } else {
      pluginLogger.debug(
        `Didn't find "${prompt.name}" in options (message:` +
          ` "${prompt.message}"), defaulting to value "${prompt.default}"`,
      );
      answers[prompt.name] = prompt.default;
    }
  }
  return answers;
};

inquirer.registerPrompt = () => {};
