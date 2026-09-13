import React, { useState, useEffect } from "react";
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
  AlertCircle,
  Lock
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
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || "");
    }
  }, [user, isOpen]);

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
      });
      if (onProfileUpdated) onProfileUpdated(res);
      showToast("Profile details updated successfully.", "success");
    } catch (err: any) {
      setAccountError(err?.response?.data?.detail || "Failed to update profile details");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="fixed inset-0 cursor-pointer" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-[#FAF5E8] border border-[#D8C7B4] p-5 sm:p-6 shadow-2xl z-10 space-y-5 text-left max-h-[90vh] overflow-y-auto scrollbar-thin text-[#261912]">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-lg text-[#584134] hover:text-[#1C120C] hover:bg-[#EFE3D3] transition-colors cursor-pointer"
          aria-label="Close dialog"
        >
          <X className="w-4 h-4" />
        </button>

        {/* User Identity Header */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#183E6C] border border-[#102B4F] flex items-center justify-center text-white font-bold text-base shadow-sm">
            {user.full_name ? user.full_name[0].toUpperCase() : user.email[0].toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#1C120C] tracking-tight">
                {user.full_name || "System User"}
              </h3>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#EFE3D3] border border-[#D8C7B4] text-[#183E6C] font-semibold">
                <Shield className="w-3 h-3 text-[#183E6C]" />
                {isAdmin ? "System Administrator" : user.role || "Member"}
              </span>
            </div>
            <p className="text-xs text-[#584134] font-mono mt-0.5">{user.email}</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1 p-1 rounded-xl bg-[#EFE3D3] border border-[#D8C7B4] text-xs font-medium">
          <button
            onClick={() => setActiveTab("overview")}
            className={`py-1.5 px-2 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === "overview"
                ? "bg-[#183E6C] text-white font-bold shadow-xs"
                : "text-[#584134] hover:text-[#183E6C]"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>
          <button
            onClick={() => setActiveTab("account")}
            className={`py-1.5 px-2 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === "account"
                ? "bg-[#183E6C] text-white font-bold shadow-xs"
                : "text-[#584134] hover:text-[#183E6C]"
            }`}
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span>Profile</span>
          </button>
          <button
            onClick={() => setActiveTab("password")}
            className={`py-1.5 px-2 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === "password"
                ? "bg-[#183E6C] text-white font-bold shadow-xs"
                : "text-[#584134] hover:text-[#183E6C]"
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
                  ? "bg-[#183E6C] text-white font-bold shadow-xs"
                  : "text-[#183E6C] hover:text-[#102B4F]"
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
              <div className="p-3 rounded-xl bg-[#F2E9DC] border border-[#D8C7B4] space-y-1">
                <div className="flex items-center gap-1.5 text-[#584134] text-xs font-medium">
                  <Activity className="w-3.5 h-3.5 text-[#183E6C]" />
                  <span>Total Executions</span>
                </div>
                <p className="text-lg font-bold text-[#1C120C] font-mono">
                  {user.stats?.total_tasks ?? 0}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[#F2E9DC] border border-[#D8C7B4] space-y-1">
                <div className="flex items-center gap-1.5 text-[#584134] text-xs font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#183E6C]" />
                  <span>Completed</span>
                </div>
                <p className="text-lg font-bold text-[#183E6C] font-mono">
                  {user.stats?.completed_tasks ?? 0}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[#F2E9DC] border border-[#D8C7B4] space-y-1">
                <div className="flex items-center gap-1.5 text-[#584134] text-xs font-medium">
                  <Clock className="w-3.5 h-3.5 text-[#B84328]" />
                  <span>Compute Time</span>
                </div>
                <p className="text-lg font-bold text-[#1C120C] font-mono">
                  {user.stats?.total_execution_time_s
                    ? `${user.stats.total_execution_time_s.toFixed(1)}s`
                    : "0.0s"}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-[#F2E9DC] border border-[#D8C7B4] space-y-1">
                <div className="flex items-center gap-1.5 text-[#584134] text-xs font-medium">
                  <Layers className="w-3.5 h-3.5 text-[#A53920]" />
                  <span>Vector Database</span>
                </div>
                <p className="text-lg font-bold text-[#A53920] font-mono">pgvector</p>
              </div>
            </div>

            {user.date_joined && (
              <div className="flex items-center gap-2 text-xs text-[#584134] font-mono pt-1">
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
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#B84328]/10 border border-[#B84328]/30 text-[#8C2E16] text-xs font-medium">
                <AlertCircle className="w-4 h-4 shrink-0 text-[#B84328]" />
                <span>{accountError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[#1C120C] font-semibold">Full Name</label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-[#7C6355] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white border border-[#D8C7B4] text-[#1C120C] placeholder-[#7C6355] focus:outline-none focus:border-[#183E6C] focus:ring-1 focus:ring-[#183E6C]/30 text-xs shadow-2xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[#1C120C] font-semibold">Email Address</label>
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#7C6355] bg-[#EFE3D3] px-2 py-0.5 rounded-md border border-[#D8C7B4]">
                  <Lock className="w-2.5 h-2.5 text-[#7C6355]" />
                  <span>Cannot be changed</span>
                </span>
              </div>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#7C6355] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  readOnly
                  disabled
                  value={user.email}
                  className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-[#EFE3D3]/60 border border-[#D8C7B4] text-[#584134] text-xs font-mono select-none cursor-not-allowed opacity-90 shadow-2xs"
                  title="Email address is permanent and cannot be edited"
                />
                <Lock className="w-3.5 h-3.5 text-[#7C6355] absolute right-3 top-1/2 -translate-y-1/2" />
              </div>
              <p className="text-[10px] text-[#7C6355]">
                Account email is tied to authentication credentials and cannot be edited.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSavingAccount}
              className="w-full py-2.5 px-4 rounded-xl bg-[#183E6C] hover:bg-[#102B4F] text-white font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm mt-2"
            >
              {isSavingAccount ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
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
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#B84328]/10 border border-[#B84328]/30 text-[#8C2E16] text-xs font-medium">
                <AlertCircle className="w-4 h-4 shrink-0 text-[#B84328]" />
                <span>{passwordError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[#1C120C] font-semibold">Current Password</label>
              <input
                type="password"
                required
                placeholder="Enter current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-white border border-[#D8C7B4] text-[#1C120C] placeholder-[#7C6355] focus:outline-none focus:border-[#183E6C] focus:ring-1 focus:ring-[#183E6C]/30 text-xs shadow-2xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[#1C120C] font-semibold">New Password</label>
              <input
                type="password"
                required
                minLength={8}
                placeholder="Minimum 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-white border border-[#D8C7B4] text-[#1C120C] placeholder-[#7C6355] focus:outline-none focus:border-[#183E6C] focus:ring-1 focus:ring-[#183E6C]/30 text-xs shadow-2xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[#1C120C] font-semibold">Confirm New Password</label>
              <input
                type="password"
                required
                minLength={8}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-white border border-[#D8C7B4] text-[#1C120C] placeholder-[#7C6355] focus:outline-none focus:border-[#183E6C] focus:ring-1 focus:ring-[#183E6C]/30 text-xs shadow-2xs"
              />
            </div>

            <button
              type="submit"
              disabled={isSavingPassword}
              className="w-full py-2.5 px-4 rounded-xl bg-[#183E6C] hover:bg-[#102B4F] text-white font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm mt-2"
            >
              {isSavingPassword ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
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
            <div className="p-3 rounded-xl bg-[#F2E9DC] border border-[#D8C7B4] space-y-2">
              <span className="font-bold text-[#1C120C] text-[11px] uppercase tracking-wider">
                System Health & Core Services
              </span>
              <div className="space-y-1.5 font-mono text-[11px]">
                <div className="flex items-center justify-between text-[#584134]">
                  <span>Backend Engine:</span>
                  <span className="text-[#183E6C] font-bold">FastAPI Unified + LangGraph</span>
                </div>
                <div className="flex items-center justify-between text-[#584134]">
                  <span>Vector Database:</span>
                  <span className="text-[#A53920] font-bold">PostgreSQL + pgvector</span>
                </div>
                <div className="flex items-center justify-between text-[#584134]">
                  <span>WebSocket Protocol:</span>
                  <span className="text-[#183E6C] font-bold">Native Async Bidirectional</span>
                </div>
                <div className="flex items-center justify-between text-[#584134]">
                  <span>HITL Governance:</span>
                  <span className="text-[#B84328] font-bold">Checkpoint State Persistence</span>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#F2E9DC]/60 border border-[#D8C7B4] text-[#584134] leading-relaxed text-[11px]">
              System Administrator mode allows you to execute privileged pipelines, review security checkpoints, and monitor autonomous triage routing.
            </div>
          </div>
        )}

        {/* Logout Action */}
        <div className="pt-3 border-t border-[#D8C7B4] flex items-center justify-between">
          <span className="text-[11px] text-[#7C6355] font-mono">AmbientDesk Studio</span>
          <button
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-[#EFE3D3] hover:bg-rose-500/10 border border-[#D8C7B4] hover:border-rose-500/30 text-[#584134] hover:text-rose-600 text-xs font-semibold transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
