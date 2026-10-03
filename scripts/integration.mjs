import assert from "node:assert/strict";
const base = process.env.BASE_URL || "http://localhost:8083";
async function request(path, body, cookie) {
  return fetch(`${base}/api/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function login(userId) {
  const r = await request("login", { userId, password: "demo-care-2026" });
  assert.equal(r.status, 200);
  return r.headers.get("set-cookie").split(";")[0];
}
assert.equal((await request("health")).status, 200);
assert.equal((await request("workspace")).status, 401);
const coordinator = await login("coordinator"),
  alex = await login("alex"),
  sam = await login("sam");
const create = await request(
  "workspace",
  { type: "create", patientId: "alex", specialty: `Integration ${Date.now()}` },
  coordinator,
);
assert.equal(create.status, 200);
const all = await create.json();
const id = all.referrals.at(-1).id;
let r = await request("workspace", undefined, sam);
assert.ok(!(await r.json()).referrals.some((r) => r.id === id));
assert.equal(
  (
    await request(
      "workspace",
      { referralId: id, action: { type: "receive", name: "Referral letter" } },
      sam,
    )
  ).status,
  404,
);
assert.equal(
  (
    await request(
      "workspace",
      { referralId: id, action: { type: "complete" } },
      alex,
    )
  ).status,
  403,
);
assert.equal(
  (
    await request(
      "workspace",
      { referralId: id, action: { type: "complete" } },
      coordinator,
    )
  ).status,
  400,
);
assert.equal(
  (
    await request(
      "workspace",
      { referralId: id, action: { type: "receive", name: "Referral letter" } },
      alex,
    )
  ).status,
  200,
);
const assignments = await Promise.all(
  ["Jordan Lee", "Taylor Chen"].map((owner) =>
    request(
      "workspace",
      { referralId: id, action: { type: "assign", owner } },
      coordinator,
    ),
  ),
);
assignments.forEach((r) => assert.equal(r.status, 200));
assert.equal(
  (
    await request(
      "workspace",
      {
        referralId: id,
        action: {
          type: "schedule",
          appointment: new Date(Date.now() + 86400000).toISOString(),
        },
      },
      coordinator,
    )
  ).status,
  200,
);
assert.equal(
  (
    await request(
      "workspace",
      { referralId: id, action: { type: "complete" } },
      coordinator,
    )
  ).status,
  200,
);
r = await request("workspace", undefined, alex);
const result = await r.json();
assert.equal(result.referrals.find((r) => r.id === id).status, "completed");
assert.equal(result.events.filter((e) => e.referralId === id).length, 6);
assert.equal(result.notifications.filter((n) => n.referralId === id).length, 6);
assert.ok(result.notifications.every((n) => n.patientId === "alex"));
await request("logout", {}, alex);
assert.equal((await request("workspace", undefined, alex)).status, 401);
console.log(
  "PASS: real PostgreSQL workflow, authentication, patient isolation, concurrent mutation, audit, notifications, and logout",
);
