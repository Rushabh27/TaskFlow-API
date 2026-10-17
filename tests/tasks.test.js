
const request = require("supertest");
const app = require("../src/app");
const { resetTasksForTests } = require("../src/tasks");

beforeEach(() => resetTasksForTests());

describe("TaskFlow API", () => {
  test("reports a healthy service", async () => {
    await request(app)
      .get("/health")
      .expect(200, { status: "ok" });
  });

  test("creates and retrieves a task", async () => {
    const created = await request(app)
      .post("/api/tasks")
      .send({
        title: "Write tests",
        description: "Add API tests"
      })
      .expect(201);

    expect(created.body.data.title).toBe("Write tests");

    await request(app)
      .get(`/api/tasks/${created.body.data.id}`)
      .expect(200);
  });

  test("rejects an empty title", async () => {
    await request(app)
      .post("/api/tasks")
      .send({ title: "   " })
      .expect(400);
  });

  test("rejects an unknown field", async () => {
    await request(app)
      .post("/api/tasks")
      .send({ title: "Task", admin: true })
      .expect(400);
  });

  test("rejects a non-string description", async () => {
    await request(app)
      .post("/api/tasks")
      .send({ title: "Task", description: 123 })
      .expect(400);
  });

  test("rejects an invalid status on creation", async () => {
    await request(app)
      .post("/api/tasks")
      .send({ title: "Task", status: "blocked" })
      .expect(400);
  });

  test("rejects an empty update", async () => {
    const created = await request(app)
      .post("/api/tasks")
      .send({ title: "Original title" })
      .expect(201);

    await request(app)
      .patch(`/api/tasks/${created.body.data.id}`)
      .send({})
      .expect(400);
  });


  test("does not modify any fields after an invalid update", async () => {
    const created = await request(app)
      .post("/api/tasks")
      .send({
        title: "Original title",
        description: "Original description"
      })
      .expect(201);

    const id = created.body.data.id;

    await request(app)
      .patch(`/api/tasks/${id}`)
      .send({
        title: "Changed title",
        description: "Changed description",
        status: "invalid-status"
      })
      .expect(400);

    const response = await request(app)
      .get(`/api/tasks/${id}`)
      .expect(200);

    expect(response.body.data.title).toBe("Original title");
    expect(response.body.data.description)
      .toBe("Original description");
    expect(response.body.data.status).toBe("todo");
  });


  test("trims valid titles during updates", async () => {
    const created = await request(app)
      .post("/api/tasks")
      .send({ title: "Original" })
      .expect(201);

    const response = await request(app)
      .patch(`/api/tasks/${created.body.data.id}`)
      .send({ title: "  Updated title  " })
      .expect(200);

    expect(response.body.data.title).toBe("Updated title");
  });

  test("returns 404 for a missing task", async () => {
    await request(app)
      .get("/api/tasks/missing-id")
      .expect(404);
  });

  test("returns the legacy response when pagination is omitted", async () => {
    const response = await request(app)
      .get("/api/tasks")
      .expect(200);

    expect(response.body).toEqual({
      data: [],
      total: 0,
    });
  });


  test("returns all tasks and top-level total when pagination is omitted", async () => {
    for (let i = 1; i <= 12; i += 1) {
      await request(app)
        .post("/api/tasks")
        .send({ title: `Task ${i}` })
        .expect(201);
    }

    const response = await request(app)
      .get("/api/tasks")
      .expect(200);

    expect(response.body.data).toHaveLength(12);
    expect(response.body.total).toBe(12);
    expect(response.body.pagination).toBeUndefined();
  });

  test("includes top-level total when pagination is requested", async () => {
    for (let i = 1; i <= 3; i += 1) {
      await request(app)
        .post("/api/tasks")
        .send({ title: `Task ${i}` })
        .expect(201);
    }

    const response = await request(app)
      .get("/api/tasks?page=1&limit=2")
      .expect(200);

    expect(response.body.data).toHaveLength(2);
    expect(response.body.total).toBe(3);
    expect(response.body.pagination.total).toBe(3);
  });

  test("paginates tasks correctly", async () => {
    for (let i = 1; i <= 5; i += 1) {
      await request(app)
        .post("/api/tasks")
        .send({ title: `Task ${i}` })
        .expect(201);
    }

    const firstPage = await request(app)
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

    const thirdPage = await request(app)
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
    ["empty page", "/api/tasks?page="],
    ["leading zero", "/api/tasks?page=01"],
    ["literal plus sign", "/api/tasks?page=%2B1"],
    ["whitespace", "/api/tasks?page=%201"],
    ["repeated page", "/api/tasks?page=1&page=2"],
    ["zero limit", "/api/tasks?limit=0"],
    ["oversized limit", "/api/tasks?limit=101"],
    ["repeated limit", "/api/tasks?limit=2&limit=3"],
    ["unsafe integer", "/api/tasks?page=9007199254740992"]
  ])("rejects invalid pagination: %s", async (_label, url) => {
    await request(app).get(url).expect(400);
  });


  test("returns 404 for PATCH on a missing task before validating the body", async () => {
    await request(app)
      .patch("/api/tasks/missing-id")
      .send({})
      .expect(404);
  });

  test("returns 404 when deleting a task more than once", async () => {
    const created = await request(app)
      .post("/api/tasks")
      .send({ title: "Delete me" })
      .expect(201);

    const url = `/api/tasks/${created.body.data.id}`;

    await request(app)
      .delete(url)
      .expect(204);

    await request(app)
      .delete(url)
      .expect(404);
  });



  test.each([
    ["missing title", {}],
    ["numeric title", { title: 123 }],
    ["null title", { title: null }],
    ["null description", { title: "Task", description: null }]
  ])("rejects invalid creation payload: %s", async (_label, payload) => {
    await request(app)
      .post("/api/tasks")
      .send(payload)
      .expect(400);
  });

  test("rejects an array as a task creation body", async () => {
    await request(app)
      .post("/api/tasks")
      .send(["Task"])
      .expect(400);
  });


  test("accepts the maximum allowed limit of 100", async () => {
    const response = await request(app)
      .get("/api/tasks?page=1&limit=100")
      .expect(200);

    expect(response.body.pagination.limit).toBe(100);
  });



  test("returns an empty page beyond existing tasks and preserves totals", async () => {
    for (let i = 1; i <= 3; i += 1) {
      await request(app)
        .post("/api/tasks")
        .send({ title: `Task ${i}` })
        .expect(201);
    }

    const response = await request(app)
      .get("/api/tasks?page=5&limit=2")
      .expect(200);

    expect(response.body.data).toEqual([]);
    expect(response.body.total).toBe(3);
    expect(response.body.pagination.total).toBe(3);
    expect(response.body.pagination.totalPages).toBe(2);
  });


  test("deletes an existing task", async () => {
    const created = await request(app)
      .post("/api/tasks")
      .send({ title: "Delete me" })
      .expect(201);

    await request(app)
      .delete(`/api/tasks/${created.body.data.id}`)
      .expect(204);

    await request(app)
      .get(`/api/tasks/${created.body.data.id}`)
      .expect(404);
  });

  test("updates status and description independently", async () => {
    const created = await request(app)
      .post("/api/tasks")
      .send({
        title: "Task",
        description: "Original description"
      })
      .expect(201);

    const id = created.body.data.id;

    const statusResponse = await request(app)
      .patch(`/api/tasks/${id}`)
      .send({ status: "in_progress" })
      .expect(200);

    expect(statusResponse.body.data.status).toBe("in_progress");
    expect(statusResponse.body.data.description)
      .toBe("Original description");

    const descriptionResponse = await request(app)
      .patch(`/api/tasks/${id}`)
      .send({ description: "Updated description" })
      .expect(200);

    expect(descriptionResponse.body.data.status).toBe("in_progress");
    expect(descriptionResponse.body.data.description)
      .toBe("Updated description");
  });

});
