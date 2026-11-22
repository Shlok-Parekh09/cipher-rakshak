"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Upload,
  Camera,
  Search,
  ScanLine,
  FileImage,
  FileText,
  Paperclip,
  ChevronDown,
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
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const companyInputId = useId();
  const listId = companyInputId + "-companies";
  const query = brand.trim().toLowerCase();
  const matches = companies.filter((company) =>
    company.brand.toLowerCase().includes(query),
  );
  const activeCompany = directoryOpen ? matches[activeIndex] : undefined;
  const companyLabel = mode === "image" ? "Confirm company (optional)" : "Company";

  function closeDirectory() {
    setDirectoryOpen(false);
    setActiveIndex(-1);
  }
  function chooseCompany(company: Company) {
    setBrand(company.brand);
    setError("");
    closeDirectory();
  }
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
      <h2><span className="heading-icon"><Paperclip /></span>Add your evidence</h2>
      <p className="hint">Upload the promotion or find the sender in the company directory.</p>
      <div className="seg" role="group" aria-label="Evidence source">
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
              <small>Browse files or paste an image</small>
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
      <div className="company-picker">
        <label htmlFor={companyInputId}>{companyLabel}</label>
        <div className="company-field">
          <input
            id={companyInputId}
            role="combobox"
            autoComplete="off"
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={directoryOpen}
            aria-activedescendant={activeCompany ? listId + "-" + activeCompany.company_id : undefined}
            value={brand}
            onFocus={() => setDirectoryOpen(true)}
            onClick={() => setDirectoryOpen(true)}
            onBlur={closeDirectory}
            onChange={(event) => {
              setBrand(event.target.value);
              setDirectoryOpen(true);
              setActiveIndex(-1);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setDirectoryOpen(true);
                if (matches.length === 0) return;
                const next = event.key === "ArrowDown"
                  ? (activeIndex + 1) % matches.length
                  : activeIndex <= 0 ? matches.length - 1 : activeIndex - 1;
                setActiveIndex(next);
                document.getElementById(listId + "-" + matches[next].company_id)
                  ?.scrollIntoView({ block: "nearest" });
              } else if (event.key === "Escape" && directoryOpen) {
                event.preventDefault();
                closeDirectory();
              } else if (event.key === "Enter" && activeCompany) {
                event.preventDefault();
                chooseCompany(activeCompany);
              }
            }}
            placeholder="Search the grievance directory"
          />
          <ChevronDown size={16} aria-hidden="true" />
        </div>
        <ul id={listId} className="company-options" role="listbox" aria-label={companyLabel} hidden={!directoryOpen}>
          {directoryOpen && matches.map((company, index) => (
            <li
              id={listId + "-" + company.company_id}
              key={company.company_id}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseCompany(company)}
            >
              {company.brand}
            </li>
          ))}
        </ul>
        {directoryOpen && matches.length === 0 && (
          <p className="company-empty" role="status">No matching companies.</p>
        )}
      </div>
      <h3 className="details-title">Your details</h3>
      <div className="fields">
        <label>
          Your name
          <input
            required
            maxLength={100}
            autoComplete="name"
            placeholder="Full name"
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
