"use client";
import { useEffect, useRef, useState, Suspense } from "react";
import {
  Fingerprint,
  FolderOpen,
  BookOpen,
  ScanLine,
  Building2,
  FileCheck2,
  Send,
  Clock,
  BriefcaseBusiness,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import LandingPage from "../components/LandingPage";
import Navbar from "../components/Navbar";
import InputPanel from "../components/InputPanel";
import NoticeWorkspace from "../components/NoticeWorkspace";
import ComplianceTracker from "../components/ComplianceTracker";
import EscalationModal from "../components/EscalationModal";
import { client, defaults } from "../lib/api";
import type { AnalyzeInput, Company, Notice, Settings } from "../types/cipher_rakshak";

const stages = [
  [ScanLine, "Add evidence", "Screenshot or company name"],
  [Building2, "Identify the sender", "Check the company and contact"],
  [FileCheck2, "Review your notice", "Edit the request before sending"],
  [Send, "Send and follow up", "Track replies and next steps"],
] as const;

type View = "landing" | "workspace";

function PageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const analysisStart = useRef<number | null>(null);
  const [workflowTime, setWorkflowTime] = useState<number | null>(null);
  const [settings, configure] = useState<Settings>(defaults);
  const [token, login] = useState("");
  const [ready, setReady] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [view, setView] = useState<View>("landing");
  const [pendingEmail, setPendingEmail] = useState<string>("");
  const [pendingSender, setPendingSender] = useState<string>("");
  
  const [tab, setTab] = useState("work");
  const [row, setRow] = useState<Notice | null>(null);
  const [dossier, setDossier] = useState<Notice | null>(null);
  const [rows, setRows] = useState<Notice[]>([]);
  const [cursor, setCursor] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [latency, setLatency] = useState(0);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    try {
      configure({
        ...defaults,
        ...JSON.parse(localStorage.getItem("cipher-rakshak-settings") || "{}"),
      });
      const savedToken = localStorage.getItem("cipher-rakshak-token") || "";
      if (savedToken) {
        login(savedToken);
        setView("workspace");
      }
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    let alive = true;
    setCompanies([]);
    if (ready && settings.endpoint && token) {
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
  }, [settings, ready, token]);

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
    if (!t) {
      // Signing out
      localStorage.removeItem("cipher-rakshak-token");
      setView("landing");
      setTab("work");
      setMsg("");
      setLatency(0);
    }
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

  function handleNavigateToAuth(mode: "signin" | "signup", email?: string, sender?: string) {
    if (email) setPendingEmail(email);
    if (sender) setPendingSender(sender);
    router.push(`/auth?mode=${mode}${email ? `&email=${encodeURIComponent(email)}` : ""}`);
  }

  // Show landing page if not authenticated
  if (view === "landing" && !token) {
    return <LandingPage onNavigateToAuth={handleNavigateToAuth} />;
  }

  // Show workspace if authenticated
  return (
    <>
      <div className="app">
        <a className="skip" href="#workspace">Skip to workspace</a>
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
        <main id="workspace">
          <section className="hero">
            <div className="hero-copy">
              <h1>
                {tab === "work" ? "Privacy notice desk" : "Compliance radar"}
              </h1>
              <p>
                {tab === "work"
                  ? "Identify who sent a promotion, review your request and ask them to stop contacting you."
                  : "Track responses, review deadlines and prepare a complaint dossier."}
              </p>
            </div>
            <div className="case-art" aria-hidden="true">
              <div className="contours" />
              <div className="paper backsheet" />
              <div className="paper topsheet"><i /><i /><i /><i /></div>
              <div className="case-folder"><span /><span /></div>
              <div className="case-seal"><Fingerprint /></div>
            </div>
          </section>
          <nav className="tabs" aria-label="Workspace views">
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
                <h2><FolderOpen /> Notice workflow</h2>
                {workflowTime !== null && <p className="mono">{workflowTime.toLocaleString()} ms from analysis to dispatch</p>}
                <ol>
                  {stages.map(([Icon, label, description], i) => (
                    <li key={label} className={i <= stage ? "active" : ""} aria-current={i === stage ? "step" : undefined}>
                      <span>
                        <Icon size={17} />
                      </span>
                      <div>
                        <strong>{label}</strong>
                        <small>{description}</small>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
              <section className="legal">
                <h3><BookOpen size={18} /> Statutory reference</h3>
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

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>}>
      <PageContent />
    </Suspense>
  );
}
