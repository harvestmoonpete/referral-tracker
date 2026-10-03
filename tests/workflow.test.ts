import { test } from "node:test";
import assert from "node:assert/strict";
import { seed, users, transition } from "../src/domain.js";
import { app, memoryStore } from "../server/app.js";
process.env.NODE_ENV = "test";
test("complete workflow creates audit history and patient updates", () => {
  const s = seed();
  transition(s, users[1], "RF-1042", {
    type: "receive",
    name: "Referral letter",
  });
  assert.equal(s.referrals[0].status, "ready_to_schedule");
  transition(s, users[0], "RF-1042", {
    type: "schedule",
    appointment: new Date(Date.now() + 86400000).toISOString(),
  });
  transition(s, users[0], "RF-1042", { type: "complete" });
  assert.equal(s.referrals[0].status, "completed");
  assert.equal(s.notifications.length, 3);
  assert.equal(s.events.length, 4);
});
test("invalid transitions and patient coordinator actions are rejected", () => {
  const s = seed();
  assert.throws(() => transition(s, users[0], "RF-1042", { type: "complete" }));
  assert.throws(() =>
    transition(s, users[0], "RF-1042", {
      type: "schedule",
      appointment: new Date().toISOString(),
    }),
  );
  assert.throws(() =>
    transition(s, users[1], "RF-1042", { type: "assign", owner: "Me" }),
  );
  assert.throws(() =>
    transition(s, users[1], "RF-1043", {
      type: "receive",
      name: "Referral letter",
    }),
  );
});
test("session auth, patient isolation, permissions, notifications, and logout", async () => {
  const server = await app(memoryStore());
  try {
    assert.equal((await server.inject("/api/workspace")).statusCode, 401);
    assert.equal(
      (
        await server.inject({
          url: "/api/workspace",
          headers: { cookie: "session=fake" },
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await server.inject({
          method: "POST",
          url: "/api/login",
          payload: { userId: "alex", password: "bad" },
        })
      ).statusCode,
      401,
    );
    const login = await server.inject({
      method: "POST",
      url: "/api/login",
      payload: { userId: "alex", password: "demo-care-2026" },
    });
    assert.equal(login.statusCode, 200);
    assert.match(String(login.headers["set-cookie"]), /HttpOnly/);
    const cookie = String(login.headers["set-cookie"]).split(";")[0];
    const get = await server.inject({
      url: "/api/workspace",
      headers: { cookie },
    });
    assert.ok(get.json().referrals.every((r: any) => r.patientId === "alex"));
    const post = (payload: Record<string, unknown>) =>
      server.inject({
        method: "POST",
        url: "/api/workspace",
        headers: { cookie },
        payload,
      });
    assert.equal(
      (
        await post({
          referralId: "RF-1043",
          action: { type: "receive", name: "Referral letter" },
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await post({
          referralId: "RF-1042",
          action: { type: "assign", owner: "Alex" },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await post({
          type: "create",
          patientId: "alex",
          specialty: "Cardiology",
        })
      ).statusCode,
      403,
    );
    const received = await post({
      referralId: "RF-1042",
      action: { type: "receive", name: "Referral letter" },
    });
    assert.equal(received.statusCode, 200);
    assert.ok(
      received.json().notifications.every((n: any) => n.patientId === "alex"),
    );
    assert.equal(received.json().referrals[0].status, "ready_to_schedule");
    await server.inject({
      method: "POST",
      url: "/api/logout",
      headers: { cookie },
    });
    assert.equal(
      (await server.inject({ url: "/api/workspace", headers: { cookie } }))
        .statusCode,
      401,
    );
  } finally {
    await server.close();
  }
});
test("concurrent mutations serialize and failed transaction rolls back", async () => {
  const store = memoryStore();
  await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      store.transaction(async (db) => {
        await new Promise((r) => setTimeout(r, 2));
        transition(db.state, users[0], "RF-1042", {
          type: "request",
          name: `Document ${i}`,
        });
      }),
    ),
  );
  await store.transaction((db) =>
    assert.equal(db.state.referrals[0].documents.length, 13),
  );
  await assert.rejects(
    store.transaction((db) => {
      db.state.referrals = [];
      throw Error("rollback");
    }),
  );
  await store.transaction((db) => assert.equal(db.state.referrals.length, 3));
});
test("invalid body cannot alter workflow", async () => {
  const server = await app(memoryStore());
  const login = await server.inject({
    method: "POST",
    url: "/api/login",
    payload: { userId: "coordinator", password: "demo-care-2026" },
  });
  const cookie = String(login.headers["set-cookie"]).split(";")[0];
  for (const payload of [
    {},
    { referralId: "RF-1042", action: { type: "bogus" } },
    { referralId: "RF-1042", action: { type: "assign", owner: "" } },
  ])
    assert.equal(
      (
        await server.inject({
          method: "POST",
          url: "/api/workspace",
          headers: { cookie },
          payload,
        })
      ).statusCode,
      400,
    );
  await server.close();
});
test("expired sessions cannot read or mutate workspace", async () => {
  const store = memoryStore();
  await store.transaction((db) => {
    db.sessions.expired = { userId: "coordinator", expires: Date.now() - 1 };
  });
  const server = await app(store);
  for (const method of ["GET", "POST"] as const) {
    const response = await server.inject({
      method,
      url: "/api/workspace",
      headers: { cookie: "session=expired" },
      ...(method === "POST"
        ? {
            payload: {
              type: "create",
              patientId: "alex",
              specialty: "Cardiology",
            },
          }
        : {}),
    });
    assert.equal(response.statusCode, 401);
  }
  await server.close();
});
test("requesting another document reopens ready referral and invalid appointments are rejected", () => {
  const s = seed();
  transition(s, users[0], "RF-1043", { type: "request", name: "Summary" });
  assert.equal(s.referrals[1].status, "awaiting_documents");
  transition(s, users[2], "RF-1043", { type: "receive", name: "Summary" });
  assert.equal(s.referrals[1].status, "ready_to_schedule");
  assert.throws(() =>
    transition(s, users[0], "RF-1043", {
      type: "schedule",
      appointment: "not-a-date",
    }),
  );
  assert.throws(() =>
    transition(s, users[0], "RF-1043", {
      type: "schedule",
      appointment: "2000-01-01",
    }),
  );
});

test("non-string appointment JSON is rejected without changing referral or audit state", async () => {
  const server = await app(memoryStore());
  try {
    const login = await server.inject({
      method: "POST",
      url: "/api/login",
      payload: { userId: "coordinator", password: "demo-care-2026" },
    });
    const cookie = String(login.headers["set-cookie"]).split(";")[0];
    const before = (
      await server.inject({ url: "/api/workspace", headers: { cookie } })
    ).json();
    for (const appointment of [9999, ["9999"], {}, true, null]) {
      const result = await server.inject({
        method: "POST",
        url: "/api/workspace",
        headers: { cookie },
        payload: {
          referralId: "RF-1043",
          action: { type: "schedule", appointment },
        },
      });
      assert.equal(
        result.statusCode,
        400,
        `invalid appointment: ${JSON.stringify(appointment)}`,
      );
      assert.deepEqual(
        (
          await server.inject({ url: "/api/workspace", headers: { cookie } })
        ).json(),
        before,
      );
    }
  } finally {
    await server.close();
  }
});
