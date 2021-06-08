import * as express from "express";

const app = express();
app.get("/__/backend.yaml", (req, res) => {
  res.setHeader("content-type", "text/yaml");
  res.send(process.env.BACKEND);
});

let port = 8080;
if (process.env.ADMIN_PORT) {
  port = Number.parseInt(process.env.ADMIN_PORT);
}
app.listen(port);