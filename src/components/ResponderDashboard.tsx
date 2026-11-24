import { AlertOctagon, CheckCircle2, Clock, MapPin, ShieldAlert, UserCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import type { IncidentSummary } from '../types';
import { CampusMap } from './CampusMap';
import { IncidentDetailView } from './IncidentDetailView';
import { formatLocalDateTime, formatRelativeTime, PriorityIndicator, StatusIndicator } from './StatusText';

export type ResponderSubView = 'overview' | 'incoming' | 'assigned' | 'history' | 'detail';

interface ResponderDashboardProps {
  activeView: ResponderSubView;
  selectedIncidentId: string | null;
  onNavigate: (view: ResponderSubView, incidentId?: string | null) => void;
}

export function ResponderDashboard({
  activeView,
  selectedIncidentId,
  onNavigate,
}: ResponderDashboardProps) {
  const { user, lastRealtimeTick } = useAuth();
  const [incidents, setIncidents] = useState<IncidentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadIncidents = useCallback(async () => {
    try {
      const data = await apiFetch<{ incidents: IncidentSummary[] }>('/api/incidents');
      setIncidents(data.incidents);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to fetch responder queue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadIncidents();
  }, [loadIncidents]);

  useEffect(() => {
    if (lastRealtimeTick > 0) {
      void loadIncidents();
    }
  }, [lastRealtimeTick, loadIncidents]);

  const handleQuickAck = async (id: string) => {
    setBusyId(id);
    try {
      await apiFetch(`/api/incidents/${id}/acknowledge`, {
        method: 'POST',
        body: JSON.stringify({ note: 'Acknowledged from Responder Dispatch Queue.' }),
      });
      await loadIncidents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Acknowledge failed.');
    } finally {
      setBusyId(null);
    }
  };

  if (activeView === 'detail' && selectedIncidentId) {
    return (
      <IncidentDetailView
        incidentId={selectedIncidentId}
        onBack={() => {
          void loadIncidents();
          onNavigate('overview');
        }}
      />
    );
  }

  const incomingAlerts = incidents.filter((i) =>
    ['Submitted', 'Escalated'].includes(i.status)
  );
  const assignedToMe = incidents.filter(
    (i) =>
      i.assigned_responder_id === user?.id &&
      !['Resolved', 'Closed', 'Cancelled'].includes(i.status)
  );
  const criticalActive = incidents.filter(
    (i) =>
      (i.priority === 'critical' || i.is_sos === 1) &&
      !['Resolved', 'Closed', 'Cancelled'].includes(i.status)
  );
  const inProgress = incidents.filter((i) => i.status === 'In Progress');
  const historyList = incidents.filter((i) =>
    ['Resolved', 'Closed', 'Cancelled'].includes(i.status)
  );

  const activeMarkers = incidents
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
      accuracyMeters: i.accuracy_meters,
    }));

  const displayList =
    activeView === 'incoming'
      ? incomingAlerts
      : activeView === 'assigned'
      ? assignedToMe
      : activeView === 'history'
      ? historyList
      : incidents.filter((i) => !['Resolved', 'Closed', 'Cancelled'].includes(i.status));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {activeView === 'incoming'
              ? 'Incoming Emergency Alerts'
              : activeView === 'assigned'
              ? 'My Assigned Incidents'
              : activeView === 'history'
              ? 'Response History'
              : 'Responder Dispatch Console'}
          </h1>
          <p className="text-sm text-slate-600">
            Authorized Department: <strong className="text-slate-900">{user?.responder_specialty || 'Campus Safety'}</strong>
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-lg self-start">
          {(
            [
              ['overview', 'Active Queue'],
              ['incoming', `Incoming (${incomingAlerts.length})`],
              ['assigned', `Assigned (${assignedToMe.length})`],
              ['history', 'History'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => onNavigate(key)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                activeView === key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800" role="alert">
          {error}
        </div>
      )}

      {activeView === 'overview' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Pending Acknowledgements</span>
                <Clock className="w-4 h-4 text-amber-600" aria-hidden="true" />
              </div>
              <div className="text-2xl font-bold text-amber-700 tabular-nums mt-1">
                {incomingAlerts.length}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Critical / SOS Active</span>
                <AlertOctagon className="w-4 h-4 text-red-600" aria-hidden="true" />
              </div>
              <div className="text-2xl font-bold text-red-700 tabular-nums mt-1">
                {criticalActive.length}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Assigned to Me</span>
                <UserCheck className="w-4 h-4 text-slate-700" aria-hidden="true" />
              </div>
              <div className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
                {assignedToMe.length}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>In Progress</span>
                <CheckCircle2 className="w-4 h-4 text-blue-700" aria-hidden="true" />
              </div>
              <div className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
                {inProgress.length}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-red-700" aria-hidden="true" />
                <span>Live Consented Incident Map ({activeMarkers.length} pinned)</span>
              </h2>
            </div>
            <CampusMap markers={activeMarkers} heightClass="h-64" />
          </div>
        </>
      )}

      {/* Incident Queue Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500">Loading responder incident queue...</div>
        ) : displayList.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <ShieldAlert className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
            <p className="text-sm text-slate-600">No incidents in this view.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                  <th className="py-3 pr-4">Reference</th>
                  <th className="py-3 pr-4">Incident & Location</th>
                  <th className="py-3 pr-4">Priority</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Reporter</th>
                  <th className="py-3 pr-4">Reported</th>
                  <th className="py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {displayList.map((inc) => (
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
                        {inc.category} · {inc.location_description || 'GPS shared'}
                      </div>
                    </td>
                    <td className="py-3.5 pr-4">
                      <PriorityIndicator priority={inc.priority} isSos={inc.is_sos} />
                    </td>
                    <td className="py-3.5 pr-4">
                      <StatusIndicator status={inc.status} />
                    </td>
                    <td className="py-3.5 pr-4 text-xs text-slate-700">
                      <div>{inc.reporter_name}</div>
                      <div className="text-slate-500 capitalize">{inc.reporter_role}</div>
                    </td>
                    <td className="py-3.5 pr-4 text-xs text-slate-600 tabular-nums whitespace-nowrap">
                      <div>{formatRelativeTime(inc.created_at)}</div>
                      <div className="text-slate-400">{formatLocalDateTime(inc.created_at)}</div>
                    </td>
                    <td className="py-3.5 text-right space-x-2 whitespace-nowrap">
                      {['Submitted', 'Escalated'].includes(inc.status) && (
                        <button
                          type="button"
                          disabled={busyId === inc.id}
                          onClick={() => void handleQuickAck(inc.id)}
                          className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
                        >
                          Acknowledge
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onNavigate('detail', inc.id)}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
