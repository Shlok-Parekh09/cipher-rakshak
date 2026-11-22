import { useEffect, useState } from "react";
import { Building2, Send, FileCheck2 } from "lucide-react";
import type { Notice, Settings } from "../types/cipher_rakshak";

export default function NoticeWorkspace({
  row,
  settings,
  busy,
  send,
}: {
  row: Notice;
  settings: Settings;
  busy: boolean;
  send: (body: string) => void;
}) {
  const [body, setBody] = useState(row.notice);
  useEffect(() => setBody(row.notice), [row.notice, row.request_id]);
  return (
    <section className="card formcard">
      <h2>
        <FileCheck2 /> Notice review
      </h2>
      <div className="match">
        <Building2 />
        <div>
          <strong>{row.company.legal_name}</strong>
          <p>{row.company.email || "Contact requires verification"}</p>
          <a href={row.company.source_url} target="_blank" rel="noreferrer">
            Review published contact
          </a>
        </div>
      </div>
      <div className="document">
        <div className="dochead">Consent withdrawal & erasure</div>
        <dl>
          <dt>Reference</dt>
          <dd>{row.request_id}</dd>
          <dt>Sender header</dt>
          <dd>{row.header || "Company selection"}</dd>
        </dl>
        <label>
          Notice to be sent
          <textarea
            rows={15}
            value={body}
            maxLength={12000}
            readOnly={row.status !== "DRAFT"}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
      </div>
      <p className="hint">
        Confirm the company, account identifier and wording before sending.{" "}
        {settings.safe
          ? "Demo mail goes only to the configured verified inbox."
          : "Live mail goes to the published contact with a copy to your verified address."}
      </p>
      {row.status === "DRAFT" && (
        <button
          className="primary"
          disabled={busy || !body.trim()}
          onClick={() => send(body)}
        >
          <Send size={16} />
          {settings.safe ? "Send to demo inbox" : "Send reviewed notice"}
        </button>
      )}
    </section>
  );
}
