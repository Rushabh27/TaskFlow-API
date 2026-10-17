const express = require("express");
const { router: tasksRouter } = require("./tasks");

const app = express();
app.use(express.json());
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/tasks", tasksRouter);

module.exports = app;
