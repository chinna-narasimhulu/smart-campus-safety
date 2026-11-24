import {
  AlertOctagon,
  Bell,
  CheckCircle2,
  FilePlus2,
  Phone,
  Search,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import type { EmergencyContact, IncidentSummary } from '../types';
import { IncidentDetailView } from './IncidentDetailView';
import { IncidentForm } from './IncidentForm';
import { SosModal } from './SosModal';
import { formatLocalDateTime, formatRelativeTime, PriorityIndicator, StatusIndicator } from './StatusText';

export type StudentSubView =
  | 'overview'
  | 'report'
  | 'my-incidents'
  | 'detail'
  | 'contacts'
  | 'guidance'
  | 'profile';

interface StudentDashboardProps {
  activeView: StudentSubView;
  selectedIncidentId: string | null;
  onNavigate: (view: StudentSubView, incidentId?: string | null) => void;
  sosOpen: boolean;
  setSosOpen: (open: boolean) => void;
}

export function StudentDashboard({
  activeView,
  selectedIncidentId,
  onNavigate,
  sosOpen,
  setSosOpen,
}: StudentDashboardProps) {
  const { user, refreshUser, lastRealtimeTick } = useAuth();
  const [incidents, setIncidents] = useState<IncidentSummary[]>([]);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Profile form state
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [verifyToken, setVerifyToken] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');
  const [pushStatus, setPushStatus] = useState<string>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );

  useEffect(() => {
    if (user) {
      setFullName(user.full_name);
      setPhone(user.phone);
      setDepartment(user.department);
    }
  }, [user]);

  const loadData = useCallback(async () => {
    try {
      const [incRes, contactRes] = await Promise.all([
        apiFetch<{ incidents: IncidentSummary[] }>('/api/incidents'),
        apiFetch<{ contacts: EmergencyContact[] }>('/api/public/emergency-contacts'),
      ]);
      setIncidents(incRes.incidents);
      setContacts(contactRes.contacts);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard records.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (lastRealtimeTick > 0) {
      void loadData();
    }
  }, [lastRealtimeTick, loadData]);

  const activeIncidents = incidents.filter(
    (i) => !['Resolved', 'Closed', 'Cancelled'].includes(i.status)
  );

  const filteredIncidents = incidents.filter((inc) => {
    const matchesStatus = statusFilter === 'all' || inc.status === statusFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      inc.incident_number.toLowerCase().includes(q) ||
      inc.title.toLowerCase().includes(q) ||
      inc.category.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg('');
    setProfileErr('');
    try {
      await apiFetch('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ fullName, phone, department }),
      });
      await refreshUser();
      setProfileMsg('Profile details saved.');
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : 'Failed to update profile.');
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg('');
    setProfileErr('');
    try {
      await apiFetch('/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token: verifyToken.trim() }),
      });
      setVerifyToken('');
      await refreshUser();
      setProfileMsg('Email address verified successfully.');
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : 'Invalid verification token.');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg('');
    setProfileErr('');
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setProfileMsg('Password changed successfully.');
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : 'Unable to change password.');
    }
  };

  const handleEnableNotifications = async () => {
    if (typeof Notification === 'undefined') {
      setPushStatus('unsupported');
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setPushStatus(perm);
    } catch {
      setPushStatus('denied');
    }
  };

  return (
    <div className="space-y-6">
      <SosModal
        open={sosOpen}
        onClose={() => setSosOpen(false)}
        onSubmitted={(incidentId) => {
          setSosOpen(false);
          void loadData();
          onNavigate('detail', incidentId);
        }}
      />

      {activeView === 'report' && (
        <IncidentForm
          userRole={user?.role || 'student'}
          onCancel={() => onNavigate('overview')}
          onSubmitted={(incidentId) => {
            void loadData();
            onNavigate('detail', incidentId);
          }}
        />
      )}

      {activeView === 'detail' && selectedIncidentId && (
        <IncidentDetailView
          incidentId={selectedIncidentId}
          onBack={() => {
            void loadData();
            onNavigate('my-incidents');
          }}
        />
      )}

      {activeView === 'my-incidents' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h1 className="text-xl font-bold text-slate-900">My Incident Reports</h1>
              <p className="text-sm text-slate-600">
                Track acknowledgement, responder assignment, and live status updates for your submitted reports.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('report')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap shrink-0"
            >
              <FilePlus2 className="w-4 h-4" aria-hidden="true" />
              <span>Report Incident</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" aria-hidden="true" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by reference number, title, or category..."
                aria-label="Search my incidents"
                className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm text-slate-900"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white text-slate-900"
            >
              <option value="all">All Statuses</option>
              <option value="Submitted">Submitted</option>
              <option value="Acknowledged">Acknowledged</option>
              <option value="Assigned">Assigned</option>
              <option value="In Progress">In Progress</option>
              <option value="Escalated">Escalated</option>
              <option value="Resolved">Resolved</option>
              <option value="Closed">Closed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">Loading your incidents...</div>
          ) : filteredIncidents.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <p className="text-sm text-slate-600">No incident reports match the current filters.</p>
              <button
                type="button"
                onClick={() => onNavigate('report')}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold"
              >
                Submit a Safety Report
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                    <th className="py-3 pr-4">Reference</th>
                    <th className="py-3 pr-4">Incident</th>
                    <th className="py-3 pr-4">Priority</th>
                    <th className="py-3 pr-4">Status</th>
                    <th className="py-3 pr-4">Submitted</th>
                    <th className="py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredIncidents.map((inc) => (
                    <tr key={inc.id} className="hover:bg-slate-50">
                      <td className="py-3.5 pr-4 font-mono text-xs font-bold text-slate-900 tabular-nums whitespace-nowrap">
                        {inc.incident_number}
                      </td>
                      <td className="py-3.5 pr-4">
                        <div className="font-semibold text-slate-900">{inc.title}</div>
                        <div className="text-xs text-slate-500">
                          {inc.category} · {inc.location_description || 'GPS coordinates shared'}
                        </div>
                      </td>
                      <td className="py-3.5 pr-4">
                        <PriorityIndicator priority={inc.priority} isSos={inc.is_sos} />
                      </td>
                      <td className="py-3.5 pr-4">
                        <StatusIndicator status={inc.status} />
                      </td>
                      <td className="py-3.5 pr-4 text-xs text-slate-600 tabular-nums whitespace-nowrap">
                        {formatLocalDateTime(inc.created_at)}
                      </td>
                      <td className="py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => onNavigate('detail', inc.id)}
                          className="text-xs font-semibold text-slate-900 hover:text-red-700 underline whitespace-nowrap"
                        >
                          Track Response
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeView === 'profile' && (
        <div className="max-w-3xl space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
              <UserIcon className="w-5 h-5 text-slate-700" aria-hidden="true" />
              <div>
                <h1 className="text-lg font-bold text-slate-900">Profile & Account Settings</h1>
                <p className="text-xs text-slate-600">
                  Role: <span className="capitalize font-semibold">{user?.role}</span> · Email:{' '}
                  <span className="font-medium">{user?.email}</span>
                </p>
              </div>
            </div>

            {profileMsg && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
                <span>{profileMsg}</span>
              </div>
            )}
            {profileErr && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800" role="alert">
                {profileErr}
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="prof-name" className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Name
                  </label>
                  <input
                    id="prof-name"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="prof-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    id="prof-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="prof-dept" className="block text-xs font-semibold text-slate-700 mb-1">
                  Academic Department / Program
                </label>
                <input
                  id="prof-dept"
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
              >
                Save Profile
              </button>
            </form>
          </div>

          {user && user.email_verified === 0 && (
            <div className="bg-white border border-amber-300 rounded-xl p-6 space-y-3">
              <h2 className="text-sm font-bold text-slate-900">Email Verification Pending</h2>
              <p className="text-xs text-slate-600">
                Enter the verification token issued during registration to mark your email address as verified.
              </p>
              <form onSubmit={handleVerifyEmail} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  required
                  value={verifyToken}
                  onChange={(e) => setVerifyToken(e.target.value)}
                  placeholder="Paste verification token..."
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
                >
                  Verify Email
                </button>
              </form>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Bell className="w-4 h-4 text-slate-600" aria-hidden="true" />
              <span>Browser Push Alerts</span>
            </h2>
            <p className="text-xs text-slate-600">
              Enable browser notifications so you receive immediate alerts when responders acknowledge or update your report. Current permission:{' '}
              <strong className="text-slate-900">{pushStatus}</strong>.
            </p>
            <button
              type="button"
              onClick={() => void handleEnableNotifications()}
              className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-800"
            >
              Enable Browser Notifications
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900">Change Password</h2>
            <form onSubmit={handleChangePassword} className="space-y-3 max-w-md">
              <div>
                <label htmlFor="cur-pw" className="block text-xs font-semibold text-slate-700 mb-1">
                  Current Password
                </label>
                <input
                  id="cur-pw"
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="new-pw" className="block text-xs font-semibold text-slate-700 mb-1">
                  New Password (min 8 characters)
                </label>
                <input
                  id="new-pw"
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
              >
                Update Password
              </button>
            </form>
          </div>
        </div>
      )}

      {activeView === 'overview' && (
        <div className="space-y-6">
          {error && (
            <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800" role="alert">
              {error}
            </div>
          )}

          {/* Immediate Emergency Action Banner */}
          <div className="bg-slate-900 text-white rounded-xl p-6 md:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="text-xs font-semibold text-red-400">
                {user?.role === 'faculty' ? 'Faculty Safety Portal' : 'Student Safety Portal'}
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                Immediate Campus Emergency & Incident Reporting
              </h1>
              <p className="text-sm text-slate-300 leading-relaxed">
                Raise an SOS emergency alert for urgent medical, fire, or physical safety threats, or submit a detailed safety report with consent-based location sharing.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setSosOpen(true)}
                className="inline-flex items-center justify-center gap-2.5 px-6 py-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-base font-extrabold shadow-lg focus-visible:outline-2 focus-visible:outline-white whitespace-nowrap"
              >
                <AlertOctagon className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span>SOS Emergency</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('report')}
                className="inline-flex items-center justify-center gap-2 px-5 py-4 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm font-semibold whitespace-nowrap"
              >
                <FilePlus2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Report Incident</span>
              </button>
            </div>
          </div>

          {/* Summary Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs font-medium text-slate-500">My Active Alerts & Reports</div>
              <div className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
                {activeIncidents.length}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs font-medium text-slate-500">Total Submitted by You</div>
              <div className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
                {incidents.length}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs font-medium text-slate-500">Resolved Reports</div>
              <div className="text-2xl font-bold text-emerald-700 tabular-nums mt-1">
                {incidents.filter((i) => ['Resolved', 'Closed'].includes(i.status)).length}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Active & Recent Incidents */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h2 className="text-base font-bold text-slate-900">Active & Recent Incidents</h2>
                <button
                  type="button"
                  onClick={() => onNavigate('my-incidents')}
                  className="text-xs font-semibold text-slate-700 hover:text-slate-900 underline"
                >
                  View All Reports
                </button>
              </div>

              {loading ? (
                <p className="text-sm text-slate-500 py-6">Loading your reports...</p>
              ) : incidents.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <ShieldCheck className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
                  <p className="text-sm text-slate-600">You have not submitted any incidents yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {incidents.slice(0, 6).map((inc) => (
                    <div
                      key={inc.id}
                      className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="font-mono font-bold text-slate-900 tabular-nums">
                            {inc.incident_number}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{inc.category}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">{formatRelativeTime(inc.created_at)}</span>
                        </div>
                        <div className="text-sm font-semibold text-slate-900">{inc.title}</div>
                        <div className="flex items-center gap-3">
                          <PriorityIndicator priority={inc.priority} isSos={inc.is_sos} />
                          <span className="text-slate-300" aria-hidden="true">·</span>
                          <StatusIndicator status={inc.status} />
                          {inc.assigned_responder_name && (
                            <>
                              <span className="text-slate-300" aria-hidden="true">·</span>
                              <span className="text-xs text-slate-600">
                                Responder: {inc.assigned_responder_name}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onNavigate('detail', inc.id)}
                        className="px-3.5 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-800 whitespace-nowrap self-start sm:self-center"
                      >
                        Track Status
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Emergency Contacts Quick Reference */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-red-700" aria-hidden="true" />
                  <span>Emergency Contacts</span>
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigate('contacts')}
                  className="text-xs font-semibold text-slate-700 hover:text-slate-900 underline"
                >
                  All Contacts
                </button>
              </div>
              <div className="divide-y divide-slate-100">
                {contacts.slice(0, 5).map((c) => (
                  <div key={c.id} className="py-3 space-y-0.5">
                    <div className="text-sm font-semibold text-slate-900">{c.name}</div>
                    <div className="text-xs text-slate-500">{c.availability}</div>
                    <a
                      href={`tel:${c.phone.replace(/[^+\d]/g, '')}`}
                      className="inline-block text-xs font-mono font-bold text-red-700 hover:underline mt-0.5 tabular-nums"
                    >
                      {c.phone}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
