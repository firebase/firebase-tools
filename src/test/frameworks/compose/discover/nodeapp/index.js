const express = require("express");
const app = express();
const port = 4000;
const cors = require("cors");

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

app.get("/", cors(), async (req, res) => {
  res.send("This is a sample node test application");
});

app.listen(port, () => {
  console.log(`Listening to http://localhost:${port}`);
});
