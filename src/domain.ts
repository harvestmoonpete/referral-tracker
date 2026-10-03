export type Role = "coordinator" | "patient";
export type Status =
  "awaiting_documents" | "ready_to_schedule" | "scheduled" | "completed";
export type User = { id: string; name: string; role: Role };
export type Referral = {
  id: string;
  patientId: string;
  patientName: string;
  specialty: string;
  reason: string;
  status: Status;
  owner: string;
  nextAction: string;
  updatedAt: string;
  appointment?: string;
  documents: { name: string; received: boolean }[];
};
export type Event = {
  id: string;
  referralId: string;
  actor: string;
  message: string;
  at: string;
};
export type Notice = {
  id: string;
  patientId: string;
  referralId: string;
  message: string;
  at: string;
};
export type State = {
  referrals: Referral[];
  events: Event[];
  notifications: Notice[];
};
export const users: User[] = [
  { id: "coordinator", name: "Jordan Lee", role: "coordinator" },
  { id: "alex", name: "Alex Morgan", role: "patient" },
  { id: "sam", name: "Sam Rivera", role: "patient" },
];
export const labels: Record<Status, string> = {
  awaiting_documents: "Awaiting documents",
  ready_to_schedule: "Ready to schedule",
  scheduled: "Scheduled",
  completed: "Completed",
};
export function seed(now = new Date()): State {
  const ago = (days: number) =>
    new Date(now.getTime() - days * 86400000).toISOString();
  return {
    referrals: [
      {
        id: "RF-1042",
        patientId: "alex",
        patientName: "Alex Morgan",
        specialty: "Cardiology",
        reason: "Routine specialist consultation",
        status: "awaiting_documents",
        owner: "Jordan Lee",
        nextAction: "Patient: provide referral letter",
        updatedAt: ago(9),
        documents: [{ name: "Referral letter", received: false }],
      },
      {
        id: "RF-1043",
        patientId: "sam",
        patientName: "Sam Rivera",
        specialty: "Physical therapy",
        reason: "Mobility assessment",
        status: "ready_to_schedule",
        owner: "Jordan Lee",
        nextAction: "Coordinator: schedule appointment",
        updatedAt: ago(2),
        documents: [{ name: "Referral letter", received: true }],
      },
      {
        id: "RF-1044",
        patientId: "alex",
        patientName: "Alex Morgan",
        specialty: "Dermatology",
        reason: "Routine skin consultation",
        status: "scheduled",
        owner: "Taylor Chen",
        nextAction: "Patient: attend appointment",
        updatedAt: ago(1),
        appointment: new Date(now.getTime() + 7 * 86400000).toISOString(),
        documents: [{ name: "Referral letter", received: true }],
      },
    ],
    events: [
      {
        id: "E-1",
        referralId: "RF-1042",
        actor: "Jordan Lee",
        message: "Requested referral letter",
        at: ago(9),
      },
    ],
    notifications: [],
  };
}
export class WorkflowError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export type Action =
  | { type: "assign"; owner: string }
  | { type: "request"; name: string }
  | { type: "receive"; name: string }
  | { type: "schedule"; appointment: string }
  | { type: "complete" };
export function visible(state: State, user: User) {
  return state.referrals.filter(
    (r) => user.role === "coordinator" || r.patientId === user.id,
  );
}
export function transition(
  state: State,
  user: User,
  id: string,
  action: Action,
  now = new Date(),
): Referral {
  const r = state.referrals.find(
    (r) =>
      r.id === id && (user.role === "coordinator" || r.patientId === user.id),
  );
  if (!r) throw new WorkflowError("Referral not found", 404);
  if (user.role !== "coordinator" && action.type !== "receive")
    throw new WorkflowError("Coordinator access required", 403);
  const clean = (s: unknown) => {
    if (typeof s !== "string" || !s.trim() || s.length > 160)
      throw new WorkflowError("Enter between 1 and 160 characters");
    return s.trim();
  };
  let message = "";
  switch (action.type) {
    case "assign":
      r.owner = clean(action.owner);
      message = `Assigned to ${r.owner}`;
      break;
    case "request":
      if (r.status === "scheduled" || r.status === "completed")
        throw new WorkflowError(
          "Documents cannot be requested after scheduling",
        );
      {
        const name = clean(action.name);
        if (r.documents.some((d) => d.name === name))
          throw new WorkflowError("Document already requested");
        r.documents.push({ name, received: false });
        r.status = "awaiting_documents";
        r.nextAction = `Patient: provide ${name}`;
        message = `Requested ${name}`;
      }
      break;
    case "receive":
      if (r.status !== "awaiting_documents")
        throw new WorkflowError("This referral is not awaiting documents");
      {
        const doc = r.documents.find(
          (d) => d.name === action.name && !d.received,
        );
        if (!doc) throw new WorkflowError("Pending document not found");
        doc.received = true;
        r.status = r.documents.every((d) => d.received)
          ? "ready_to_schedule"
          : "awaiting_documents";
        r.nextAction =
          r.status === "ready_to_schedule"
            ? "Coordinator: schedule appointment"
            : `Patient: provide ${r.documents.find((d) => !d.received)!.name}`;
        message = `Recorded synthetic document: ${doc.name}`;
      }
      break;
    case "schedule":
      if (r.status !== "ready_to_schedule")
        throw new WorkflowError(
          "Receive all requested documents before scheduling",
        );
      if (
        typeof action.appointment !== "string" ||
        !action.appointment ||
        !Number.isFinite(Date.parse(action.appointment)) ||
        Date.parse(action.appointment) <= now.getTime()
      )
        throw new WorkflowError("Choose a future appointment");
      r.appointment = new Date(action.appointment).toISOString();
      r.status = "scheduled";
      r.nextAction = "Patient: attend appointment";
      message = `Appointment scheduled for ${r.appointment}`;
      break;
    case "complete":
      if (r.status !== "scheduled")
        throw new WorkflowError("Only scheduled referrals can be completed");
      r.status = "completed";
      r.nextAction = "No further action";
      message = "Referral completed";
      break;
    default:
      throw new WorkflowError("Unknown action");
  }
  r.updatedAt = now.toISOString();
  const event = {
    id: crypto.randomUUID(),
    referralId: id,
    actor: user.name,
    message,
    at: r.updatedAt,
  };
  state.events.push(event);
  state.notifications.push({
    id: crypto.randomUUID(),
    patientId: r.patientId,
    referralId: id,
    message,
    at: r.updatedAt,
  });
  return r;
}
