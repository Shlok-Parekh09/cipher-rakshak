import { useState } from "react";
import { Copy, Printer, X } from "lucide-react";
import type { Notice } from "../types/cipher_rakshak";
export default function EscalationModal({
  row,
  close,
}: {
  row: Notice;
  close: () => void;
}) {
  const [msg, setMsg] = useState("");
  return (
    <div className="overlay">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Complaint dossier"
        className="dossier"
      >
        <div className="row tools">
          <h2>Complaint dossier</h2>
          <button onClick={close} aria-label="Close dossier">
            <X />
          </button>
        </div>
        <article className="pleading">{row.complaint}</article>
        <div className="tools actions">
          <button onClick={() => window.print()}>
            <Printer /> Print / Save PDF
          </button>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(row.complaint || "");
                setMsg("Dossier copied.");
              } catch {
                setMsg("Select and copy the dossier text manually.");
              }
            }}
          >
            <Copy /> Copy dossier
          </button>
          <span role="status">{msg}</span>
        </div>
      </section>
    </div>
  );
}
