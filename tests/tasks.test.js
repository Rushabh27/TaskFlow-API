
const request = require("supertest");
const app = require("../src/app");
const { resetTasksForTests } = require("../src/tasks");

// Attach a user ID to task API requests.
const api = {
  get: (path, userId = "user-1") =>
    request(app).get(path).set("x-user-id", userId),

  post: (path, userId = "user-1") =>
    request(app).post(path).set("x-user-id", userId),

  patch: (path, userId = "user-1") =>
    request(app).patch(path).set("x-user-id", userId),

  delete: (path, userId = "user-1") =>
    request(app).delete(path).set("x-user-id", userId)
};

beforeEach(() => resetTasksForTests());

describe("TaskFlow API", () => {
  test("reports a healthy service", async () => {
    await request(app)
      .get("/health")
      .expect(200, { status: "ok" });
  });

  test("requires a user ID for task endpoints", async () => {
    await request(app).get("/api/tasks").expect(401);

    await request(app)
      .post("/api/tasks")
      .send({ title: "Task" })
      .expect(401);
  });

  test("creates and retrieves a task", async () => {
    const created = await api
      .post("/api/tasks")
      .send({
        title: "Write tests",
        description: "Add API tests"
      })
      .expect(201);

    expect(created.body.data.title).toBe("Write tests");

    await api
      .get(`/api/tasks/${created.body.data.id}`)
      .expect(200);
  });

  test("rejects an empty title", async () => {
    await api
      .post("/api/tasks")
      .send({ title: "   " })
      .expect(400);
  });

  test("rejects an unknown field", async () => {
    await api
      .post("/api/tasks")
      .send({ title: "Task", admin: true })
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

  test("does not modify a task after an invalid update", async () => {
    const created = await api
      .post("/api/tasks")
      .send({ title: "Original title" })
      .expect(201);

    const id = created.body.data.id;

    await api
      .patch(`/api/tasks/${id}`)
      .send({
        title: "Changed title",
        status: "invalid-status"
      })
      .expect(400);

    const response = await api
      .get(`/api/tasks/${id}`)
      .expect(200);

    expect(response.body.data.title).toBe("Original title");
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

  test("returns 404 for a missing task", async () => {
    await api
      .get("/api/tasks/missing-id")
      .expect(404);
  });

  test("uses default pagination values", async () => {
    const response = await api
      .get("/api/tasks")
      .expect(200);

    expect(response.body).toEqual({
      data: [],
      total: 0,
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

    expect(firstPage.body.data).toHaveLength(2);
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

    expect(thirdPage.body.data).toHaveLength(1);
    expect(thirdPage.body.data[0].title).toBe("Task 5");
  });

  test.each([
    ["page=0", "/api/tasks?page=0"],
    ["negative page", "/api/tasks?page=-1"],
    ["decimal page", "/api/tasks?page=1.5"],
    ["non-numeric page", "/api/tasks?page=abc"],
    ["zero limit", "/api/tasks?limit=0"],
    ["oversized limit", "/api/tasks?limit=101"],
    ["unsafe integer", "/api/tasks?page=9007199254740992"]
  ])("rejects invalid pagination: %s", async (_label, url) => {
    await api.get(url).expect(400);
  });

  test("returns an empty page when the page exceeds the result count", async () => {
    const response = await api
      .get("/api/tasks?page=5&limit=10")
      .expect(200);

    expect(response.body.data).toEqual([]);
    expect(response.body.pagination.totalPages).toBe(0);
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
      .send({ title: "Changed by another user" })
      .expect(404);

    const response = await api
      .get(`/api/tasks/${created.body.data.id}`, "user-1")
      .expect(200);

    expect(response.body.data.title).toBe("Original title");
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

  test("users only see their own tasks", async () => {
    await api
      .post("/api/tasks", "user-1")
      .send({ title: "User 1 task" })
      .expect(201);

    await api
      .post("/api/tasks", "user-2")
      .send({ title: "User 2 task" })
      .expect(201);

    const user1Response = await api
      .get("/api/tasks", "user-1")
      .expect(200);

    const user2Response = await api
      .get("/api/tasks", "user-2")
      .expect(200);

    expect(user1Response.body.data.map((task) => task.title))
      .toEqual(["User 1 task"]);

    expect(user2Response.body.data.map((task) => task.title))
      .toEqual(["User 2 task"]);
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
});
