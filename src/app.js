
const express = require("express");
const { router: tasksRouter } = require("./tasks");

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/tasks", (req, res, next) => {
    const userId = req.get("x-user-id");

    if (!userId || !userId.trim()) {
        return res.status(401).json({ error: "User ID is required" });
    }

    req.userId = userId.trim();
    next();
}, tasksRouter);

module.exports = app;
