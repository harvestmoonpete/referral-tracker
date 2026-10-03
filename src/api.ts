import {
  seed,
  users,
  visible,
  transition,
  type State,
  type User,
  type Referral,
  type Event,
  type Notice,
  type Action,
} from "./domain";
export type Workspace = {
  user: User;
  referrals: Referral[];
  events: Event[];
  notifications: Notice[];
  stalledDays: number;
};
export interface Client {
  load(): Promise<Workspace>;
  login(id: string): Promise<Workspace>;
  logout(): Promise<void>;
  act(id: string, action: Action): Promise<Workspace>;
  create(patientId: string, specialty: string): Promise<Workspace>;
  reset(): Promise<Workspace>;
}
export const live = import.meta.env.VITE_API_MODE === "http";
async function request(path: string, body?: unknown) {
  const res = await fetch(`/api/${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
  });
  const result = await res.json();
  if (!res.ok)
    throw new Error(result.error || "Request failed. Please try again.");
  return result;
}
let state: State = seed(),
  user = users[0];
function snapshot(): Workspace {
  const referrals = visible(state, user);
  return structuredClone({
    user,
    referrals,
    events: state.events.filter((e) =>
      referrals.some((r) => r.id === e.referralId),
    ),
    notifications: state.notifications.filter(
      (n) => user.role === "coordinator" || n.patientId === user.id,
    ),
    stalledDays: 7,
  });
}
export const client: Client = live
  ? {
      load: () => request("workspace"),
      login: async (id) => {
        await request("login", { userId: id, password: "demo-care-2026" });
        return request("workspace");
      },
      logout: () => request("logout", {}),
      act: (id, action) => request("workspace", { referralId: id, action }),
      create: (patientId, specialty) =>
        request("workspace", { type: "create", patientId, specialty }),
      reset: async () => {
        throw new Error("Reset is available only in browser simulation.");
      },
    }
  : {
      load: async () => snapshot(),
      login: async (id) => {
        user = users.find((u) => u.id === id)!;
        return snapshot();
      },
      logout: async () => {},
      act: async (id, action) => {
        transition(state, user, id, action);
        return snapshot();
      },
      create: async (patientId, specialty) => {
        const patient = users.find((u) => u.id === patientId)!;
        const id = `RF-${1045 + state.referrals.length}`;
        state.referrals.push({
          id,
          patientId,
          patientName: patient.name,
          specialty,
          reason: "Synthetic specialist consultation",
          status: "awaiting_documents",
          owner: user.name,
          nextAction: "Patient: provide referral letter",
          updatedAt: new Date().toISOString(),
          documents: [],
        });
        transition(state, user, id, {
          type: "request",
          name: "Referral letter",
        });
        return snapshot();
      },
      reset: async () => {
        state = seed();
        return snapshot();
      },
    };
