const inquirer = module.exports;

let options = {};

inquirer.setInquirerOptions = (inquirerOptions) => {
  options = inquirerOptions;
};

inquirer.prompt = async (prompts) => {
  const answers = {};
  for (const prompt of prompts) {
    if (options.hasOwnProperty(prompt.name)) {
      answers[prompt.name] = options[prompt.name];
    } else {
      console.log(`Didn't find "${prompt.name}" in options (message: "${prompt.message}"), defaulting to value "${prompt.default}"`)
      answers[prompt.name] = prompt.default;
    }
  }
  return answers;
};