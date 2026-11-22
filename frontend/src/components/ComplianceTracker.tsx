import { useEffect, useState } from "react";
import {
  Clock,
  FastForward,
  Shield,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import type { Notice } from "../types/cipher_rakshak";
interface Props {
  rows: Notice[];
  busy: boolean;
  refresh: () => void;
  more?: () => void;
  review: (r: Notice) => void;
  action: (r: Notice, a: "simulate" | "resolve" | "escalate") => void;
}
function countdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return (
    Math.floor(s / 86400) +
    "d " +
    [Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60]
      .map((v) => String(v).padStart(2, "0"))
      .join(":")
  );
}
export default function ComplianceTracker({
  rows,
  busy,
  refresh,
  more,
  review,
  action,
}: Props) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  return (
    <section className="card formcard">
      <div className="row">
        <h2>Compliance radar</h2>
        <button onClick={refresh} disabled={busy}>
          <RefreshCw /> Refresh
        </button>
      </div>
      {!rows.length && (
        <p>No notices loaded. Sign in and refresh to view your records.</p>
      )}
      {rows.map((r) => {
        const diff = Date.parse(r.compliance_deadline || "") - now;
        const overdue =
          r.status === "BREACHED" || (r.status === "SENT" && diff <= 0);
        return (
          <article className="record" key={r.request_id}>
            <span className={"pill " + (overdue ? "red" : "")}>
              {overdue
                ? "Follow-up due"
                : {
                    ESCALATED_TO_DPBI: "Dossier prepared",
                    RESOLVED: "Resolved",
                    DRAFT: "Draft",
                    DISPATCHING: "Dispatch pending",
                    SENT: "Sent",
                    BREACHED: "Follow-up due",
                  }[r.status]}
            </span>
            <h3>{r.company.brand}</h3>
            <code>{r.request_id}</code>
            {r.safe_mode && (
              <small>
                Demo record{r.simulated ? " · simulated expiry" : ""}
              </small>
            )}
            {r.ses_message_id && (
              <small>
                SES accepted · {r.recipient}
                <br />
                <code>{r.ses_message_id}</code>
              </small>
            )}
            {r.status === "SENT" && (
              <p className="mono">
                <Clock size={16} />
                {countdown(diff)} to requested follow-up
              </p>
            )}
            <div className="actions">
              <button disabled={busy} onClick={() => review(r)}>
                Review notice
              </button>
              {r.safe_mode && r.status === "SENT" && !overdue && (
                <button disabled={busy} onClick={() => action(r, "simulate")}>
                  <FastForward /> Simulate expiry
                </button>
              )}
              {(overdue || r.complaint) && (
                <button disabled={busy} onClick={() => action(r, "escalate")}>
                  <Shield /> Open dossier
                </button>
              )}
              {["SENT", "BREACHED", "ESCALATED_TO_DPBI"].includes(r.status) && (
                <button disabled={busy} onClick={() => action(r, "resolve")}>
                  <CheckCircle2 /> Mark resolved
                </button>
              )}
            </div>
          </article>
        );
      })}
      {more && (
        <button disabled={busy} onClick={more}>
          Load earlier notices
        </button>
      )}
    </section>
  );
}
