import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  Lock,
  MapPin,
  RefreshCw,
  ShieldAlert,
  UserCheck,
  XCircle,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch, downloadAuthorizedAttachment } from '../lib/api';
import type { IncidentDetailResponse, IncidentStatus, UserProfile } from '../types';
import { CampusMap } from './CampusMap';
import { formatLocalDateTime, PriorityIndicator, StatusIndicator } from './StatusText';

interface IncidentDetailViewProps {
  incidentId: string;
  onBack: () => void;
}

export function IncidentDetailView({ incidentId, onBack }: IncidentDetailViewProps) {
  const { user, lastRealtimeTick } = useAuth();
  const [detail, setDetail] = useState<IncidentDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [actionErr, setActionErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Responder update form
  const [nextStatus, setNextStatus] = useState<IncidentStatus>('In Progress');
  const [actionDescription, setActionDescription] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'internal'>('public');

  // Decline modal state
  const [showDeclineBox, setShowDeclineBox] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  // Cancel confirmation state
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Admin assignment state
  const [responders, setResponders] = useState<Array<UserProfile & { active_workload?: number }>>([]);
  const [selectedResponderId, setSelectedResponderId] = useState('');
  const [assignNote, setAssignNote] = useState('');

  const loadDetail = useCallback(async () => {
    try {
      const data = await apiFetch<IncidentDetailResponse>(`/api/incidents/${incidentId}`);
      setDetail(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load incident details.');
    } finally {
      setLoading(false);
    }
  }, [incidentId]);

  useEffect(() => {
    setLoading(true);
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (lastRealtimeTick > 0) {
      void loadDetail();
    }
  }, [lastRealtimeTick, loadDetail]);

  useEffect(() => {
    if (user?.role === 'admin') {
      apiFetch<{ responders: Array<UserProfile & { active_workload?: number }> }>('/api/admin/responders')
        .then((res) => {
          const active = res.responders.filter((r) => r.account_status === 'active');
          setResponders(active);
          if (active.length > 0 && !selectedResponderId) {
            setSelectedResponderId(active[0].id);
          }
        })
        .catch(() => {});
    }
  }, [user?.role, selectedResponderId]);

  const isStaff = user?.role === 'responder' || user?.role === 'admin';

  const handleAcknowledge = async () => {
    setBusy(true);
    setActionErr('');
    setActionMsg('');
    try {
      await apiFetch(`/api/incidents/${incidentId}/acknowledge`, {
        method: 'POST',
        body: JSON.stringify({ note: 'Emergency alert acknowledged by authorized campus personnel.' }),
      });
      setActionMsg('Incident acknowledged and reporter notified.');
      await loadDetail();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Acknowledge failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleAssignmentDecision = async (decision: 'accepted' | 'declined') => {
    setBusy(true);
    setActionErr('');
    setActionMsg('');
    try {
      await apiFetch(`/api/incidents/${incidentId}/assignment-response`, {
        method: 'POST',
        body: JSON.stringify({ decision, reason: declineReason }),
      });
      setShowDeclineBox(false);
      setDeclineReason('');
      setActionMsg(
        decision === 'accepted'
          ? 'Assignment accepted. Incident status is now In Progress.'
          : 'Assignment declined. Administrators have been notified for reassignment.'
      );
      await loadDetail();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setActionErr('');
    setActionMsg('');
    try {
      await apiFetch(`/api/incidents/${incidentId}/status`, {
        method: 'POST',
        body: JSON.stringify({
          status: nextStatus,
          actionDescription,
          internalNote,
          visibility,
        }),
      });
      setActionDescription('');
      setInternalNote('');
      setActionMsg(`Incident updated to ${nextStatus}.`);
      await loadDetail();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Status update failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleAssignResponder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResponderId) return;
    setBusy(true);
    setActionErr('');
    setActionMsg('');
    try {
      const res = await apiFetch<{ responderName: string }>(`/api/admin/incidents/${incidentId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ responderId: selectedResponderId, note: assignNote }),
      });
      setAssignNote('');
      setActionMsg(`Incident assigned to ${res.responderName}.`);
      await loadDetail();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Assignment failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleCancelIncident = async () => {
    setBusy(true);
    setActionErr('');
    try {
      await apiFetch(`/api/incidents/${incidentId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelReason || 'Cancelled by reporter.' }),
      });
      setShowCancelConfirm(false);
      setActionMsg('Incident report cancelled.');
      await loadDetail();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Cancellation failed.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-600">
        Loading incident record...
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800" role="alert">
          {error || 'Incident not found.'}
        </div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 hover:underline"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Back to List</span>
        </button>
      </div>
    );
  }

  const { incident, location, assignments, updates, attachments } = detail;
  const canReporterCancel =
    (user?.id === incident.reporter_id || user?.role === 'admin') &&
    ['Submitted', 'Acknowledged'].includes(incident.status);
  const myPendingAssignment = assignments.find(
    (a) => a.responder_id === user?.id && a.assignment_status === 'pending'
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Back</span>
        </button>
        <button
          type="button"
          onClick={() => void loadDetail()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Refresh Timeline</span>
        </button>
      </div>

      {actionMsg && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
          <span>{actionMsg}</span>
        </div>
      )}
      {actionErr && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800" role="alert">
          {actionErr}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Primary Incident Record */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    {incident.incident_number}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{incident.category}</span>
                  {incident.is_test_data === 1 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-amber-700">Academic Test Record</span>
                    </>
                  )}
                </div>
                <h1 className="text-xl font-bold text-slate-900">{incident.title}</h1>
              </div>

              <div className="flex items-center gap-4">
                <PriorityIndicator priority={incident.priority} isSos={incident.is_sos} />
                <StatusIndicator status={incident.status} />
              </div>
            </div>

            <div className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
              {incident.description}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-100 text-xs">
              <div>
                <span className="text-slate-500 block">Incident Time</span>
                <span className="font-medium text-slate-900 tabular-nums">
                  {formatLocalDateTime(incident.incident_time)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Submitted At</span>
                <span className="font-medium text-slate-900 tabular-nums">
                  {formatLocalDateTime(incident.created_at)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Reporter</span>
                <span className="font-medium text-slate-900">
                  {incident.reporter_name} ({incident.reporter_role})
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Department / Contact</span>
                <span className="font-medium text-slate-900">
                  {incident.reporter_department || '—'}
                  {isStaff && (incident.reporter_contact || incident.reporter_phone)
                    ? ` · ${incident.reporter_contact || incident.reporter_phone}`
                    : ''}
                </span>
              </div>
              {incident.affected_individuals && (
                <div className="sm:col-span-2">
                  <span className="text-slate-500 block">Affected Individuals</span>
                  <span className="font-medium text-slate-900">{incident.affected_individuals}</span>
                </div>
              )}
            </div>

            {attachments.length > 0 && (
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="text-xs font-semibold text-slate-700">Supporting Attachments</div>
                <div className="flex flex-wrap gap-2">
                  {attachments.map((att) => (
                    <button
                      key={att.id}
                      type="button"
                      onClick={() =>
                        void downloadAuthorizedAttachment(incident.id, att.id, att.original_filename)
                      }
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-800"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>
                        {att.original_filename} ({(att.file_size / 1024).toFixed(1)} KB)
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {canReporterCancel && (
              <div className="pt-4 border-t border-slate-200">
                {!showCancelConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowCancelConfirm(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 text-xs font-semibold"
                  >
                    <XCircle className="w-4 h-4" aria-hidden="true" />
                    <span>Cancel Mistaken Alert</span>
                  </button>
                ) : (
                  <div className="p-4 rounded-lg bg-red-50 border border-red-200 space-y-3">
                    <p className="text-xs font-semibold text-red-900">
                      Confirm cancellation? Only cancel if emergency or safety assistance is no longer needed.
                    </p>
                    <input
                      type="text"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      placeholder="Optional reason for cancellation..."
                      className="w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-xs text-slate-900"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleCancelIncident()}
                        className="px-3.5 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold"
                      >
                        Confirm Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCancelConfirm(false)}
                        className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-medium"
                      >
                        Keep Active
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Location & Map */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-600" aria-hidden="true" />
                <span>Location & Consent Record</span>
              </h2>
              <span className="text-xs text-slate-600">
                {location?.consent_given ? 'GPS Consent Granted' : 'Manual Location Only'}
              </span>
            </div>

            <div className="text-sm text-slate-800">
              <span className="font-semibold">Location Description: </span>
              {location?.location_description || 'Not provided'}
            </div>

            {location && location.latitude !== null && location.longitude !== null ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div>
                    <span className="block text-slate-500">Coordinates</span>
                    <span className="font-mono font-medium text-slate-900 tabular-nums">
                      {location.latitude}, {location.longitude}
                    </span>
                  </div>
                  <div>
                    <span className="block text-slate-500">Estimated Accuracy</span>
                    <span className="font-mono font-medium text-slate-900 tabular-nums">
                      {location.accuracy_meters ? `±${location.accuracy_meters}m` : 'Map Pin'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-slate-500">Captured At</span>
                    <span className="font-medium text-slate-900 tabular-nums">
                      {formatLocalDateTime(location.captured_at)}
                    </span>
                  </div>
                </div>
                <CampusMap
                  centerLat={location.latitude}
                  centerLng={location.longitude}
                  showExternalNav={isStaff}
                  heightClass="h-64"
                  markers={[
                    {
                      id: incident.id,
                      lat: location.latitude,
                      lng: location.longitude,
                      label: incident.incident_number,
                      sublabel: location.location_description,
                      priority: incident.priority,
                      isSos: incident.is_sos,
                      accuracyMeters: location.accuracy_meters,
                    },
                  ]}
                />
              </>
            ) : (
              <p className="text-xs text-slate-500">
                No GPS coordinates were captured for this report. Responders should rely on the manual location description above.
              </p>
            )}
          </div>

          {/* Status Timeline */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-600" aria-hidden="true" />
              <span>Response Timeline</span>
            </h2>

            {updates.length === 0 ? (
              <p className="text-sm text-slate-500">No status updates recorded yet.</p>
            ) : (
              <ol className="space-y-4 border-l border-slate-200 ml-2 pl-5">
                {updates.map((upd) => (
                  <li key={upd.id} className="relative space-y-1">
                    <span
                      className="absolute -left-[25px] top-1.5 w-2.5 h-2.5 rounded-full bg-slate-900 ring-4 ring-white"
                      aria-hidden="true"
                    />
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <StatusIndicator status={upd.new_status} />
                      <span aria-hidden="true">·</span>
                      <span className="font-medium text-slate-700">
                        {upd.updated_by_name} ({upd.updated_by_role})
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{formatLocalDateTime(upd.created_at)}</span>
                      {upd.visibility === 'internal' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 font-semibold text-amber-800">
                            <Lock className="w-3 h-3" aria-hidden="true" />
                            Internal Note
                          </span>
                        </>
                      )}
                    </div>
                    <p className="text-sm text-slate-800">{upd.action_description}</p>
                    {isStaff && upd.internal_note && (
                      <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-2 mt-1">
                        <strong className="text-slate-800">Internal Personnel Note: </strong>
                        {upd.internal_note}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        {/* Right Sidebar: Assignments & Role Actions */}
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-slate-600" aria-hidden="true" />
              <span>Responder Assignments</span>
            </h2>
            {assignments.length === 0 ? (
              <p className="text-xs text-slate-500">
                No responder assigned yet. Authorized campus staff are reviewing incoming alerts.
              </p>
            ) : (
              <div className="space-y-3">
                {assignments.map((a) => (
                  <div key={a.id} className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">{a.responder_name}</span>
                      <span className="capitalize font-semibold text-slate-700">{a.assignment_status}</span>
                    </div>
                    <div className="text-slate-600">{a.responder_specialty || 'Campus Responder'}</div>
                    <div className="text-slate-500 tabular-nums">
                      Assigned {formatLocalDateTime(a.assigned_at)}
                    </div>
                    {a.decline_reason && isStaff && (
                      <div className="text-red-700 pt-1">Decline reason: {a.decline_reason}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Responder Operational Controls */}
          {isStaff && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-700" aria-hidden="true" />
                <span>Responder Operations</span>
              </h2>

              {['Submitted', 'Escalated'].includes(incident.status) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleAcknowledge()}
                  className="w-full py-2.5 px-4 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold disabled:opacity-60"
                >
                  Acknowledge Alert
                </button>
              )}

              {user?.role === 'responder' && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="text-xs font-semibold text-slate-700">Assignment Decision</div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleAssignmentDecision('accepted')}
                      className="flex-1 py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
                    >
                      {myPendingAssignment ? 'Accept Assignment' : 'Self-Assign & Respond'}
                    </button>
                    {myPendingAssignment && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setShowDeclineBox((v) => !v)}
                        className="py-2 px-3 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 text-xs font-semibold"
                      >
                        Decline
                      </button>
                    )}
                  </div>
                  {showDeclineBox && (
                    <div className="space-y-2 pt-2">
                      <input
                        type="text"
                        value={declineReason}
                        onChange={(e) => setDeclineReason(e.target.value)}
                        placeholder="Required reason for declining..."
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                      />
                      <button
                        type="button"
                        disabled={busy || !declineReason.trim()}
                        onClick={() => void handleAssignmentDecision('declined')}
                        className="w-full py-2 rounded-lg bg-red-700 text-white text-xs font-semibold disabled:opacity-50"
                      >
                        Submit Decline Reason
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Status Update Form */}
              <form onSubmit={handleStatusUpdate} className="space-y-3 pt-3 border-t border-slate-200">
                <div className="text-xs font-bold text-slate-900">Record Response & Status Update</div>
                <div>
                  <label htmlFor="upd-status" className="block text-xs text-slate-600 mb-1">
                    New Status
                  </label>
                  <select
                    id="upd-status"
                    value={nextStatus}
                    onChange={(e) => setNextStatus(e.target.value as IncidentStatus)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white text-slate-900"
                  >
                    <option value="Acknowledged">Acknowledged</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Resolved">Resolved</option>
                    <option value="Closed">Closed</option>
                    <option value="Escalated">Escalated</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="upd-action" className="block text-xs text-slate-600 mb-1">
                    Action Description
                  </label>
                  <textarea
                    id="upd-action"
                    required
                    rows={3}
                    value={actionDescription}
                    onChange={(e) => setActionDescription(e.target.value)}
                    placeholder="e.g., Medical team arrived on site and provided triage..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="upd-internal" className="block text-xs text-slate-600 mb-1">
                    Internal Personnel Note (Hidden from Student/Faculty)
                  </label>
                  <textarea
                    id="upd-internal"
                    rows={2}
                    value={internalNote}
                    onChange={(e) => setInternalNote(e.target.value)}
                    placeholder="Optional confidential operational notes..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="upd-vis" className="block text-xs text-slate-600 mb-1">
                    Update Visibility
                  </label>
                  <select
                    id="upd-vis"
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as 'public' | 'internal')}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white text-slate-900"
                  >
                    <option value="public">Public Status Update (Reporter Notified)</option>
                    <option value="internal">Internal Personnel Only</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold disabled:opacity-60"
                >
                  Save Status Update
                </button>
              </form>

              {/* Admin Assignment Panel */}
              {user?.role === 'admin' && (
                <form onSubmit={handleAssignResponder} className="space-y-3 pt-4 border-t border-slate-200">
                  <div className="text-xs font-bold text-slate-900">Assign / Reassign Responder</div>
                  {responders.length === 0 ? (
                    <p className="text-xs text-amber-800">
                      No active responder accounts found. Create a responder in Responder Management.
                    </p>
                  ) : (
                    <>
                      <select
                        value={selectedResponderId}
                        onChange={(e) => setSelectedResponderId(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white text-slate-900"
                      >
                        {responders.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.full_name} ({r.responder_specialty || 'Security'}) · {r.active_workload ?? 0} active
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={assignNote}
                        onChange={(e) => setAssignNote(e.target.value)}
                        placeholder="Optional dispatch note..."
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
                      />
                      <button
                        type="submit"
                        disabled={busy || !selectedResponderId}
                        className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold"
                      >
                        Assign Responder
                      </button>
                    </>
                  )}
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
