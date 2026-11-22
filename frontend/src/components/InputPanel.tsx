"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload,
  Camera,
  Search,
  ScanLine,
  FileImage,
  FileText,
} from "lucide-react";
import { compress } from "../lib/api";
import { samples, sampleImage } from "../lib/sampleSpam";
import type { AnalyzeInput, Company } from "../types/cipher_rakshak";

export default function InputPanel({
  companies,
  busy,
  analyze,
}: {
  companies: Company[];
  busy: boolean;
  analyze: (input: AnalyzeInput) => void;
}) {
  const [mode, setMode] = useState("image"),
    [image, setImage] = useState(""),
    [name, setName] = useState(""),
    [identifier, setIdentifier] = useState(""),
    [brand, setBrand] = useState(""),
    [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null);
  const ingest = useCallback(async (blob?: Blob) => {
    if (!blob) return;
    try {
      setImage(await compress(blob));
      setMode("image");
      setBrand("");
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      const blob = Array.from(e.clipboardData?.files || []).find((f) =>
        f.type.startsWith("image/"),
      );
      if (blob) {
        e.preventDefault();
        void ingest(blob);
      }
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [ingest]);
  return (
    <form
      className="card formcard"
      onSubmit={(e) => {
        e.preventDefault();
        const company = companies.find((c) => c.brand === brand);
        if (mode === "search" && !company) {
          setError("Choose a company from the directory.");
          return;
        }
        if (mode === "image" && !image) {
          setError("Add a screenshot or select a sample.");
          return;
        }
        setError("");
        analyze({
          name,
          identifier,
          company_id: company?.company_id,
          image: mode === "image" ? image : undefined,
        });
      }}
    >
      <h2>Evidence intake</h2>
      <div className="seg">
        <button
          type="button"
          aria-pressed={mode === "image"}
          onClick={() => setMode("image")}
        >
          <FileImage />
          Screenshot
        </button>
        <button
          type="button"
          aria-pressed={mode === "search"}
          onClick={() => setMode("search")}
        >
          <Search />
          Company search
        </button>
      </div>
      {mode === "image" && (
        <>
          <div
            className="drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void ingest(e.dataTransfer.files[0]);
            }}
          >
            <button
              type="button"
              className="dropmain"
              onClick={() => file.current?.click()}
            >
              {image ? (
                <img
                  alt="Selected evidence"
                  src={"data:image/jpeg;base64," + image}
                />
              ) : (
                <Upload />
              )}
              <strong>
                {image ? "Replace screenshot" : "Drop your screenshot here"}
              </strong>
              <small>Browse a file or paste from clipboard</small>
            </button>
            <button type="button" onClick={() => camera.current?.click()}>
              <Camera size={15} /> Camera
            </button>
          </div>
          <input
            hidden
            ref={file}
            type="file"
            accept="image/*"
            onChange={(e) => void ingest(e.target.files?.[0])}
          />
          <input
            hidden
            ref={camera}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => void ingest(e.target.files?.[0])}
          />
          <div className="samples">
            <small>Try a sample</small>
            {samples.map((s, i) => (
              <button
                type="button"
                key={s.brand}
                onClick={() => {
                  setImage(sampleImage(i));
                  setBrand(s.brand);
                  setError("");
                }}
              >
                {s.brand}
              </button>
            ))}
          </div>
        </>
      )}
      <label>
        {mode === "image" ? "Confirm company (optional)" : "Company"}
        <input
          list="directory"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          placeholder="Search the grievance directory"
        />
      </label>
      <datalist id="directory">
        {companies.map((c) => (
          <option key={c.company_id} value={c.brand} />
        ))}
      </datalist>
      <div className="fields">
        <label>
          Your name
          <input
            required
            maxLength={100}
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Contact receiving promotions
          <input
            required
            maxLength={160}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="Phone or email"
          />
        </label>
      </div>
      <small>
        <FileText size={14} /> Your contact and name appear in the notice.
      </small>
      {error && <p role="alert">{error}</p>}
      <button className="primary" disabled={busy}>
        <ScanLine size={17} />
        {busy ? "Processing" : "Analyze & draft notice"}
      </button>
    </form>
  );
}
