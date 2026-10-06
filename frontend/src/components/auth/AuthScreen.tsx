import React, { useState } from "react";
import { useSignIn, useSignUp } from "@clerk/clerk-react";
import { Loader2, AlertCircle, ShieldCheck, Sparkles } from "lucide-react";

export const AuthScreen: React.FC = () => {
  const { signIn, isLoaded: isSignInLoaded } = useSignIn();
  const { signUp, isLoaded: isSignUpLoaded } = useSignUp();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      // If sign-in fails due to transfer need, try sign-up redirect
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

  return (
    <div className="flex min-h-screen w-screen ambient-gradient items-center justify-center p-4 sm:p-6 text-zinc-100 select-none">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="relative">
            <img src="/logo.png" alt="AmbientAI Logo" className="w-16 h-16 object-contain drop-shadow-md" />
            <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-zinc-900 border border-zinc-700/80 shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-cyan-500" />
            </div>
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center justify-center gap-2">
              AmbientDesk{" "}
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300">
                Studio
              </span>
            </h1>
            <p className="text-xs text-zinc-400 max-w-sm leading-relaxed">
              Autonomous multi-agent workspace with live web intelligence, pgvector semantic retrieval, and AST calculations.
            </p>
          </div>
        </div>

        {/* Auth Glass Card */}
        <div className="rounded-2xl bg-zinc-950/90 backdrop-blur-xl border border-zinc-800/80 p-6 sm:p-8 shadow-2xl space-y-5 text-center">
          <div className="space-y-1.5 pb-1">
            <h2 className="text-base font-semibold text-white">Welcome to your Workspace</h2>
            <p className="text-xs text-zinc-400">
              Sign in or create your account using your Google identity.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs text-left">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Continue with Google SSO Button */}
          <div className="space-y-3 pt-1">
            <button
              type="button"
              id="google-sso-button"
              onClick={handleGoogleAuth}
              disabled={loading || (!isSignInLoaded && !isSignUpLoaded)}
              className="w-full py-3 px-4 rounded-xl bg-white hover:bg-zinc-100 active:bg-zinc-200 text-zinc-900 font-semibold shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer flex items-center justify-center gap-3 border border-zinc-300 disabled:opacity-60 disabled:cursor-not-allowed group"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-zinc-700" />
                  <span className="text-xs font-semibold text-zinc-800">
                    Connecting to Google...
                  </span>
                </>
              ) : (
                <>
                  {/* Official Google 4-Color Icon */}
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
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
                  <span className="text-xs sm:text-sm font-semibold tracking-tight text-zinc-900 group-hover:text-zinc-950">
                    Continue with Google
                  </span>
                </>
              )}
            </button>
          </div>

          {/* Security Badge */}
          <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>Secure single sign-on authenticated via Clerk & Google Identity</span>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-[11px] text-zinc-500 text-center font-mono">
          AmbientAI Core v1.0 • Enterprise Workspace
        </p>
      </div>
    </div>
  );
};
