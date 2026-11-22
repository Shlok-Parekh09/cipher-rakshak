"use client";
import { useEffect, useRef, useState } from "react";
import {
  Scale,
  ScanLine,
  Building2,
  FileCheck2,
  Send,
  Clock,
  Layers,
  BriefcaseBusiness,
  ShieldCheck,
} from "lucide-react";
import Navbar from "../components/Navbar";
import InputPanel from "../components/InputPanel";
import NoticeWorkspace from "../components/NoticeWorkspace";
import ComplianceTracker from "../components/ComplianceTracker";
import EscalationModal from "../components/EscalationModal";
import { client, defaults } from "../lib/api";
import type { AnalyzeInput, Company, Notice, Settings } from "../types/cipher_rakshak";

const stages = [
  [ScanLine, "Input evidence"],
  [Building2, "Match recipient"],
  [FileCheck2, "Review notice"],
  [Send, "Dispatch & track"],
] as const;
export default function Page() {
  const analysisStart = useRef<number | null>(null);
  const [workflowTime, setWorkflowTime] = useState<number | null>(null);
  const [settings, configure] = useState<Settings>(defaults),
    [token, login] = useState(""),
    [ready, setReady] = useState(false),
    [companies, setCompanies] = useState<Company[]>([]);
  const [tab, setTab] = useState("work"),
    [row, setRow] = useState<Notice | null>(null),
    [dossier, setDossier] = useState<Notice | null>(null),
    [rows, setRows] = useState<Notice[]>([]);
  const [cursor, setCursor] = useState<Record<string, string> | null>(null),
    [busy, setBusy] = useState(false),
    [msg, setMsg] = useState(""),
    [latency, setLatency] = useState(0),
    [stage, setStage] = useState(0);
  useEffect(() => {
    try {
      configure({
        ...defaults,
        ...JSON.parse(localStorage.getItem("cipher-rakshak-settings") || "{}"),
      });
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    let alive = true;
    setCompanies([]);
    if (ready && settings.endpoint) {
      client(settings, "")
        .directory()
        .then((r) => {
          if (alive) setCompanies(r.items);
        })
        .catch(() => {
          if (alive)
            setMsg(
              "Directory unavailable. Check your API connection in settings.",
            );
        });
    }
    return () => {
      alive = false;
    };
  }, [settings, ready]);
  const api = client(settings, token);
  async function run(task: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMsg("");
    const t = performance.now();
    try {
      await task();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setLatency(Math.round(performance.now() - t));
      setBusy(false);
    }
  }
  async function load(append = false) {
    const p = await api.track(append ? cursor || undefined : undefined);
    setRows((prev) =>
      append
        ? [
            ...prev,
            ...p.items.filter(
              (i) => !prev.some((r) => r.request_id === i.request_id),
            ),
          ]
        : p.items,
    );
    setCursor(p.cursor);
  }
  function resetAccount(t: string) {
    analysisStart.current = null;
    setWorkflowTime(null);
    login(t);
    setRows([]);
    setCursor(null);
    setRow(null);
    setDossier(null);
    setStage(0);
  }
  function analyze(input: AnalyzeInput) {
    void run(async () => {
      analysisStart.current = performance.now();
      setWorkflowTime(null);
      setStage(1);
      try {
        setRow(await api.analyze(input));
        setStage(2);
      } catch (e) {
        setStage(0);
        throw e;
      }
    });
  }
  return (
    <>
      <div className="app">
        <Navbar
          settings={settings}
          token={token}
          login={resetAccount}
          latency={latency}
          busy={busy}
          save={(s) => {
            if (s.endpoint !== settings.endpoint) resetAccount("");
            configure(s);
            localStorage.setItem("cipher-rakshak-settings", JSON.stringify(s));
          }}
        />
        <main>
          <div className="breadcrumb">
            <Layers size={15} /> Workspace <span>/</span>{" "}
            {tab === "work" ? "Notice desk" : "Compliance radar"}
          </div>
          <section className="hero">
            <div>
              <div className="eyeline">
                <span /> DATA PRINCIPAL WORKSPACE
              </div>
              <h1>
                {tab === "work" ? "Privacy notice desk" : "Compliance radar"}
              </h1>
              <p>
                {tab === "work"
                  ? "Turn an unwanted promotion into a reviewed privacy request."
                  : "Track responses, review deadlines and prepare a complaint dossier."}
              </p>
            </div>
            <Scale className="heroicon" strokeWidth={1} />
          </section>
          <nav className="tabs">
            <button
              aria-current={tab === "work" ? "page" : undefined}
              onClick={() => setTab("work")}
            >
              <BriefcaseBusiness /> Notice desk
            </button>
            <button
              aria-current={tab === "track" ? "page" : undefined}
              onClick={() => {
                setTab("track");
                void run(() => load());
              }}
            >
              <Clock /> Compliance radar
            </button>
          </nav>
          {msg && (
            <p className="alert" role="alert">
              {msg}
            </p>
          )}
          <div className="workgrid">
            <div>
              {tab === "work" ? (
                <>
                  {row ? (
                    <>
                      <button
                        className="back"
                        onClick={() => {
                          setRow(null);
                          setStage(0);
                        }}
                      >
                        Start another notice
                      </button>
                      <NoticeWorkspace
                        row={row}
                        settings={settings}
                        busy={busy}
                        send={(notice) =>
                          void run(async () => {
                            setRow(
                              await api.dispatch({
                                request_id: row.request_id,
                                notice,
                                safe_mode: settings.safe,
                                ...(settings.safe && settings.recipient
                                  ? { demo_recipient: settings.recipient }
                                  : {}),
                              }),
                            );
                            setStage(3);
                            if (analysisStart.current !== null) {
                              setWorkflowTime(Math.round(performance.now() - analysisStart.current));
                              analysisStart.current = null;
                            }
                            setTab("track");
                            await load();
                          })
                        }
                      />
                    </>
                  ) : (
                    <InputPanel
                      companies={companies}
                      busy={busy}
                      analyze={analyze}
                    />
                  )}
                </>
              ) : (
                <ComplianceTracker
                  rows={rows}
                  busy={busy}
                  refresh={() => void run(() => load())}
                  more={cursor ? () => void run(() => load(true)) : undefined}
                  review={(r) => {
                    analysisStart.current = null;
                    setWorkflowTime(null);
                    setRow(r);
                    setStage(r.status === "DRAFT" ? 2 : 3);
                    setTab("work");
                  }}
                  action={(r, a) =>
                    void run(async () => {
                      if (a === "escalate") {
                        setDossier(
                          r.complaint
                            ? r
                            : await api.escalate({ request_id: r.request_id }),
                        );
                      } else {
                        await api.update(r.request_id, { action: a });
                      }
                      await load();
                    })
                  }
                />
              )}
            </div>
            <aside>
              <section className="card flow">
                <h2>Notice pipeline</h2>
                {workflowTime !== null && <p className="mono">{workflowTime.toLocaleString()} ms from analysis to dispatch</p>}
                <ol>
                  {stages.map(([Icon, label], i) => (
                    <li key={label} className={i <= stage ? "active" : ""}>
                      <span>
                        <Icon size={17} />
                      </span>
                      <div>
                        <small>STEP 0{i + 1}</small>
                        <strong>{label}</strong>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
              <section className="legal">
                <ShieldCheck />
                <h3>Statutory reference</h3>
                <p>
                  Consent withdrawal and erasure under sections 6(4) and 12(3)
                  are scheduled to commence in May 2027. The seven-day tracker
                  marks a requested follow-up.
                </p>
                <a
                  href="https://www.indiacode.nic.in/indiacode/handle/123456789/22037"
                  target="_blank"
                  rel="noreferrer"
                >
                  Read the DPDP Act
                </a>
              </section>
            </aside>
          </div>
        </main>
      </div>
      {dossier && (
        <EscalationModal row={dossier} close={() => setDossier(null)} />
      )}
    </>
  );
}
