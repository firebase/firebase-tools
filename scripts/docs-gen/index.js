const JsonSchemaStaticDocs = require("json-schema-static-docs");

(async () => {
  const jsonSchemaStaticDocs = new JsonSchemaStaticDocs({
    inputPath: "../../schema",
    outputPath: "../../schema/docs",
    ajvOptions: {
      allowUnionTypes: true,
    },
  });
  await jsonSchemaStaticDocs.generate();
  console.log("Documents generated.");
})();
