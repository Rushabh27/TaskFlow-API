const express = require("express");
const { randomUUID } = require("node:crypto");

const router = express.Router();
const tasks = new Map();

router.get("/", (_req, res) => {
  res.json({ data: [...tasks.values()], total: tasks.size });
});

router.get("/:id", (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }
  return res.json({ data: task });
});

router.post("/", (req, res) => {
  const { title, description = "" } = req.body ?? {};
  if (typeof title !== "string" || title.trim().length === 0) {
    return res.status(400).json({ error: "title is required" });
  }

  const task = {
    id: randomUUID(),
    title: title.trim(),
    description: typeof description === "string" ? description : "",
    status: "todo",
    createdAt: new Date().toISOString()
  };

  tasks.set(task.id, task);
  return res.status(201).json({ data: task });
});

router.patch("/:id", (req, res) => {
  const existing = tasks.get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: "Task not found" });
  }

  const { title, description, status } = req.body ?? {};
  const updated = {
    ...existing,
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(status !== undefined ? { status } : {})
  };

  tasks.set(updated.id, updated);
  return res.json({ data: updated });
});

router.delete("/:id", (req, res) => {
  const deleted = tasks.delete(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: "Task not found" });
  }
  return res.status(204).send();
});

function resetTasksForTests() {
  tasks.clear();
}

module.exports = { router, resetTasksForTests, tasks };
