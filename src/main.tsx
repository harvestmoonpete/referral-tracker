import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { client, live, type Workspace } from "./api";
import { users, labels, type Action } from "./domain";
import "./style.css";
function App() {
  const [data, setData] = useState<Workspace | null>(null),
    [selected, setSelected] = useState("RF-1042"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("all"),
    [showNew, setShowNew] = useState(false);
  const [owner, setOwner] = useState("Jordan Lee"),
    [document, setDocument] = useState("Consultation notes"),
    [patient, setPatient] = useState("alex"),
    [specialty, setSpecialty] = useState("Neurology");
  async function run(fn: () => Promise<Workspace>) {
    setBusy(true);
    setError("");
    try {
      setData(await fn());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    run(() => client.load());
  }, []);
  const r =
    data?.referrals.find((r) => r.id === selected) || data?.referrals[0];
  const coordinator = data?.user.role === "coordinator";
  const stalled = (at: string) =>
    Date.now() - Date.parse(at) > (data?.stalledDays || 7) * 86400000;
  const act = (action: Action) => r && run(() => client.act(r.id, action));
  return (
    <div className="shell">
      <aside>
        <a className="brand" href="#main">
          <span className="logo">✳</span> referral
          <span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">CARE WORKSPACE</div>
        <nav aria-label="Main navigation">
          <a className="active" href="#main">
            ▦ <span>Referrals</span>
            <span className="nav-count">{data?.referrals.length || 0}</span>
          </a>
          <a href="#activity">
            ◷ <span>Activity</span>
          </a>
        </nav>
        <div className="sidebar-note">
          <span className="eyebrow">BUILT FOR CLARITY</span>
          <p>
            A clear next step.
            <br />
            For every patient.
          </p>
          <div className="line-art">
            ＋ ── ◯<br />
            │　　 │<br />◯ ── ＋
          </div>
        </div>
        <div className="profile">
          <div className="avatar">
            {data?.user.name
              .split(" ")
              .map((n) => n[0])
              .join("") || "JL"}
          </div>
          <div>
            <strong>{data?.user.name || "Demo workspace"}</strong>
            <small>
              {coordinator ? "Care coordinator" : "Patient account"}
            </small>
          </div>
        </div>
      </aside>
      <main id="main">
        <header>
          <span>
            Workspace <span className="crumb">/</span> Referrals
          </span>
          <span className="synthetic">● Synthetic data only</span>
        </header>
        <div className="mode">
          <span>
            <strong>
              {live
                ? "Connected application"
                : "Interactive browser simulation"}
            </strong>{" "}
            ·{" "}
            {live
              ? "Persistent PostgreSQL data · authenticated demo accounts"
              : "Local sample data · role switching is simulated · resets on refresh"}
          </span>
          {!live && (
            <button disabled={busy} onClick={() => run(() => client.reset())}>
              Reset demo ↺
            </button>
          )}
        </div>
        <section className="heading">
          <div>
            <div className="eyebrow">CARE, MOVING FORWARD</div>
            <h1>
              Every referral.
              <br className="mobile" /> A clear next step.
            </h1>
            <p>
              Keep patients informed and care moving, from request to
              appointment.
            </p>
          </div>
          {coordinator && (
            <button className="primary" onClick={() => setShowNew(!showNew)}>
              ＋ New referral
            </button>
          )}
        </section>
        <section className="role-bar">
          <label htmlFor="account">
            {live ? "Sign in as demo account" : "Explore a perspective"}
          </label>
          <select
            id="account"
            value={data?.user.id || "coordinator"}
            disabled={busy}
            onChange={(e) => run(() => client.login(e.target.value))}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {u.role}
              </option>
            ))}
          </select>
          {live && (
            <>
              <button
                disabled={busy}
                onClick={() =>
                  run(() => client.login(data?.user.id || "coordinator"))
                }
              >
                Sign in
              </button>
              <button
                disabled={busy}
                onClick={async () => {
                  await client.logout();
                  setData(null);
                }}
              >
                Sign out
              </button>
            </>
          )}
        </section>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {busy && (
          <div role="status" className="loading">
            Updating workspace…
          </div>
        )}
        {showNew && coordinator && (
          <form
            className="create-form"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => client.create(patient, specialty));
              setShowNew(false);
            }}
          >
            <label>
              Patient
              <select
                value={patient}
                onChange={(e) => setPatient(e.target.value)}
              >
                {users
                  .filter((u) => u.role === "patient")
                  .map((u) => (
                    <option value={u.id} key={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Specialty
              <input
                required
                maxLength={100}
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
              />
            </label>
            <button className="primary" disabled={busy}>
              Create referral
            </button>
          </form>
        )}
        <div className="metrics">
          <div>
            <span>Active referrals</span>
            <strong>
              {data?.referrals.filter((r) => r.status !== "completed").length ||
                0}
            </strong>
            <small>Across your care workspace</small>
          </div>
          <div>
            <span>Awaiting documents</span>
            <strong>
              {data?.referrals.filter((r) => r.status === "awaiting_documents")
                .length || 0}
              <i className="dot amber" />
            </strong>
            <small>A little follow-up goes a long way</small>
          </div>
          <div>
            <span>Ready for scheduling</span>
            <strong>
              {data?.referrals.filter((r) => r.status === "ready_to_schedule")
                .length || 0}
              <i className="dot teal" />
            </strong>
            <small>The next step is within reach</small>
          </div>
          <div>
            <span>Needs attention</span>
            <strong>
              {data?.referrals.filter(
                (r) => r.status !== "completed" && stalled(r.updatedAt),
              ).length || 0}
            </strong>
            <small>No updates in {data?.stalledDays || 7}+ days</small>
          </div>
        </div>
        <div className="workspace-grid">
          <section className="list-panel">
            <div className="panel-title">
              <h2>{coordinator ? "Referral queue" : "Your referrals"}</h2>
              <span>{data?.referrals.length || 0} total</span>
            </div>
            <div className="tabs" role="group" aria-label="Referral filter">
              {[
                ["all", "All referrals"],
                ["attention", "Needs attention"],
                ["scheduled", "Scheduled"],
              ].map(([key, label]) => (
                <button
                  aria-pressed={filter === key}
                  className={filter === key ? "chosen" : ""}
                  key={key}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="referrals">
              {data?.referrals
                .filter(
                  (r) =>
                    filter === "all" ||
                    (filter === "attention" &&
                      r.status !== "completed" &&
                      stalled(r.updatedAt)) ||
                    (filter === "scheduled" && r.status === "scheduled"),
                )
                .map((item) => (
                  <button
                    key={item.id}
                    className={`referral-card ${item.id === r?.id ? "selected" : ""}`}
                    onClick={() => setSelected(item.id)}
                  >
                    <div className="card-top">
                      <span className="id">{item.id}</span>
                      <span className={`badge ${item.status}`}>
                        {labels[item.status]}
                      </span>
                    </div>
                    <h3>
                      {item.patientName}
                      <span>↗</span>
                    </h3>
                    <div className="specialty">{item.specialty}</div>
                    <div className="card-bottom">
                      <span>{item.owner}</span>
                      {stalled(item.updatedAt) &&
                      item.status !== "completed" ? (
                        <span className="attention">◷ Follow up</span>
                      ) : (
                        <span>
                          Updated{" "}
                          {new Date(item.updatedAt).toLocaleDateString(
                            undefined,
                            { month: "short", day: "numeric" },
                          )}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              {data &&
                data.referrals.filter(
                  (r) =>
                    filter === "all" ||
                    (filter === "attention" &&
                      r.status !== "completed" &&
                      stalled(r.updatedAt)) ||
                    (filter === "scheduled" && r.status === "scheduled"),
                ).length === 0 && (
                  <p className="empty">No referrals in this view.</p>
                )}
              {!data && (
                <p className="empty">Sign in to explore the care workspace.</p>
              )}
            </div>
          </section>
          {r && (
            <section className="detail">
              <div className="panel-title">
                <span className="id">{r.id} · REFERRAL DETAILS</span>
                <span className="mini-avatar">
                  {r.patientName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </span>
              </div>
              <h2>{r.specialty}</h2>
              <p className="detail-sub">
                {r.patientName} <span>·</span> {r.reason}
              </p>
              <div className="steps" aria-label="Referral progress">
                {Object.entries(labels).map(([key, label], i) => (
                  <div
                    className={
                      i <= Object.keys(labels).indexOf(r.status) ? "done" : ""
                    }
                    key={key}
                  >
                    <span>
                      {i < Object.keys(labels).indexOf(r.status) ? "✓" : i + 1}
                    </span>
                    <small>{label}</small>
                  </div>
                ))}
              </div>
              <div className="next-action">
                <span className="eyebrow">NEXT BEST STEP</span>
                <h3>{r.nextAction}</h3>
                <p>
                  {r.status === "awaiting_documents"
                    ? "Once documents are received, this referral is ready for scheduling."
                    : r.status === "scheduled"
                      ? `Appointment: ${new Date(r.appointment!).toLocaleString()}`
                      : "Every update is recorded and shared in this workspace."}
                </p>
              </div>
              <h3 className="section-title">
                Documents <span>METADATA ONLY</span>
              </h3>
              <div className="documents">
                {r.documents.map((d) => (
                  <div key={d.name}>
                    <span className={d.received ? "received" : "pending"}>
                      {d.received ? "✓" : "▤"}
                    </span>
                    <div>
                      <strong>{d.name}</strong>
                      <small>
                        {d.received
                          ? "Synthetic document recorded"
                          : "Waiting for document information"}
                      </small>
                    </div>
                    {!d.received && (
                      <button
                        disabled={busy}
                        onClick={() => act({ type: "receive", name: d.name })}
                      >
                        {coordinator ? "Record receipt" : "Provide info"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {coordinator && (
                <div className="actions">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      act({ type: "assign", owner });
                    }}
                  >
                    <label>
                      Responsible coordinator
                      <input
                        aria-label="Responsible coordinator"
                        required
                        maxLength={160}
                        value={owner}
                        onChange={(e) => setOwner(e.target.value)}
                      />
                    </label>
                    <button disabled={busy}>Assign</button>
                  </form>
                  {["awaiting_documents", "ready_to_schedule"].includes(
                    r.status,
                  ) && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        act({ type: "request", name: document });
                      }}
                    >
                      <label>
                        Request document information
                        <input
                          required
                          maxLength={160}
                          value={document}
                          onChange={(e) => setDocument(e.target.value)}
                        />
                      </label>
                      <button disabled={busy}>Request</button>
                    </form>
                  )}
                  {r.status === "ready_to_schedule" && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const value = new FormData(e.currentTarget).get(
                          "appointment",
                        );
                        const appointment =
                          typeof value === "string" ? new Date(value) : null;
                        if (
                          !appointment ||
                          !Number.isFinite(appointment.getTime())
                        ) {
                          setError("Choose a valid appointment date and time.");
                          return;
                        }
                        if (appointment.getTime() <= Date.now()) {
                          setError(
                            "Choose a future appointment date and time.",
                          );
                          return;
                        }
                        act({
                          type: "schedule",
                          appointment: appointment.toISOString(),
                        });
                      }}
                    >
                      <label>
                        Appointment time
                        <input
                          type="datetime-local"
                          required
                          name="appointment"
                        />
                      </label>
                      <button className="primary" disabled={busy}>
                        Schedule
                      </button>
                    </form>
                  )}
                  {r.status === "scheduled" && (
                    <button
                      disabled={busy}
                      onClick={() => act({ type: "complete" })}
                    >
                      Mark completed
                    </button>
                  )}
                </div>
              )}
              <div id="activity">
                <h3 className="section-title">
                  Activity <span>AUDIT HISTORY</span>
                </h3>
                {data?.events
                  .filter((e) => e.referralId === r.id)
                  .slice()
                  .reverse()
                  .map((e) => (
                    <div className="event" key={e.id}>
                      <i />
                      <div>
                        <strong>{e.message}</strong>
                        <small>
                          {e.actor} · {new Date(e.at).toLocaleString()}
                        </small>
                      </div>
                    </div>
                  ))}
                {!data?.events.some((e) => e.referralId === r.id) && (
                  <p className="empty">New updates will appear here.</p>
                )}
              </div>
            </section>
          )}
        </div>
        <section className="notification-panel">
          <h2>
            In-app updates <span>{data?.notifications.length || 0}</span>
          </h2>
          {data?.notifications
            .slice(-5)
            .reverse()
            .map((n) => (
              <p key={n.id}>
                <strong>{n.referralId}</strong> {n.message}
              </p>
            ))}
          {!data?.notifications.length && (
            <p>
              Workflow changes will appear here. No email or text messages are
              sent.
            </p>
          )}
        </section>
        <footer>
          REFERRAL TRACKER{" "}
          <span>A portfolio study in thoughtful healthcare software.</span>
          <span>Built with TypeScript + Node.js</span>
        </footer>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
