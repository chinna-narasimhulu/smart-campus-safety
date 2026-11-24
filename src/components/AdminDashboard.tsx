import {
  Activity,
  AlertOctagon,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Database,
  Plus,
  Settings,
  Shield,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import type {
  AdminAnalytics,
  AuditLogEntry,
  EmergencyContact,
  IncidentCategory,
  IncidentSummary,
  UserProfile,
  UserRole,
} from '../types';
import { CampusMap } from './CampusMap';
import { IncidentDetailView } from './IncidentDetailView';
import { formatLocalDateTime, formatRelativeTime, PriorityIndicator, StatusIndicator } from './StatusText';

export type AdminSubView =
  | 'overview'
  | 'incidents'
  | 'users'
  | 'responders'
  | 'analytics'
  | 'audit'
  | 'settings'
  | 'detail';

interface AdminDashboardProps {
  activeView: AdminSubView;
  selectedIncidentId: string | null;
  onNavigate: (view: AdminSubView, incidentId?: string | null) => void;
}

export function AdminDashboard({
  activeView,
  selectedIncidentId,
  onNavigate,
}: AdminDashboardProps) {
  const { lastRealtimeTick } = useAuth();
  const [analyticsScope, setAnalyticsScope] = useState<'all' | 'real' | 'test'>('all');
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [incidents, setIncidents] = useState<IncidentSummary[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [responders, setResponders] = useState<Array<UserProfile & { active_workload: number }>>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [categories, setCategories] = useState<IncidentCategory[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [smtpConfigured, setSmtpConfigured] = useState(false);

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // Create User/Responder form
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newDept, setNewDept] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('responder');
  const [newSpecialty, setNewSpecialty] = useState('Campus Security');

  // Demo seed password input
  const [demoPassword, setDemoPassword] = useState('');

  // New emergency contact form
  const [contactName, setContactName] = useState('');
  const [contactDept, setContactDept] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactAvail, setContactAvail] = useState('24/7');

  // New category form
  const [catName, setCatName] = useState('');
  const [catPriority, setCatPriority] = useState<'critical' | 'high' | 'medium' | 'low'>('medium');
  const [catDept, setCatDept] = useState('Campus Security');

  // Incident filter
  const [incStatusFilter, setIncStatusFilter] = useState('all');
  const [incDataFilter, setIncDataFilter] = useState<'all' | 'real' | 'test'>('all');
  const [assignChoice, setAssignChoice] = useState<Record<string, string>>({});

  const loadOverviewAndIncidents = useCallback(async () => {
    try {
      const [anaRes, incRes, respRes] = await Promise.all([
        apiFetch<AdminAnalytics>(`/api/admin/analytics?scope=${analyticsScope}`),
        apiFetch<{ incidents: IncidentSummary[] }>('/api/incidents?includeTest=true'),
        apiFetch<{ responders: Array<UserProfile & { active_workload: number }> }>('/api/admin/responders'),
      ]);
      setAnalytics(anaRes);
      setIncidents(incRes.incidents);
      setResponders(respRes.responders);
      setErr('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Unable to load admin data.');
    } finally {
      setLoading(false);
    }
  }, [analyticsScope]);

  const loadUsersAndAudit = useCallback(async () => {
    try {
      const [uRes, aRes] = await Promise.all([
        apiFetch<{ users: UserProfile[] }>('/api/admin/users'),
        apiFetch<{ logs: AuditLogEntry[] }>('/api/admin/audit-logs?limit=150'),
      ]);
      setUsers(uRes.users);
      setAuditLogs(aRes.logs);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Unable to load users or audit logs.');
    }
  }, []);

  const loadSettingsData = useCallback(async () => {
    try {
      const [sRes, cRes, catRes] = await Promise.all([
        apiFetch<{ settings: Record<string, string>; smtpConfigured: boolean }>('/api/admin/settings'),
        apiFetch<{ contacts: EmergencyContact[] }>('/api/public/emergency-contacts'),
        apiFetch<{ categories: IncidentCategory[] }>('/api/public/categories'),
      ]);
      setSettings(sRes.settings);
      setSmtpConfigured(sRes.smtpConfigured);
      setContacts(cRes.contacts);
      setCategories(catRes.categories);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Unable to load system settings.');
    }
  }, []);

  useEffect(() => {
    void loadOverviewAndIncidents();
  }, [loadOverviewAndIncidents]);

  useEffect(() => {
    if (activeView === 'users' || activeView === 'responders' || activeView === 'audit') {
      void loadUsersAndAudit();
    } else if (activeView === 'settings') {
      void loadSettingsData();
    }
  }, [activeView, loadUsersAndAudit, loadSettingsData]);

  useEffect(() => {
    if (lastRealtimeTick > 0) {
      void loadOverviewAndIncidents();
    }
  }, [lastRealtimeTick, loadOverviewAndIncidents]);

  if (activeView === 'detail' && selectedIncidentId) {
    return (
      <IncidentDetailView
        incidentId={selectedIncidentId}
        onBack={() => {
          void loadOverviewAndIncidents();
          onNavigate('incidents');
        }}
      />
    );
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    try {
      await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          fullName: newFullName,
          email: newEmail,
          password: newPassword,
          phone: newPhone,
          department: newDept,
          role: activeView === 'responders' ? 'responder' : newRole,
          responderSpecialty: newSpecialty,
        }),
      });
      setNewFullName('');
      setNewEmail('');
      setNewPassword('');
      setNewPhone('');
      setNewDept('');
      setMsg('Account created successfully.');
      await Promise.all([loadUsersAndAudit(), loadOverviewAndIncidents()]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create account.');
    }
  };

  const handleUpdateUser = async (
    targetId: string,
    payload: { role?: UserRole; accountStatus?: 'active' | 'inactive' }
  ) => {
    setMsg('');
    setErr('');
    try {
      await apiFetch(`/api/admin/users/${targetId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setMsg('Account updated.');
      await Promise.all([loadUsersAndAudit(), loadOverviewAndIncidents()]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Update failed.');
    }
  };

  const handleQuickAssign = async (incidentId: string) => {
    const activeResp = responders.filter((r) => r.account_status === 'active');
    const responderId = assignChoice[incidentId] || activeResp[0]?.id;
    if (!responderId) {
      setErr('No active responder available to assign.');
      return;
    }
    setMsg('');
    setErr('');
    try {
      const res = await apiFetch<{ responderName: string }>(`/api/admin/incidents/${incidentId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ responderId }),
      });
      setMsg(`Assigned incident to ${res.responderName}.`);
      await loadOverviewAndIncidents();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Assignment failed.');
    }
  };

  const handleQuickAck = async (incidentId: string, incidentNumber: string) => {
    setMsg('');
    setErr('');
    try {
      await apiFetch(`/api/incidents/${incidentId}/acknowledge`, {
        method: 'POST',
        body: JSON.stringify({
          note: 'Incident acknowledged by Campus Safety Administrator.',
        }),
      });
      setMsg(`Acknowledged ${incidentNumber} and notified the reporter.`);
      await loadOverviewAndIncidents();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Acknowledgement failed.');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    try {
      await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({ settings }),
      });
      setMsg('Campus system settings saved.');
      await loadSettingsData();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save settings.');
    }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    try {
      await apiFetch('/api/admin/emergency-contacts', {
        method: 'POST',
        body: JSON.stringify({
          name: contactName,
          department: contactDept,
          phone: contactPhone,
          availability: contactAvail,
        }),
      });
      setContactName('');
      setContactDept('');
      setContactPhone('');
      setMsg('Emergency contact added.');
      await loadSettingsData();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to add contact.');
    }
  };

  const handleDeleteContact = async (id: string) => {
    try {
      await apiFetch(`/api/admin/emergency-contacts/${id}`, { method: 'DELETE' });
      await loadSettingsData();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to delete contact.');
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    try {
      await apiFetch('/api/admin/categories', {
        method: 'POST',
        body: JSON.stringify({
          name: catName,
          defaultPriority: catPriority,
          responderDepartment: catDept,
        }),
      });
      setCatName('');
      setMsg('Incident category added.');
      await loadSettingsData();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to add category.');
    }
  };

  const handleLoadDemoData = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    try {
      await apiFetch('/api/admin/seed-demo', {
        method: 'POST',
        body: JSON.stringify({ testPassword: demoPassword }),
      });
      setDemoPassword('');
      setMsg(
        'Academic test dataset loaded (marked clearly as Test Data). Test accounts: student.demo@campus.edu, faculty.demo@campus.edu, security.demo@campus.edu, medical.demo@campus.edu.'
      );
      await Promise.all([loadOverviewAndIncidents(), loadUsersAndAudit()]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load demo dataset.');
    }
  };

  const handleClearDemoData = async () => {
    setMsg('');
    setErr('');
    try {
      await apiFetch('/api/admin/seed-demo', { method: 'DELETE' });
      setMsg('Academic test dataset cleared.');
      await Promise.all([loadOverviewAndIncidents(), loadUsersAndAudit()]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to clear demo dataset.');
    }
  };

  const filteredIncidents = incidents.filter((inc) => {
    const matchStatus = incStatusFilter === 'all' || inc.status === incStatusFilter;
    const matchData =
      incDataFilter === 'all' ||
      (incDataFilter === 'real' && inc.is_test_data === 0) ||
      (incDataFilter === 'test' && inc.is_test_data === 1);
    return matchStatus && matchData;
  });

  const activeResponders = responders.filter((r) => r.account_status === 'active');
  const maxCategoryCount = Math.max(1, ...(analytics?.byCategory.map((c) => c.count) || [1]));
  const pendingAckIncidents = incidents.filter((i) =>
    ['Submitted', 'Escalated'].includes(i.status)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Campus Safety Administration</h1>
          <p className="text-sm text-slate-600">
            Central oversight for incident dispatch, responder workload, RBAC accounts, and audit logs.
          </p>
        </div>

        {(activeView === 'overview' || activeView === 'analytics') && (
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg self-start">
            {(
              [
                ['all', 'All Records'],
                ['real', 'Real Incidents Only'],
                ['test', 'Test Data Only'],
              ] as const
            ).map(([scope, label]) => (
              <button
                key={scope}
                type="button"
                onClick={() => setAnalyticsScope(scope)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap ${
                  analyticsScope === scope
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {msg && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
          <span>{msg}</span>
        </div>
      )}
      {err && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800" role="alert">
          {err}
        </div>
      )}

      {/* Overview & Analytics */}
      {(activeView === 'overview' || activeView === 'analytics') && (
        <div className="space-y-6">
          {loading || !analytics ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
              Loading campus safety metrics...
            </div>
          ) : (
            <>
              {analytics.summary.test_records > 0 && analyticsScope === 'all' && (
                <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-3">
                  <span>
                    Metrics currently combine <strong>{analytics.summary.real_records}</strong> real records and{' '}
                    <strong>{analytics.summary.test_records}</strong> academic test records. Use the scope switch above to separate them.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="text-xs text-slate-500">Total Incidents</div>
                  <div className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
                    {analytics.summary.total}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="text-xs text-slate-500">Open Incidents</div>
                  <div className="text-2xl font-bold text-amber-700 tabular-nums mt-1">
                    {analytics.summary.open_count ?? 0}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="text-xs text-slate-500">Critical Open</div>
                  <div className="text-2xl font-bold text-red-700 tabular-nums mt-1">
                    {analytics.summary.critical_open ?? 0}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="text-xs text-slate-500">Unassigned</div>
                  <div className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
                    {analytics.summary.unassigned_count ?? 0}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="text-xs text-slate-500">Resolved / Closed</div>
                  <div className="text-2xl font-bold text-emerald-700 tabular-nums mt-1">
                    {analytics.summary.resolved_count ?? 0}
                  </div>
                </div>
              </div>

              {activeView === 'overview' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <AlertOctagon className="w-4 h-4 text-red-700" aria-hidden="true" />
                      <span>
                        Pending Acknowledgements ({pendingAckIncidents.length})
                      </span>
                    </h2>
                    <button
                      type="button"
                      onClick={() => onNavigate('incidents')}
                      className="text-xs font-semibold text-slate-700 hover:text-slate-900 underline"
                    >
                      Open Dispatch Queue
                    </button>
                  </div>

                  {pendingAckIncidents.length === 0 ? (
                    <p className="text-xs text-slate-500 py-2">
                      All submitted student and faculty reports have been acknowledged.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {pendingAckIncidents.slice(0, 8).map((inc) => (
                        <div
                          key={inc.id}
                          className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              <span className="font-mono font-bold text-slate-900 tabular-nums">
                                {inc.incident_number}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="capitalize">
                                {inc.reporter_name} ({inc.reporter_role})
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">{formatRelativeTime(inc.created_at)}</span>
                              {inc.is_test_data === 1 && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-semibold text-amber-700">Test Data</span>
                                </>
                              )}
                            </div>
                            <div className="text-sm font-semibold text-slate-900">{inc.title}</div>
                            <div className="flex flex-wrap items-center gap-3 text-xs">
                              <PriorityIndicator priority={inc.priority} isSos={inc.is_sos} />
                              <span className="text-slate-300" aria-hidden="true">·</span>
                              <StatusIndicator status={inc.status} />
                              <span className="text-slate-300" aria-hidden="true">·</span>
                              <span className="text-slate-600">
                                {inc.location_description || 'GPS coordinates shared'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => void handleQuickAck(inc.id, inc.incident_number)}
                              className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold whitespace-nowrap"
                            >
                              Acknowledge
                            </button>
                            <button
                              type="button"
                              onClick={() => onNavigate('detail', inc.id)}
                              className="px-3.5 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-900 text-xs font-semibold whitespace-nowrap"
                            >
                              Open Record
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-slate-500">Average Acknowledgement Time</div>
                    <div className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
                      {analytics.avgAckMinutes !== null ? `${analytics.avgAckMinutes} min` : 'No data yet'}
                    </div>
                  </div>
                  <Activity className="w-6 h-6 text-slate-400" aria-hidden="true" />
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-slate-500">Average Resolution Time</div>
                    <div className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
                      {analytics.avgResolutionMinutes !== null
                        ? `${analytics.avgResolutionMinutes} min`
                        : 'No resolved incidents yet'}
                    </div>
                  </div>
                  <BarChart3 className="w-6 h-6 text-slate-400" aria-hidden="true" />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Category Distribution */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <h2 className="text-sm font-bold text-slate-900">Incident Category Distribution</h2>
                  {analytics.byCategory.length === 0 ? (
                    <p className="text-xs text-slate-500">No incident records in selected scope.</p>
                  ) : (
                    <div className="space-y-3">
                      {analytics.byCategory.map((item) => (
                        <div key={item.category} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-medium text-slate-800">{item.category}</span>
                            <span className="font-mono font-bold text-slate-900 tabular-nums">
                              {item.count}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full bg-slate-900 rounded-full"
                              style={{ width: `${(item.count / maxCategoryCount) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Responder Workload */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <h2 className="text-sm font-bold text-slate-900">Responder Workload</h2>
                  {analytics.workload.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      No responder accounts configured yet. Add responders under Responder Management.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500">
                            <th className="py-2 pr-3">Responder</th>
                            <th className="py-2 pr-3">Department</th>
                            <th className="py-2 pr-3 text-right">Active</th>
                            <th className="py-2 text-right">Completed</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {analytics.workload.map((w) => (
                            <tr key={w.id}>
                              <td className="py-2.5 pr-3 font-semibold text-slate-900">{w.full_name}</td>
                              <td className="py-2.5 pr-3 text-slate-600">{w.responder_specialty}</td>
                              <td className="py-2.5 pr-3 text-right font-mono font-bold tabular-nums text-amber-700">
                                {w.active_count}
                              </td>
                              <td className="py-2.5 text-right font-mono font-bold tabular-nums text-emerald-700">
                                {w.completed_count}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {activeView === 'overview' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
                  <h2 className="text-sm font-bold text-slate-900">Active Campus Incident Map</h2>
                  <CampusMap
                    heightClass="h-64"
                    markers={incidents
                      .filter(
                        (i) =>
                          !['Resolved', 'Closed', 'Cancelled'].includes(i.status) &&
                          i.latitude !== null &&
                          i.longitude !== null
                      )
                      .map((i) => ({
                        id: i.id,
                        lat: i.latitude as number,
                        lng: i.longitude as number,
                        label: `${i.incident_number} · ${i.category}`,
                        sublabel: `${i.status} · ${i.location_description}`,
                        priority: i.priority,
                        isSos: i.is_sos,
                      }))}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Incident Management & Assignment */}
      {activeView === 'incidents' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <AlertOctagon className="w-5 h-5 text-red-700" aria-hidden="true" />
              <span>Incident Management & Responder Dispatch</span>
            </h2>
            <div className="flex flex-wrap gap-2">
              <select
                value={incDataFilter}
                onChange={(e) => setIncDataFilter(e.target.value as 'all' | 'real' | 'test')}
                aria-label="Filter real or test records"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs bg-white text-slate-900"
              >
                <option value="all">Real + Test Records</option>
                <option value="real">Real Records Only</option>
                <option value="test">Test Data Only</option>
              </select>
              <select
                value={incStatusFilter}
                onChange={(e) => setIncStatusFilter(e.target.value)}
                aria-label="Filter by incident status"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs bg-white text-slate-900"
              >
                <option value="all">All Statuses</option>
                <option value="Submitted">Submitted</option>
                <option value="Escalated">Escalated</option>
                <option value="Acknowledged">Acknowledged</option>
                <option value="Assigned">Assigned</option>
                <option value="In Progress">In Progress</option>
                <option value="Resolved">Resolved</option>
                <option value="Closed">Closed</option>
              </select>
            </div>
          </div>

          {filteredIncidents.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No incidents match the selected filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                    <th className="py-3 pr-4">Reference</th>
                    <th className="py-3 pr-4">Incident</th>
                    <th className="py-3 pr-4">Priority</th>
                    <th className="py-3 pr-4">Status</th>
                    <th className="py-3 pr-4">Assign Responder</th>
                    <th className="py-3 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredIncidents.map((inc) => (
                    <tr key={inc.id} className="hover:bg-slate-50">
                      <td className="py-3.5 pr-4 font-mono text-xs font-bold text-slate-900 tabular-nums whitespace-nowrap">
                        <div>{inc.incident_number}</div>
                        {inc.is_test_data === 1 && (
                          <div className="text-[11px] font-sans font-semibold text-amber-700">Test Data</div>
                        )}
                      </td>
                      <td className="py-3.5 pr-4">
                        <div className="font-semibold text-slate-900">{inc.title}</div>
                        <div className="text-xs text-slate-500">
                          {inc.category} · By {inc.reporter_name}
                        </div>
                      </td>
                      <td className="py-3.5 pr-4">
                        <PriorityIndicator priority={inc.priority} isSos={inc.is_sos} />
                      </td>
                      <td className="py-3.5 pr-4">
                        <StatusIndicator status={inc.status} />
                        {inc.assigned_responder_name && (
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Assigned: {inc.assigned_responder_name}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 pr-4">
                        {activeResponders.length === 0 ? (
                          <span className="text-xs text-slate-400">No responders</span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <select
                              value={assignChoice[inc.id] || activeResponders[0]?.id || ''}
                              onChange={(e) =>
                                setAssignChoice((prev) => ({ ...prev, [inc.id]: e.target.value }))
                              }
                              aria-label={`Select responder for ${inc.incident_number}`}
                              className="rounded border border-slate-300 px-2 py-1 text-xs bg-white max-w-[160px]"
                            >
                              {activeResponders.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.full_name} ({r.active_workload})
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => void handleQuickAssign(inc.id)}
                              className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
                            >
                              Assign
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 text-right space-x-2 whitespace-nowrap">
                        {['Submitted', 'Escalated'].includes(inc.status) && (
                          <button
                            type="button"
                            onClick={() => void handleQuickAck(inc.id, inc.incident_number)}
                            className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
                          >
                            Acknowledge
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onNavigate('detail', inc.id)}
                          className="text-xs font-semibold text-slate-900 hover:text-red-700 underline whitespace-nowrap"
                        >
                          Open Record
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

      {/* User & Responder Management */}
      {(activeView === 'users' || activeView === 'responders') && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-slate-700" aria-hidden="true" />
              <span>
                {activeView === 'responders'
                  ? 'Provision Authorized Responder Account'
                  : 'Create Campus User Account'}
              </span>
            </h2>
            <form onSubmit={handleCreateUser} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <input
                type="text"
                required
                placeholder="Full Name"
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="email"
                required
                placeholder="Email Address"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="password"
                required
                minLength={8}
                placeholder="Initial Password (min 8 chars)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="tel"
                placeholder="Phone Number"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="Department"
                value={newDept}
                onChange={(e) => setNewDept(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              {activeView === 'users' && (
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="student">Student</option>
                  <option value="faculty">Faculty</option>
                  <option value="responder">Authorized Responder</option>
                  <option value="admin">Administrator</option>
                </select>
              )}
              {(activeView === 'responders' || newRole === 'responder') && (
                <select
                  value={newSpecialty}
                  onChange={(e) => setNewSpecialty(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="Campus Security">Campus Security</option>
                  <option value="Medical & Health Services">Medical & Health Services</option>
                  <option value="Fire & Life Safety">Fire & Life Safety</option>
                  <option value="Facilities & Maintenance">Facilities & Maintenance</option>
                  <option value="All Departments">All Departments Coordinator</option>
                </select>
              )}
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold"
              >
                Create Account
              </button>
            </form>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-700" aria-hidden="true" />
              <span>
                {activeView === 'responders' ? 'Authorized Responders' : 'All Registered Accounts'}
              </span>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                    <th className="py-3 pr-4">Name & Email</th>
                    <th className="py-3 pr-4">Role</th>
                    <th className="py-3 pr-4">Department / Specialty</th>
                    <th className="py-3 pr-4">Status</th>
                    <th className="py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users
                    .filter((u) => (activeView === 'responders' ? u.role === 'responder' : true))
                    .map((u) => (
                      <tr key={u.id}>
                        <td className="py-3 pr-4">
                          <div className="font-semibold text-slate-900">
                            {u.full_name}
                            {u.is_test_account === 1 && (
                              <span className="ml-2 text-xs font-medium text-amber-700">(Test)</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500">{u.email}</div>
                        </td>
                        <td className="py-3 pr-4">
                          <select
                            value={u.role}
                            onChange={(e) =>
                              void handleUpdateUser(u.id, { role: e.target.value as UserRole })
                            }
                            aria-label={`Change role for ${u.full_name}`}
                            className="rounded border border-slate-300 px-2 py-1 text-xs bg-white capitalize"
                          >
                            <option value="student">Student</option>
                            <option value="faculty">Faculty</option>
                            <option value="responder">Responder</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td className="py-3 pr-4 text-xs text-slate-700">
                          {u.responder_specialty || u.department || '—'}
                        </td>
                        <td className="py-3 pr-4 text-xs font-semibold">
                          <span
                            className={
                              u.account_status === 'active' ? 'text-emerald-700' : 'text-red-700'
                            }
                          >
                            {u.account_status === 'active' ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              void handleUpdateUser(u.id, {
                                accountStatus: u.account_status === 'active' ? 'inactive' : 'active',
                              })
                            }
                            className="text-xs font-semibold text-slate-900 hover:text-red-700 underline"
                          >
                            {u.account_status === 'active' ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Audit Logs */}
      {activeView === 'audit' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-slate-700" aria-hidden="true" />
            <span>Security & Operational Audit Logs</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 pr-4">Timestamp</th>
                  <th className="py-2.5 pr-4">Actor</th>
                  <th className="py-2.5 pr-4">Action</th>
                  <th className="py-2.5 pr-4">Resource</th>
                  <th className="py-2.5">Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2.5 pr-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {formatLocalDateTime(log.timestamp)}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-800">
                      {log.actor_name ? `${log.actor_name} (${log.actor_role})` : 'System / Unauthenticated'}
                    </td>
                    <td className="py-2.5 pr-4 font-mono font-semibold text-slate-900">
                      {log.action}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-600">
                      {log.resource_type} {log.resource_id ? `· ${log.resource_id.slice(0, 8)}` : ''}
                    </td>
                    <td className="py-2.5 font-mono text-slate-500 max-w-xs truncate">
                      {log.metadata}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* System Settings, Contacts & Academic Demo Dataset */}
      {activeView === 'settings' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Settings className="w-4 h-4 text-slate-700" aria-hidden="true" />
              <span>Campus Configuration & Escalation Rules</span>
            </h2>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
              Server SMTP Email Provider Status:{' '}
              <strong className={smtpConfigured ? 'text-emerald-700' : 'text-amber-800'}>
                {smtpConfigured
                  ? 'Configured via environment variables'
                  : 'Not configured (email deliveries logged accurately as unconfigured)'}
              </strong>
            </div>

            <form onSubmit={handleSaveSettings} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Campus Name</label>
                <input
                  type="text"
                  value={settings.campus_name || ''}
                  onChange={(e) => setSettings((s) => ({ ...s, campus_name: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Auto-Escalation Threshold (Minutes)
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={settings.escalation_threshold_minutes || '5'}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, escalation_threshold_minutes: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Allow Student SOS Cancellation (Submitted/Acknowledged)
                </label>
                <select
                  value={settings.allow_student_sos_cancel || 'true'}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, allow_student_sos_cancel: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="true">Allowed</option>
                  <option value="false">Disabled (Responder must cancel)</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold"
                >
                  Save System Settings
                </button>
              </div>
            </form>
          </div>

          {/* Academic Demo Test Dataset Controls */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-slate-700" aria-hidden="true" />
              <span>Academic Demonstration Test Dataset</span>
            </h2>
            <p className="text-xs text-slate-600">
              Load sample student, faculty, and responder accounts alongside clearly flagged test incidents (<code className="font-mono">is_test_data = 1</code>) for live project evaluation. Enter a password of your choice for the test accounts.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <form onSubmit={handleLoadDemoData} className="flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  required
                  minLength={8}
                  value={demoPassword}
                  onChange={(e) => setDemoPassword(e.target.value)}
                  placeholder="Password for demo accounts (8+ chars)"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
                >
                  Load Test Dataset
                </button>
              </form>
              <button
                type="button"
                onClick={() => void handleClearDemoData()}
                className="px-4 py-2 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 text-xs font-semibold"
              >
                Clear Test Dataset
              </button>
            </div>
          </div>

          {/* Emergency Contacts & Categories */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900">Manage Emergency Contacts</h2>
              <form onSubmit={handleAddContact} className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  required
                  placeholder="Service Name"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  required
                  placeholder="Department"
                  value={contactDept}
                  onChange={(e) => setContactDept(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  required
                  placeholder="Phone Number"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  placeholder="Availability (e.g., 24/7)"
                  value={contactAvail}
                  onChange={(e) => setContactAvail(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
                <button
                  type="submit"
                  className="sm:col-span-2 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Add Emergency Contact</span>
                </button>
              </form>
              <div className="divide-y divide-slate-100 text-xs">
                {contacts.map((c) => (
                  <div key={c.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-900">{c.name}</div>
                      <div className="text-slate-500">
                        {c.phone} · {c.availability}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDeleteContact(c.id)}
                      aria-label={`Delete ${c.name}`}
                      className="p-1.5 text-red-700 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Shield className="w-4 h-4 text-slate-700" aria-hidden="true" />
                <span>Incident Categories & Routing</span>
              </h2>
              <form onSubmit={handleAddCategory} className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  required
                  placeholder="Category Name"
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
                <select
                  value={catPriority}
                  onChange={(e) =>
                    setCatPriority(e.target.value as 'critical' | 'high' | 'medium' | 'low')
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white"
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <input
                  type="text"
                  required
                  placeholder="Responder Department"
                  value={catDept}
                  onChange={(e) => setCatDept(e.target.value)}
                  className="sm:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
                <button
                  type="submit"
                  className="sm:col-span-2 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Add Category</span>
                </button>
              </form>
              <div className="divide-y divide-slate-100 text-xs">
                {categories.map((cat) => (
                  <div key={cat.id} className="py-2 flex items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-900">{cat.name}</div>
                      <div className="text-slate-500">{cat.responder_department}</div>
                    </div>
                    <PriorityIndicator priority={cat.default_priority} />
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
