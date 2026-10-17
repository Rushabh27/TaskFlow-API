
const { createHmac } = require("node:crypto");

const request = require("supertest");
const app = require("../src/app");
const { resetTasksForTests } = require("../src/tasks");

const SECRET = 'taskflow-local-dev-secret-2026-8f3c9a7e2d6b4f1a0c5e9d7b3a6f2c8e';

function createToken(userId, overrides = {}) {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");

  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides
  });

  const signature = createHmac("sha256", SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");

  return `${header}.${payload}.${signature}`;
}

const api = {
  get: (path, userId = "user-1") =>
    request(app).get(path).set("Authorization", `Bearer ${createToken(userId)}`),

  post: (path, userId = "user-1") =>
    request(app).post(path).set("Authorization", `Bearer ${createToken(userId)}`),

  patch: (path, userId = "user-1") =>
    request(app).patch(path).set("Authorization", `Bearer ${createToken(userId)}`),

  delete: (path, userId = "user-1") =>
    request(app).delete(path).set("Authorization", `Bearer ${createToken(userId)}`)
};

beforeEach(() => resetTasksForTests());

describe("TaskFlow API", () => {
  test("reports a healthy service", async () => {
    await request(app)
      .get("/health")
      .expect(200, { status: "ok" });
  });

  test("rejects missing, invalid and expired authentication tokens", async () => {
    await request(app).get("/api/tasks").expect(401);

    await request(app)
      .get("/api/tasks")
      .set("Authorization", "Bearer invalid-token")
      .expect(401);

    await request(app)
      .get("/api/tasks")
      .set(
        "Authorization",
        `Bearer ${createToken("user-1", {
          exp: Math.floor(Date.now() / 1000) - 1
        })}`
      )
      .expect(401);
  });

  test("does not trust a client-supplied x-user-id header", async () => {
    await api
      .post("/api/tasks", "user-1")
      .send({ title: "Private task" })
      .expect(201);

    const response = await request(app)
      .get("/api/tasks")
      .set("Authorization", `Bearer ${createToken("user-2")}`)
      .set("x-user-id", "user-1")
      .expect(200);

    expect(response.body.data).toEqual([]);
    expect(response.body.total).toBe(0);
  });

  test("rejects whitespace-only and padded token subjects", async () => {
    await request(app)
      .get("/api/tasks")
      .set("Authorization", `Bearer ${createToken("   ")}`)
      .expect(401);

    await request(app)
      .get("/api/tasks")
      .set("Authorization", `Bearer ${createToken(" user-1 ")}`)
      .expect(401);
  });

  test("checks authentication before parsing JSON", async () => {
    await request(app)
      .post("/api/tasks")
      .set("Content-Type", "application/json")
      .send("{invalid json")
      .expect(401);
  });

  test("creates and retrieves a task without exposing ownerId", async () => {
    const created = await api
      .post("/api/tasks")
      .send({
        title: "Write tests",
        description: "Add API tests"
      })
      .expect(201);

    expect(created.body.data.title).toBe("Write tests");
    expect(created.body.data).not.toHaveProperty("ownerId");

    const retrieved = await api
      .get(`/api/tasks/${created.body.data.id}`)
      .expect(200);

    expect(retrieved.body.data.title).toBe("Write tests");
    expect(retrieved.body.data).not.toHaveProperty("ownerId");
  });

  test.each([
    ["missing title", {}],
    ["numeric title", { title: 123 }],
    ["null title", { title: null }],
    ["null description", { title: "Task", description: null }]
  ])("rejects invalid create payload: %s", async (_label, body) => {
    await api.post("/api/tasks").send(body).expect(400);
  });

  test("rejects null and array request bodies", async () => {
    await api
      .post("/api/tasks")
      .set("Content-Type", "application/json")
      .send("null")
      .expect(400);

    await api
      .post("/api/tasks")
      .set("Content-Type", "application/json")
      .send("[]")
      .expect(400);
  });

  test("rejects an empty title", async () => {
    await api
      .post("/api/tasks")
      .send({ title: "   " })
      .expect(400);
  });

  test("rejects an unknown field on creation", async () => {
    await api
      .post("/api/tasks")
      .send({ title: "Task", admin: true })
      .expect(400);
  });

  test("rejects ownerId on creation", async () => {
    await api
      .post("/api/tasks")
      .send({ title: "Task", ownerId: "user-2" })
      .expect(400);
  });

  test("rejects a non-string description", async () => {
    await api
      .post("/api/tasks")
      .send({ title: "Task", description: 123 })
      .expect(400);
  });

  test("rejects an invalid status on creation", async () => {
    await api
      .post("/api/tasks")
      .send({ title: "Task", status: "blocked" })
      .expect(400);
  });

  test("rejects an empty update", async () => {
    const created = await api
      .post("/api/tasks")
      .send({ title: "Original title" })
      .expect(201);

    await api
      .patch(`/api/tasks/${created.body.data.id}`)
      .send({})
      .expect(400);
  });

  test("does not modify any field after an invalid update", async () => {
    const created = await api
      .post("/api/tasks")
      .send({
        title: "Original title",
        description: "Original description"
      })
      .expect(201);

    const id = created.body.data.id;

    await api
      .patch(`/api/tasks/${id}`)
      .send({
        title: "Changed title",
        description: "Changed description",
        status: "invalid-status"
      })
      .expect(400);

    const response = await api.get(`/api/tasks/${id}`).expect(200);

    expect(response.body.data.title).toBe("Original title");
    expect(response.body.data.description).toBe("Original description");
    expect(response.body.data.status).toBe("todo");
  });

  test("trims valid titles during updates", async () => {
    const created = await api
      .post("/api/tasks")
      .send({ title: "Original" })
      .expect(201);

    const response = await api
      .patch(`/api/tasks/${created.body.data.id}`)
      .send({ title: "  Updated title  " })
      .expect(200);

    expect(response.body.data.title).toBe("Updated title");
  });

  test("rejects ownerId on update", async () => {
    const created = await api
      .post("/api/tasks")
      .send({ title: "Original title" })
      .expect(201);

    await api
      .patch(`/api/tasks/${created.body.data.id}`)
      .send({ ownerId: "user-2" })
      .expect(400);

    const response = await api
      .get(`/api/tasks/${created.body.data.id}`)
      .expect(200);

    expect(response.body.data.title).toBe("Original title");
    expect(response.body.data).not.toHaveProperty("ownerId");
  });

  test("updates status and description independently", async () => {
    const created = await api
      .post("/api/tasks")
      .send({
        title: "Task",
        description: "Original description"
      })
      .expect(201);

    const id = created.body.data.id;

    const statusUpdate = await api
      .patch(`/api/tasks/${id}`)
      .send({ status: "done" })
      .expect(200);

    expect(statusUpdate.body.data.status).toBe("done");
    expect(statusUpdate.body.data.description).toBe("Original description");

    const descriptionUpdate = await api
      .patch(`/api/tasks/${id}`)
      .send({ description: "Updated description" })
      .expect(200);

    expect(descriptionUpdate.body.data.status).toBe("done");
    expect(descriptionUpdate.body.data.description).toBe("Updated description");
    expect(descriptionUpdate.body.data.title).toBe("Task");
  });

  test("returns 404 for a missing task", async () => {
    await api.get("/api/tasks/missing-id").expect(404);
  });

  test("returns 404 for PATCH on a missing task before validating the body", async () => {
    await api
      .patch("/api/tasks/missing-id")
      .send({})
      .expect(404);
  });

  test("uses the full-list response when pagination is omitted", async () => {
    for (let i = 1; i <= 12; i += 1) {
      await api
        .post("/api/tasks")
        .send({ title: `Task ${i}` })
        .expect(201);
    }

    const response = await api.get("/api/tasks").expect(200);

    expect(response.body.data).toHaveLength(12);
    expect(response.body.total).toBe(12);
    expect(response.body).not.toHaveProperty("pagination");
    expect(response.body.data.every((task) => !("ownerId" in task))).toBe(true);
  });

  test("uses default page and limit when pagination is requested", async () => {
    for (let i = 1; i <= 12; i += 1) {
      await api
        .post("/api/tasks")
        .send({ title: `Task ${i}` })
        .expect(201);
    }

    const response = await api.get("/api/tasks?page=1").expect(200);

    expect(response.body.data).toHaveLength(10);
    expect(response.body.data[0].title).toBe("Task 1");
    expect(response.body.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 12,
      totalPages: 2
    });
  });

  test("paginates tasks correctly", async () => {
    for (let i = 1; i <= 5; i += 1) {
      await api
        .post("/api/tasks")
        .send({ title: `Task ${i}` })
        .expect(201);
    }

    const firstPage = await api
      .get("/api/tasks?page=1&limit=2")
      .expect(200);

    expect(firstPage.body.data.map((task) => task.title))
      .toEqual(["Task 1", "Task 2"]);

    expect(firstPage.body.pagination).toEqual({
      page: 1,
      limit: 2,
      total: 5,
      totalPages: 3
    });

    const thirdPage = await api
      .get("/api/tasks?page=3&limit=2")
      .expect(200);

    expect(thirdPage.body.data.map((task) => task.title))
      .toEqual(["Task 5"]);
  });

  test.each([
    ["empty page", "/api/tasks?page="],
    ["page zero", "/api/tasks?page=0"],
    ["negative page", "/api/tasks?page=-1"],
    ["decimal page", "/api/tasks?page=1.5"],
    ["non-numeric page", "/api/tasks?page=abc"],
    ["leading zero", "/api/tasks?page=01"],
    ["encoded plus sign", "/api/tasks?page=%2B1"],
    ["leading whitespace", "/api/tasks?page=%201"],
    ["repeated page", "/api/tasks?page=1&page=2"],
    ["zero limit", "/api/tasks?limit=0"],
    ["empty limit", "/api/tasks?limit="],
    ["negative limit", "/api/tasks?limit=-1"],
    ["decimal limit", "/api/tasks?limit=1.5"],
    ["leading zero limit", "/api/tasks?limit=01"],
    ["encoded plus limit", "/api/tasks?limit=%2B1"],
    ["leading whitespace limit", "/api/tasks?limit=%201"],
    ["repeated limit", "/api/tasks?limit=1&limit=2"],
    ["oversized limit", "/api/tasks?limit=101"],
    ["unsafe integer", "/api/tasks?page=9007199254740992"]
  ])("rejects invalid pagination: %s", async (_label, url) => {
    await api.get(url).expect(400);
  });

  test("accepts the maximum allowed limit of 100", async () => {
    const response = await api.get("/api/tasks?limit=100").expect(200);

    expect(response.body.pagination.limit).toBe(100);
    expect(response.body.pagination.page).toBe(1);
  });

  test("returns an empty out-of-range page with correct user totals", async () => {
    for (let i = 1; i <= 3; i += 1) {
      await api
        .post("/api/tasks", "user-1")
        .send({ title: `User 1 task ${i}` })
        .expect(201);
    }

    for (let i = 1; i <= 2; i += 1) {
      await api
        .post("/api/tasks", "user-2")
        .send({ title: `User 2 task ${i}` })
        .expect(201);
    }

    const response = await api
      .get("/api/tasks?page=5&limit=2", "user-1")
      .expect(200);

    expect(response.body.data).toEqual([]);
    expect(response.body.total).toBe(3);
    expect(response.body.pagination).toEqual({
      page: 5,
      limit: 2,
      total: 3,
      totalPages: 2
    });
  });

  test("returns 404 for a task owned by another user", async () => {
    const created = await api
      .post("/api/tasks", "user-1")
      .send({ title: "Private task" })
      .expect(201);

    await api
      .get(`/api/tasks/${created.body.data.id}`, "user-2")
      .expect(404);
  });

  test("does not allow another user to update a task", async () => {
    const created = await api
      .post("/api/tasks", "user-1")
      .send({ title: "Original title" })
      .expect(201);

    await api
      .patch(`/api/tasks/${created.body.data.id}`, "user-2")
      .send({ title: "Changed title" })
      .expect(404);

    const response = await api
      .get(`/api/tasks/${created.body.data.id}`, "user-1")
      .expect(200);

    expect(response.body.data.title).toBe("Original title");
  });

  test("returns 404 for a non-owner PATCH before validating its body", async () => {
    const created = await api
      .post("/api/tasks", "user-1")
      .send({ title: "Private task" })
      .expect(201);

    await api
      .patch(`/api/tasks/${created.body.data.id}`, "user-2")
      .send({})
      .expect(404);
  });

  test("does not allow another user to delete a task", async () => {
    const created = await api
      .post("/api/tasks", "user-1")
      .send({ title: "Keep this task" })
      .expect(201);

    await api
      .delete(`/api/tasks/${created.body.data.id}`, "user-2")
      .expect(404);

    await api
      .get(`/api/tasks/${created.body.data.id}`, "user-1")
      .expect(200);
  });

  test("users only see their own tasks and pagination totals", async () => {
    for (let i = 1; i <= 3; i += 1) {
      await api
        .post("/api/tasks", "user-1")
        .send({ title: `User 1 task ${i}` })
        .expect(201);
    }

    for (let i = 1; i <= 2; i += 1) {
      await api
        .post("/api/tasks", "user-2")
        .send({ title: `User 2 task ${i}` })
        .expect(201);
    }

    const user1Response = await api
      .get("/api/tasks?page=1&limit=2", "user-1")
      .expect(200);

    const user2Response = await api
      .get("/api/tasks?page=1&limit=2", "user-2")
      .expect(200);

    expect(user1Response.body.data.map((task) => task.title))
      .toEqual(["User 1 task 1", "User 1 task 2"]);
    expect(user1Response.body.pagination.total).toBe(3);
    expect(user1Response.body.pagination.totalPages).toBe(2);

    expect(user2Response.body.data.map((task) => task.title))
      .toEqual(["User 2 task 1", "User 2 task 2"]);
    expect(user2Response.body.pagination.total).toBe(2);
    expect(user2Response.body.pagination.totalPages).toBe(1);
  });

  test("normalizes neither case nor untrusted identity headers", async () => {
    await api
      .post("/api/tasks", "user-1")
      .send({ title: "Lowercase owner task" })
      .expect(201);

    const upperCaseUser = await api
      .get("/api/tasks", "User-1")
      .expect(200);

    expect(upperCaseUser.body.data).toEqual([]);
    expect(upperCaseUser.body.total).toBe(0);
  });

  test("deletes an existing task", async () => {
    const created = await api
      .post("/api/tasks")
      .send({ title: "Delete me" })
      .expect(201);

    await api
      .delete(`/api/tasks/${created.body.data.id}`)
      .expect(204);

    await api
      .get(`/api/tasks/${created.body.data.id}`)
      .expect(404);
  });

  test("returns 404 when deleting a task more than once", async () => {
    const created = await api
      .post("/api/tasks")
      .send({ title: "Delete twice" })
      .expect(201);

    const path = `/api/tasks/${created.body.data.id}`;

    await api.delete(path).expect(204);
    await api.delete(path).expect(404);
  });
});
