import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  seed,
  users,
  visible,
  transition,
  WorkflowError,
  type State,
  type Action,
} from "../src/domain.js";
export type Database = {
  state: State;
  sessions: Record<string, { userId: string; expires: number }>;
};
export interface Store {
  transaction<T>(fn: (db: Database) => Promise<T> | T): Promise<T>;
}
export function memoryStore(): Store {
  let data: Database = { state: seed(), sessions: {} };
  let chain = Promise.resolve();
  return {
    transaction<T>(fn: (db: Database) => Promise<T> | T) {
      const result = chain.then(async () => {
        const draft = structuredClone(data);
        const value = await fn(draft);
        data = draft;
        return value;
      });
      chain = result.then(
        () => {},
        () => {},
      );
      return result;
    },
  };
}
const password = scryptSync("demo-care-2026", "referral-demo-public-salt", 32);
export async function app(store: Store) {
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    bodyLimit: 16384,
  });
  await app.register(cookie);
  app.setErrorHandler((e: any, _q, r) => {
    const status = e instanceof WorkflowError ? e.status : e.statusCode || 500;
    return r
      .code(status)
      .send({
        error: status >= 500 ? "Service error. Please retry." : e.message,
      });
  });
  app.get("/api/health", async () => {
    await store.transaction(() => true);
    return { ok: true };
  });
  app.post("/api/login", async (req, reply) => {
    const body = req.body as any;
    if (
      !body ||
      typeof body.password !== "string" ||
      body.password.length > 256 ||
      !users.some((u) => u.id === body.userId) ||
      !timingSafeEqual(
        password,
        scryptSync(body.password, "referral-demo-public-salt", 32),
      )
    )
      throw new WorkflowError("Invalid demo credentials", 401);
    const token = randomBytes(32).toString("hex");
    await store.transaction((db) => {
      for (const [key, s] of Object.entries(db.sessions))
        if (s.expires < Date.now()) delete db.sessions[key];
      db.sessions[token] = {
        userId: body.userId,
        expires: Date.now() + 8 * 3600000,
      };
    });
    reply.setCookie("session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.COOKIE_SECURE === "true",
      path: "/",
      maxAge: 28800,
    });
    return users.find((u) => u.id === body.userId);
  });
  app.post("/api/logout", async (req, reply) => {
    await store.transaction((db) => {
      delete db.sessions[req.cookies.session || ""];
    });
    reply.clearCookie("session", { path: "/" });
    return { ok: true };
  });
  app.route({
    method: ["GET", "POST"],
    url: "/api/workspace",
    handler: async (req) =>
      store.transaction((db) => {
        const session = db.sessions[req.cookies.session || ""];
        const user = users.find((u) => u.id === session?.userId);
        if (!user || session.expires < Date.now())
          throw new WorkflowError("Please sign in to a demo account", 401);
        if (req.method === "POST") {
          const body = req.body as any;
          if (!body || typeof body !== "object")
            throw new WorkflowError("Invalid request");
          if (body.type === "create") {
            if (user.role !== "coordinator")
              throw new WorkflowError("Coordinator access required", 403);
            const patient = users.find(
              (u) => u.role === "patient" && u.id === body.patientId,
            );
            if (
              !patient ||
              typeof body.specialty !== "string" ||
              !body.specialty.trim() ||
              body.specialty.length > 100
            )
              throw new WorkflowError("Choose a patient and specialty");
            const id = `RF-${randomBytes(4).toString("hex").toUpperCase()}`;
            db.state.referrals.push({
              id,
              patientId: patient.id,
              patientName: patient.name,
              specialty: body.specialty.trim(),
              reason: "Synthetic specialist consultation",
              status: "awaiting_documents",
              owner: user.name,
              nextAction: "Patient: provide referral letter",
              updatedAt: new Date().toISOString(),
              documents: [],
            });
            transition(db.state, user, id, {
              type: "request",
              name: "Referral letter",
            });
          } else {
            if (
              typeof body.referralId !== "string" ||
              !body.action ||
              typeof body.action !== "object"
            )
              throw new WorkflowError("Invalid referral action");
            transition(db.state, user, body.referralId, body.action as Action);
          }
        }
        const referrals = visible(db.state, user);
        const ids = new Set(referrals.map((r) => r.id));
        return {
          user,
          referrals,
          events: db.state.events.filter((e) => ids.has(e.referralId)),
          notifications: db.state.notifications.filter(
            (n) => user.role === "coordinator" || n.patientId === user.id,
          ),
          stalledDays: Number(process.env.STALLED_DAYS || 7),
        };
      }),
  });
  return app;
}
