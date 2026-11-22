"use client";
import { useState, FormEvent, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Fingerprint,
  Eye,
  EyeOff,
  Shield,
  ScanLine,
  FileText,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { account } from "../../lib/api";
import "./auth.css";

type AuthMode = "signin" | "signup" | "confirm";

function AuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [signUpEmail, setSignUpEmail] = useState("");

  useEffect(() => {
    const modeParam = searchParams?.get("mode");
    const emailParam = searchParams?.get("email");
    
    if (modeParam === "signin" || modeParam === "signup") {
      setMode(modeParam);
    }
    if (emailParam) {
      setEmail(decodeURIComponent(emailParam));
    }
  }, [searchParams]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "signup") {
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match.");
        }
        if (password.length < 8) {
          throw new Error("Password must be at least 8 characters.");
        }
        await account("signup", email, password);
        setSignUpEmail(email);
        setMode("confirm");
        setPassword("");
        setConfirmPassword("");
      } else if (mode === "confirm") {
        const token = await account("confirm", signUpEmail || email, verificationCode);
        if (token) {
          localStorage.setItem("cipher-rakshak-token", token);
          router.push("/");
        } else {
          setMode("signin");
          setError("Email verified. Please sign in.");
        }
      } else {
        const token = await account("signin", email, password);
        if (token) {
          localStorage.setItem("cipher-rakshak-token", token);
          router.push("/");
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleOAuthSignIn(provider: "Google" | "GitHub" | "Apple" | "Microsoft") {
    const cognitoDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
    const clientId = process.env.NEXT_PUBLIC_CLIENT_ID;
    const redirectUri = typeof window !== "undefined" ? `${window.location.origin}/` : "";

    if (!cognitoDomain) {
      setError("OAuth is not configured. Please set NEXT_PUBLIC_COGNITO_DOMAIN.");
      return;
    }

    const identityProvider = {
      Google: "Google",
      GitHub: "GitHub",
      Apple: "SignInWithApple",
      Microsoft: "Microsoft",
    }[provider];

    const oauthUrl = `https://${cognitoDomain}/oauth2/authorize?identity_provider=${identityProvider}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=CODE&client_id=${clientId}&scope=openid email profile`;
    
    window.location.href = oauthUrl;
  }

  return (
    <div className="auth-container">
      {/* Left Branding Panel */}
      <div className="auth-left">
        <button
          onClick={() => router.push("/")}
          className="back-to-workspace"
        >
          <ArrowLeft size={16} />
          Back to home
        </button>

        <div className="auth-brand">
          <div className="brand-icon">
            <Fingerprint size={28} />
          </div>
          <div className="brand-text">
            <h1 className="brand-title">CipherRakshak</h1>
            <span className="brand-subtitle">Citizen privacy workspace</span>
          </div>
        </div>

        <div className="auth-hero">
          <h2 className="hero-title">Take back control of your personal data.</h2>
          <p className="hero-description">
            Identify promotional senders, dispatch consent-withdrawal notices, and
            track statutory compliance from one workspace.
          </p>
        </div>

        <div className="auth-features">
          <div className="feature">
            <div className="feature-icon">
              <Shield size={22} />
            </div>
            <div className="feature-content">
              <h3>Your account, your workspace</h3>
              <p>
                Keep your drafted notices and SES dispatch receipts connected to your
                citizen profile.
              </p>
            </div>
          </div>

          <div className="feature">
            <div className="feature-icon">
              <ScanLine size={22} />
            </div>
            <div className="feature-content">
              <h3>Inspect the sender</h3>
              <p>
                Match promotional screenshots against verified DLT headers and
                published grievance contacts.
              </p>
            </div>
          </div>

          <div className="feature">
            <div className="feature-icon">
              <FileText size={22} />
            </div>
            <div className="feature-content">
              <h3>Take the dossier with you</h3>
              <p>
                Track follow-up timelines and export printable complaint dossiers
                ready for signature.
              </p>
            </div>
          </div>
        </div>

        <p className="auth-disclaimer">
          Drafts and dispatches support citizen rights under the DPDP framework.
          Original evidence stays in your browser.
        </p>
      </div>

      {/* Right Authentication Panel */}
      <div className="auth-right">
        <div className="auth-form-container">
          {mode === "confirm" ? (
            <>
              <div className="auth-header">
                <h2>Confirm your email</h2>
                <p>Enter the verification code sent to {signUpEmail || email}</p>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label htmlFor="verification-code">Verification code</label>
                  <input
                    id="verification-code"
                    type="text"
                    required
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    placeholder="Enter 6-digit code"
                    maxLength={6}
                    autoComplete="one-time-code"
                  />
                </div>

                {error && <div className="auth-error">{error}</div>}

                <button type="submit" className="auth-button-primary" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 size={18} className="spinner" />
                      Verifying...
                    </>
                  ) : (
                    "Confirm email"
                  )}
                </button>

                <div className="auth-footer">
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setMode("signin")}
                  >
                    Back to sign in
                  </button>
                </div>
              </form>
            </>
          ) : mode === "signup" ? (
            <>
              <div className="auth-header">
                <h2>Create your account</h2>
                <p>Start managing consent withdrawal and compliance tracking.</p>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label htmlFor="signup-email">Email</label>
                  <input
                    id="signup-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="signup-password">Password</label>
                  <div className="password-input-wrapper">
                    <input
                      id="signup-password"
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="confirm-password">Confirm password</label>
                  <div className="password-input-wrapper">
                    <input
                      id="confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {error && <div className="auth-error">{error}</div>}

                <button type="submit" className="auth-button-primary" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 size={18} className="spinner" />
                      Creating account...
                    </>
                  ) : (
                    "Create account"
                  )}
                </button>
              </form>

              <div className="divider">
                <span>or continue with</span>
              </div>

              <div className="oauth-grid">
                <button
                  type="button"
                  className="oauth-button"
                  onClick={() => handleOAuthSignIn("Google")}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Google
                </button>

                <button
                  type="button"
                  className="oauth-button"
                  onClick={() => handleOAuthSignIn("GitHub")}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.137 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
                  </svg>
                  GitHub
                </button>

                <button
                  type="button"
                  className="oauth-button"
                  onClick={() => handleOAuthSignIn("Apple")}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                  </svg>
                  Apple
                </button>

                <button
                  type="button"
                  className="oauth-button"
                  onClick={() => handleOAuthSignIn("Microsoft")}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#f25022" d="M2 2h9v9H2z"/>
                    <path fill="#00a4ef" d="M13 2h9v9h-9z"/>
                    <path fill="#7fba00" d="M2 13h9v9H2z"/>
                    <path fill="#ffb900" d="M13 13h9v9h-9z"/>
                  </svg>
                  Microsoft
                </button>
              </div>

              <div className="auth-footer">
                <p className="auth-switch">
                  Already have an account?{" "}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      setMode("signin");
                      setError("");
                    }}
                  >
                    Sign in
                  </button>
                </p>
                <p className="auth-legal">
                  By continuing, you agree to our Terms and Conditions. Read our Privacy Policy.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="auth-header">
                <h2>Welcome back</h2>
                <p>Sign in to your CipherRakshak workspace.</p>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label htmlFor="email">Email</label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="password">Password</label>
                  <div className="password-input-wrapper">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Your password"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {error && <div className="auth-error">{error}</div>}

                <button type="submit" className="auth-button-primary" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 size={18} className="spinner" />
                      Signing in...
                    </>
                  ) : (
                    "Sign in"
                  )}
                </button>
              </form>

              <div className="divider">
                <span>or continue with</span>
              </div>

              <div className="oauth-grid">
                <button
                  type="button"
                  className="oauth-button"
                  onClick={() => handleOAuthSignIn("Google")}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Google
                </button>

                <button
                  type="button"
                  className="oauth-button"
                  onClick={() => handleOAuthSignIn("GitHub")}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.137 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
                  </svg>
                  GitHub
                </button>

                <button
                  type="button"
                  className="oauth-button"
                  onClick={() => handleOAuthSignIn("Apple")}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                  </svg>
                  Apple
                </button>

                <button
                  type="button"
                  className="oauth-button"
                  onClick={() => handleOAuthSignIn("Microsoft")}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#f25022" d="M2 2h9v9H2z"/>
                    <path fill="#00a4ef" d="M13 2h9v9h-9z"/>
                    <path fill="#7fba00" d="M2 13h9v9H2z"/>
                    <path fill="#ffb900" d="M13 13h9v9h-9z"/>
                  </svg>
                  Microsoft
                </button>
              </div>

              <div className="auth-footer">
                <p className="auth-switch">
                  New to CipherRakshak?{" "}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      setMode("signup");
                      setError("");
                    }}
                  >
                    Create an account
                  </button>
                </p>
                <p className="auth-legal">
                  By continuing, you agree to our Terms and Conditions. Read our Privacy Policy.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={
      <div className="auth-container">
        <div className="auth-right">
          <div className="auth-form-container">
            <div className="auth-header">
              <h2>Loading...</h2>
            </div>
          </div>
        </div>
      </div>
    }>
      <AuthContent />
    </Suspense>
  );
}
