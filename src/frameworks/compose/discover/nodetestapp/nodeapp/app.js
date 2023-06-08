const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("This is test app for express framework.");
});

const port = 400; // Specify the port number you want to use
app.listen(port, () => {
  console.log(`Server for test app for express framework is running on port ${port}`);
});
