import React, { useState } from "react";
import { useSignIn, useSignUp } from "@clerk/clerk-react";
import {
  Loader2,
  AlertCircle,
  ShieldCheck,
  Mail,
  Lock,
  ArrowRight,
  KeyRound,
} from "lucide-react";

export const AuthScreen: React.FC = () => {
  const { signIn, isLoaded: isSignInLoaded, setActive: setSignInActive } = useSignIn();
  const { signUp, isLoaded: isSignUpLoaded, setActive: setSignUpActive } = useSignUp();

  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Email verification state for Clerk sign-up
  const [pendingVerification, setPendingVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");

  // 1. Google OAuth SSO
  const handleGoogleAuth = async () => {
    if (!isSignInLoaded && !isSignUpLoaded) return;
    setLoading(true);
    setError(null);

    const redirectUrl = "/sso-callback";
    const redirectUrlComplete = "/";

    try {
      if (signIn) {
        await signIn.authenticateWithRedirect({
          strategy: "oauth_google",
          redirectUrl,
          redirectUrlComplete,
        });
      } else if (signUp) {
        await signUp.authenticateWithRedirect({
          strategy: "oauth_google",
          redirectUrl,
          redirectUrlComplete,
        });
      }
    } catch (err: any) {
      console.error("Google SSO redirection failed:", err);
      if (signUp && isSignUpLoaded) {
        try {
          await signUp.authenticateWithRedirect({
            strategy: "oauth_google",
            redirectUrl,
            redirectUrlComplete,
          });
          return;
        } catch (signUpErr: any) {
          setError(
            signUpErr?.errors?.[0]?.message ||
            signUpErr?.message ||
            "Unable to connect with Google. Please try again."
          );
        }
      } else {
        setError(
          err?.errors?.[0]?.message ||
          err?.message ||
          "Unable to connect with Google. Please try again."
        );
      }
      setLoading(false);
    }
  };

  // 2. Email & Password Sign In
  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSignInLoaded || !signIn) return;
    if (!email.trim() || !password) {
      setError("Please enter both email and password.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await signIn.create({
        identifier: email.trim(),
        password: password,
      });

      if (result.status === "complete") {
        if (setSignInActive) {
          await setSignInActive({ session: result.createdSessionId });
        }
      } else {
        setError("Sign in incomplete. Please check your credentials or use Google Sign-In.");
      }
    } catch (err: any) {
      console.error("Sign-in error:", err);
      setError(err?.errors?.[0]?.message || err?.message || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  // 3. Email & Password Sign Up
  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSignUpLoaded || !signUp) return;
    if (!email.trim() || !password) {
      setError("Please enter both email and password.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await signUp.create({
        emailAddress: email.trim(),
        password: password,
      });

      if (result.status === "complete") {
        if (setSignUpActive) {
          await setSignUpActive({ session: result.createdSessionId });
        }
      } else if (result.status === "missing_requirements") {
        // Send email verification code if required by Clerk configuration
        await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
        setPendingVerification(true);
      } else {
        setError("Sign up incomplete. Please try again or sign in with Google.");
      }
    } catch (err: any) {
      console.error("Sign-up error:", err);
      setError(err?.errors?.[0]?.message || err?.message || "Unable to create account.");
    } finally {
      setLoading(false);
    }
  };

  // 4. Verify 6-digit Email Code
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSignUpLoaded || !signUp) return;
    if (!verificationCode.trim()) {
      setError("Please enter the verification code sent to your email.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await signUp.attemptEmailAddressVerification({
        code: verificationCode.trim(),
      });

      if (result.status === "complete") {
        if (setSignUpActive) {
          await setSignUpActive({ session: result.createdSessionId });
        }
      } else {
        setError("Verification was not completed. Please try again.");
      }
    } catch (err: any) {
      console.error("Verification code error:", err);
      setError(err?.errors?.[0]?.message || err?.message || "Invalid or expired verification code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-screen ambient-gradient items-center justify-center p-4 sm:p-6 text-[#1C120C] select-none">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header with clean logo (no sparkles) */}
        <div className="flex flex-col items-center text-center space-y-2">
          <img
            src="/logo.png"
            alt="AmbientAI Logo"
            className="w-16 h-16 object-contain drop-shadow-sm"
          />
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1C120C] flex items-center justify-center gap-2">
              AmbientDesk{" "}
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-[#E6D8C6] border border-[#D8C5AE] text-[#183E6C] font-bold">
                Studio
              </span>
            </h1>
            <p className="text-xs text-[#584134] max-w-sm leading-relaxed">
              Autonomous multi-agent workspace with live web intelligence, pgvector semantic retrieval, and AST calculations.
            </p>
          </div>
        </div>

        {/* High-Contrast Card */}
        <div className="rounded-2xl bg-white/95 backdrop-blur-xl border border-[#D8C5AE] p-6 sm:p-8 shadow-xl space-y-5 text-left">
          {/* Header & Tabs */}
          {!pendingVerification ? (
            <>
              <div className="grid grid-cols-2 p-1 rounded-xl bg-[#F2E9DC] border border-[#D8C5AE] text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("signin");
                    setError(null);
                  }}
                  className={`py-2 rounded-lg transition-all cursor-pointer ${
                    authMode === "signin"
                      ? "bg-[#183E6C] text-white shadow-sm"
                      : "text-[#584134] hover:text-[#1C120C]"
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("signup");
                    setError(null);
                  }}
                  className={`py-2 rounded-lg transition-all cursor-pointer ${
                    authMode === "signup"
                      ? "bg-[#183E6C] text-white shadow-sm"
                      : "text-[#584134] hover:text-[#1C120C]"
                  }`}
                >
                  Create Account
                </button>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{error}</span>
                </div>
              )}

              {/* Method 1: Google SSO Button */}
              <div>
                <button
                  type="button"
                  id="google-sso-button"
                  onClick={handleGoogleAuth}
                  disabled={loading || (!isSignInLoaded && !isSignUpLoaded)}
                  className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-[#FAF5E8] active:bg-[#F2E9DC] text-[#1C120C] font-semibold shadow-xs transition-all duration-150 cursor-pointer flex items-center justify-center gap-3 border border-[#D8C5AE] disabled:opacity-60 disabled:cursor-not-allowed group"
                >
                  {loading && !email ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-[#183E6C]" />
                      <span className="text-xs font-semibold text-[#1C120C]">
                        Connecting to Google...
                      </span>
                    </>
                  ) : (
                    <>
                      {/* Official Google 4-Color Icon */}
                      <svg className="w-4.5 h-4.5 shrink-0" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                      <span className="text-xs sm:text-sm font-semibold tracking-tight text-[#1C120C]">
                        Continue with Google
                      </span>
                    </>
                  )}
                </button>
              </div>

              {/* OR Divider */}
              <div className="relative flex items-center justify-center">
                <div className="w-full border-t border-[#D8C5AE]" />
                <span className="absolute px-3 bg-white text-[10px] font-bold tracking-wider text-[#7C6355] uppercase">
                  or continue with email
                </span>
              </div>

              {/* Method 2: Standard Email & Password Form */}
              <form
                onSubmit={authMode === "signin" ? handleEmailSignIn : handleEmailSignUp}
                className="space-y-3.5 text-xs"
              >
                <div className="space-y-1.5">
                  <label className="text-[#36241B] font-semibold block">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#7C6355] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#FAF5E8]/60 border border-[#D8C5AE] text-[#1C120C] placeholder-[#7C6355]/60 focus:bg-white focus:outline-none focus:border-[#183E6C] focus:ring-1 focus:ring-[#183E6C] transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[#36241B] font-semibold block">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#7C6355] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#FAF5E8]/60 border border-[#D8C5AE] text-[#1C120C] placeholder-[#7C6355]/60 focus:bg-white focus:outline-none focus:border-[#183E6C] focus:ring-1 focus:ring-[#183E6C] transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#183E6C] hover:bg-[#102B4F] active:bg-[#0C203B] disabled:opacity-50 text-white font-semibold shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2 mt-2"
                >
                  {loading && email ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>{authMode === "signup" ? "Creating Account..." : "Signing In..."}</span>
                    </>
                  ) : (
                    <>
                      <span>{authMode === "signup" ? "Create Account & Enter" : "Sign In to Studio"}</span>
                      <ArrowRight className="w-4 h-4 text-white" />
                    </>
                  )}
                </button>
              </form>
            </>
          ) : (
            /* Email Verification View (if required during sign up) */
            <form onSubmit={handleVerifyCode} className="space-y-4 text-center">
              <div className="space-y-1.5">
                <div className="w-10 h-10 rounded-full bg-[#E6D8C6] border border-[#D8C5AE] text-[#183E6C] flex items-center justify-center mx-auto">
                  <KeyRound className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-[#1C120C]">Verify your Email</h3>
                <p className="text-xs text-[#584134]">
                  We sent a 6-digit confirmation code to <span className="font-semibold text-[#1C120C]">{email}</span>.
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs text-left">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{error}</span>
                </div>
              )}

              <input
                type="text"
                required
                maxLength={6}
                placeholder="123456"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                className="w-full text-center text-lg tracking-widest font-mono py-2.5 px-3 rounded-xl bg-[#FAF5E8]/60 border border-[#D8C5AE] text-[#1C120C] focus:bg-white focus:outline-none focus:border-[#183E6C]"
              />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPendingVerification(false);
                    setError(null);
                  }}
                  className="flex-1 py-2 px-3 rounded-xl border border-[#D8C5AE] text-[#584134] hover:bg-[#F2E9DC] text-xs font-semibold"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2 px-3 rounded-xl bg-[#183E6C] hover:bg-[#102B4F] text-white text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify Code"}
                </button>
              </div>
            </form>
          )}

          {/* Security Badge */}
          <div className="pt-2 border-t border-[#D8C5AE] flex items-center justify-center gap-1.5 text-[11px] text-[#7C6355]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Secure authentication powered by Clerk Identity</span>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-[11px] text-[#7C6355] text-center font-mono">
          AmbientAI Core v1.0 • Enterprise Workspace
        </p>
      </div>
    </div>
  );
};
