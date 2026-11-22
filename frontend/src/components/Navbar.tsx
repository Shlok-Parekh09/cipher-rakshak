"use client";
import { useState } from "react";
import { Shield, SlidersHorizontal, Timer, X, LockKeyhole } from "lucide-react";
import { account, endpoint } from "../lib/api";
import type { Settings } from "../types/cipher_rakshak";

interface Props {
  settings: Settings;
  save: (s: Settings) => void;
  token: string;
  login: (t: string) => void;
  latency: number;
  busy: boolean;
}
export default function Navbar({
  settings,
  save,
  token,
  login,
  latency,
  busy,
}: Props) {
  const [open, setOpen] = useState(false),
    [edit, setEdit] = useState(settings),
    [mode, setMode] = useState<"signin" | "signup" | "confirm">("signin");
  const [email, setEmail] = useState(""),
    [secret, setSecret] = useState(""),
    [msg, setMsg] = useState(""),
    [working, setWorking] = useState(false);
  return (
    <header>
      <div className="nav">
        <a href="#" className="brand">
          <span className="mark">
            <Shield />
          </span>
          CipherRakshak
        </a>
        <span className="navlabel">Citizen privacy workspace</span>
        <span className="spacer" />
        {latency > 0 && (
          <span className="mono">
            <Timer size={15} /> {(latency / 1000).toFixed(2)} s
          </span>
        )}
        <button
          className="subtle"
          disabled={busy}
          onClick={() => {
            setEdit(settings);
            setOpen(true);
            setMsg("");
          }}
        >
          <SlidersHorizontal size={16} />
          {settings.safe ? "Safe mode" : "Live dispatch"}
        </button>
      </div>
      {open && (
        <dialog open aria-label="Connection and account">
          <div className="row">
            <h2>Connection & account</h2>
            <button aria-label="Close" onClick={() => setOpen(false)}>
              <X />
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              try {
                save({ ...edit, endpoint: endpoint(edit.endpoint) });
                setMsg("Connection saved.");
              } catch (err) {
                setMsg((err as Error).message);
              }
            }}
          >
            <label>
              Trusted CipherRakshak API URL
              <input
                type="url"
                value={edit.endpoint}
                required
                onChange={(e) => setEdit({ ...edit, endpoint: e.target.value })}
              />
            </label>
            <label className="inline">
              <input
                type="checkbox"
                checked={edit.safe}
                onChange={(e) => setEdit({ ...edit, safe: e.target.checked })}
              />{" "}
              Route mail to the demo inbox
            </label>
            {edit.safe && (
              <label>
                Verified demo inbox
                <input
                  type="email"
                  value={edit.recipient}
                  onChange={(e) =>
                    setEdit({ ...edit, recipient: e.target.value })
                  }
                />
              </label>
            )}
            <button>Save connection</button>
          </form>
          <hr />
          {token ? (
            <button
              onClick={() => {
                login("");
                setMsg("Signed out.");
              }}
            >
              Sign out
            </button>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setWorking(true);
                try {
                  const t = await account(mode, email, secret);
                  setSecret("");
                  if (t) {
                    login(t);
                    setOpen(false);
                  } else if (mode === "signup") {
                    setMode("confirm");
                    setMsg("Enter the verification code from your email.");
                  } else {
                    setMode("signin");
                    setMsg("Email verified. Sign in to continue.");
                  }
                } catch (err) {
                  setMsg((err as Error).message);
                } finally {
                  setWorking(false);
                }
              }}
            >
              <label>
                Citizen account
                <select
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value as typeof mode);
                    setSecret("");
                  }}
                >
                  <option value="signin">Sign in</option>
                  <option value="signup">Create account</option>
                  <option value="confirm">Verify email</option>
                </select>
              </label>
              <label>
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label>
                {mode === "confirm" ? "Email verification code" : "Password"}
                <input
                  type={mode === "confirm" ? "text" : "password"}
                  required
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                />
              </label>
              <button disabled={working}>
                <LockKeyhole size={15} />
                {mode === "signin"
                  ? "Sign in"
                  : mode === "signup"
                    ? "Create account"
                    : "Verify email"}
              </button>
            </form>
          )}
          <p role="status">{msg}</p>
        </dialog>
      )}
    </header>
  );
}
