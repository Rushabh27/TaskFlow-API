const request = require("supertest");
const app = require("../src/app");
const { resetTasksForTests } = require("../src/tasks");

beforeEach(() => resetTasksForTests());

describe("TaskFlow API baseline", () => {
  test("reports a healthy service", async () => {
    await request(app).get("/health").expect(200, { status: "ok" });
  });

  test("creates and retrieves a task", async () => {
    const created = await request(app)
      .post("/api/tasks")
      .send({ title: "Write tests", description: "Add API tests" })
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

  test("returns 404 for a missing task", async () => {
    await request(app).get("/api/tasks/missing-id").expect(404);
  });
});
