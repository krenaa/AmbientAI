import React, { useState } from "react";
import {
  X,
  Shield,
  Activity,
  CheckCircle2,
  Clock,
  LogOut,
  Calendar,
  Layers,
  Key,
  User as UserIcon,
  Mail,
  Server,
  Loader2,
  AlertCircle
} from "lucide-react";
import type { UserProfile } from "../../types";
import { updateProfile } from "../../api";
import { useToast } from "../../Toast";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile | null;
  onLogout: () => void;
  onProfileUpdated?: (updatedUser: UserProfile) => void;
}

type TabType = "overview" | "account" | "password" | "admin";

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  onLogout,
  onProfileUpdated,
}) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>("overview");

  // Account Edit Form State
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  // Password Reset Form State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  if (!isOpen || !user) return null;

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountError(null);
    setIsSavingAccount(true);
    try {
      const res = await updateProfile({
        full_name: fullName.trim(),
        email: email.trim() !== user.email ? email.trim() : undefined,
      });
      if (onProfileUpdated) onProfileUpdated(res);
      showToast("Account details updated successfully.", "success");
    } catch (err: any) {
      setAccountError(err?.response?.data?.detail || "Failed to update account details");
    } finally {
      setIsSavingAccount(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters long.");
      return;
    }

    setIsSavingPassword(true);
    try {
      await updateProfile({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showToast("Password updated successfully.", "success");
    } catch (err: any) {
      setPasswordError(err?.response?.data?.detail || "Failed to update password. Verify current password.");
    } finally {
      setIsSavingPassword(false);
    }
  };

  const isAdmin = user.is_staff || user.role === "Admin";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="fixed inset-0 cursor-pointer" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-zinc-950 border border-zinc-800 p-5 sm:p-6 shadow-2xl z-10 space-y-5 text-left max-h-[90vh] overflow-y-auto scrollbar-thin">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          aria-label="Close dialog"
        >
          <X className="w-4 h-4" />
        </button>

        {/* User Identity Header */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-white font-bold text-base shadow-sm">
            {user.full_name ? user.full_name[0].toUpperCase() : user.email[0].toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-tight">
                {user.full_name || "System User"}
              </h3>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300">
                <Shield className="w-3 h-3 text-cyan-400" />
                {isAdmin ? "System Administrator" : user.role || "Member"}
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-mono mt-0.5">{user.email}</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1 p-1 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-medium">
          <button
            onClick={() => setActiveTab("overview")}
            className={`py-1.5 px-2 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === "overview"
                ? "bg-zinc-800 text-white font-semibold"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>
          <button
            onClick={() => setActiveTab("account")}
            className={`py-1.5 px-2 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === "account"
                ? "bg-zinc-800 text-white font-semibold"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span>Profile</span>
          </button>
          <button
            onClick={() => setActiveTab("password")}
            className={`py-1.5 px-2 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === "password"
                ? "bg-zinc-800 text-white font-semibold"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Security</span>
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveTab("admin")}
              className={`py-1.5 px-2 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 col-span-3 sm:col-span-1 ${
                activeTab === "admin"
                  ? "bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30"
                  : "text-cyan-400 hover:text-cyan-300"
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              <span>Admin</span>
            </button>
          )}
        </div>

        {/* Tab 1: Overview & Metrics */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1">
                <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Total Executions</span>
                </div>
                <p className="text-lg font-bold text-white font-mono">
                  {user.stats?.total_tasks ?? 0}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1">
                <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Completed</span>
                </div>
                <p className="text-lg font-bold text-emerald-400 font-mono">
                  {user.stats?.completed_tasks ?? 0}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1">
                <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Compute Time</span>
                </div>
                <p className="text-lg font-bold text-zinc-100 font-mono">
                  {user.stats?.total_execution_time_s
                    ? `${user.stats.total_execution_time_s.toFixed(1)}s`
                    : "0.0s"}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1">
                <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
                  <Layers className="w-3.5 h-3.5 text-purple-400" />
                  <span>Vector Database</span>
                </div>
                <p className="text-lg font-bold text-purple-300 font-mono">pgvector</p>
              </div>
            </div>

            {user.date_joined && (
              <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono pt-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>Registered: {new Date(user.date_joined).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Edit Profile & Email */}
        {activeTab === "account" && (
          <form onSubmit={handleUpdateAccount} className="space-y-3.5 text-xs">
            {accountError && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{accountError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-zinc-300 font-medium">Full Name</label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-zinc-300 font-medium">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSavingAccount}
              className="w-full py-2.5 px-4 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSavingAccount ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Profile Changes</span>
              )}
            </button>
          </form>
        )}

        {/* Tab 3: Security & Password Reset */}
        {activeTab === "password" && (
          <form onSubmit={handleUpdatePassword} className="space-y-3.5 text-xs">
            {passwordError && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{passwordError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-zinc-300 font-medium">Current Password</label>
              <input
                type="password"
                required
                placeholder="Enter current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-zinc-300 font-medium">New Password</label>
              <input
                type="password"
                required
                minLength={8}
                placeholder="Minimum 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-zinc-300 font-medium">Confirm New Password</label>
              <input
                type="password"
                required
                minLength={8}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
              />
            </div>

            <button
              type="submit"
              disabled={isSavingPassword}
              className="w-full py-2.5 px-4 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSavingPassword ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Updating Password...</span>
                </>
              ) : (
                <span>Update Password</span>
              )}
            </button>
          </form>
        )}

        {/* Tab 4: System Administration Info */}
        {activeTab === "admin" && isAdmin && (
          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2">
              <span className="font-semibold text-zinc-300 text-[11px] uppercase tracking-wider">
                System Health & Core Services
              </span>
              <div className="space-y-1.5 font-mono text-[11px]">
                <div className="flex items-center justify-between text-zinc-400">
                  <span>Backend Engine:</span>
                  <span className="text-emerald-400">FastAPI Unified + LangGraph</span>
                </div>
                <div className="flex items-center justify-between text-zinc-400">
                  <span>Vector Database:</span>
                  <span className="text-purple-400">PostgreSQL + pgvector</span>
                </div>
                <div className="flex items-center justify-between text-zinc-400">
                  <span>WebSocket Protocol:</span>
                  <span className="text-cyan-400">Native Async Bidirectional</span>
                </div>
                <div className="flex items-center justify-between text-zinc-400">
                  <span>HITL Governance:</span>
                  <span className="text-amber-400">Checkpoint State Persistence</span>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 text-zinc-400 leading-relaxed text-[11px]">
              System Administrator mode allows you to execute privileged pipelines, review security checkpoints, and monitor autonomous triage routing.
            </div>
          </div>
        )}

        {/* Logout Action */}
        <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
          <span className="text-[11px] text-zinc-500 font-mono">AmbientDesk Studio</span>
          <button
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-zinc-900 hover:bg-rose-500/10 border border-zinc-800 hover:border-rose-500/30 text-zinc-300 hover:text-rose-400 text-xs font-medium transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
