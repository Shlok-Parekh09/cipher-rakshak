"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint, CircleUserRound, LogOut, SlidersHorizontal, Timer } from "lucide-react";
import { endpoint } from "../lib/api";
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
  const router = useRouter();
  const [edit, setEdit] = useState(settings);
  const [accountOpen, setAccountOpen] = useState(false);
  
  function openAccount() {
    if (token) {
      // Show settings dialog for signed-in users
      setEdit(settings);
    } else {
      // Navigate to auth page for non-signed-in users
      router.push("/auth");
    }
  }
  return (
    <header>
      <div className="nav">
        <a href="#" className="brand">
          <span className="mark">
            <Fingerprint />
          </span>
          <span>Cipher<span className="brand-tail">Rakshak</span></span>
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
          onClick={openAccount}
        >
          <SlidersHorizontal size={16} />
          {settings.safe ? "Safe mode" : "Live dispatch"}
        </button>
        <button
          type="button"
          className="account-button"
          aria-expanded={token ? accountOpen : undefined}
          aria-controls={accountOpen && token ? "account-panel" : undefined}
          onClick={() => token ? setAccountOpen((open) => !open) : router.push("/auth")}
        >
          <CircleUserRound size={21} aria-hidden="true" style={{ display: "block" }} /> {token ? "Account" : "Sign in"}
        </button>
        {accountOpen && token && (
          <div className="account-menu" id="account-panel">
            <div className="account-menu-title"><CircleUserRound size={18} /> Signed in</div>
            <button type="button" className="account-menu-signout" onClick={() => { setAccountOpen(false); login(""); }}>
              <LogOut size={16} aria-hidden="true" /> Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
