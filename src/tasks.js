
const express = require("express");
const { randomUUID } = require("node:crypto");

const router = express.Router();
const tasks = new Map();

const VALID_STATUSES = ["todo", "in_progress", "done"];
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

function validateTaskPayload(body, { partial = false } = {}) {
  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    return { error: "Request body must be an object" };
  }

  const allowedFields = ["title", "description", "status"];
  const unknownFields = Object.keys(body).filter(
    (key) => !allowedFields.includes(key)
  );

  if (unknownFields.length > 0) {
    return {
      error: `Unknown fields: ${unknownFields.join(", ")}`
    };
  }

  if (partial && Object.keys(body).length === 0) {
    return { error: "At least one field must be provided" };
  }

  if (!partial && !Object.hasOwn(body, "title")) {
    return { error: "title is required" };
  }

  if (Object.hasOwn(body, "title")) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      return { error: "title must be a non-empty string" };
    }
  }

  if (
    Object.hasOwn(body, "description") &&
    typeof body.description !== "string"
  ) {
    return { error: "description must be a string" };
  }

  if (
    Object.hasOwn(body, "status") &&
    !VALID_STATUSES.includes(body.status)
  ) {
    return {
      error: `status must be one of: ${VALID_STATUSES.join(", ")}`
    };
  }

  return { value: body };
}

function parsePositiveInteger(value, defaultValue) {
  if (value === undefined) {
    return { value: defaultValue };
  }

  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value)
  ) {
    return { error: "Must be a positive integer" };
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed)) {
    return { error: "Integer is outside the supported range" };
  }

  return { value: parsed };
}

// List tasks with pagination.
router.get("/", (req, res) => {
  const pageResult = parsePositiveInteger(
    req.query.page,
    DEFAULT_PAGE
  );

  const limitResult = parsePositiveInteger(
    req.query.limit,
    DEFAULT_LIMIT
  );

  if (pageResult.error) {
    return res.status(400).json({
      error: `Invalid page: ${pageResult.error}`
    });
  }

  if (limitResult.error) {
    return res.status(400).json({
      error: `Invalid limit: ${limitResult.error}`
    });
  }

  const { page } = pageResult;
  const { limit } = limitResult;

  if (limit > MAX_LIMIT) {
    return res.status(400).json({
      error: `limit cannot exceed ${MAX_LIMIT}`
    });
  }

  const allTasks = [...tasks.values()];
  const total = allTasks.length;
  const start = (page - 1) * limit;
  const data = allTasks.slice(start, start + limit);

  return res.json({
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
});

// Get a task by ID.
router.get("/:id", (req, res) => {
  const task = tasks.get(req.params.id);

  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }

  return res.json({ data: task });
});

// Create a task.
router.post("/", (req, res) => {
  const result = validateTaskPayload(req.body);

  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  const { title, description = "", status = "todo" } =
    result.value;

  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `status must be one of: ${VALID_STATUSES.join(", ")}`
    });
  }

  const task = {
    id: randomUUID(),
    title: title.trim(),
    description,
    status,
    createdAt: new Date().toISOString()
  };

  tasks.set(task.id, task);

  return res.status(201).json({ data: task });
});

// Update a task.
router.patch("/:id", (req, res) => {
  const existing = tasks.get(req.params.id);

  if (!existing) {
    return res.status(404).json({ error: "Task not found" });
  }

  const result = validateTaskPayload(req.body, {
    partial: true
  });

  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  const changes = { ...result.value };

  if (Object.hasOwn(changes, "title")) {
    changes.title = changes.title.trim();
  }

  // Apply changes only after the entire payload is valid.
  const updated = { ...existing, ...changes };
  tasks.set(updated.id, updated);

  return res.json({ data: updated });
});

// Delete a task.
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
