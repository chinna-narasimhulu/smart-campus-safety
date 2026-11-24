import { AlertOctagon, CheckCircle2, MapPin, ShieldAlert, X } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { IncidentSummary } from '../types';
import { CampusMap } from './CampusMap';

interface SosModalProps {
  open: boolean;
  onClose: () => void;
  onSubmitted: (incidentId: string) => void;
}

const SOS_CATEGORIES = [
  'Physical safety threat',
  'Medical emergency',
  'Fire or smoke',
  'Security incident',
  'Harassment or misconduct',
  'Missing person',
];

export function SosModal({ open, onClose, onSubmitted }: SosModalProps) {
  const [category, setCategory] = useState('Physical safety threat');
  const [locationDescription, setLocationDescription] = useState('');
  const [description, setDescription] = useState('');
  const [consentGiven, setConsentGiven] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number | null } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'requesting' | 'captured' | 'denied' | 'unavailable'>('idle');
  const [gpsMessage, setGpsMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmedIncident, setConfirmedIncident] = useState<Pick<
    IncidentSummary,
    'id' | 'incident_number' | 'priority' | 'status'
  > | null>(null);

  // Unique idempotency key per SOS session prevents duplicate alerts on repeated clicks or retries
  const idempotencyKey = useMemo(() => {
    if (!open) return '';
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `sos-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }, [open]);

  if (!open) return null;

  const handleRequestGps = () => {
    setError('');
    if (!navigator.geolocation) {
      setGpsStatus('unavailable');
      setGpsMessage('Geolocation is not supported by this browser. Please enter your campus building or area below.');
      return;
    }

    setGpsStatus('requesting');
    setGpsMessage('Requesting browser permission for a single location reading...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setConsentGiven(true);
        setCoords({
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6)),
          accuracy: Math.round(position.coords.accuracy),
        });
        setGpsStatus('captured');
        setGpsMessage(
          `Location captured with your consent (accuracy approximately ±${Math.round(
            position.coords.accuracy
          )}m).`
        );
      },
      (geoErr) => {
        setConsentGiven(false);
        setCoords(null);
        if (geoErr.code === geoErr.PERMISSION_DENIED) {
          setGpsStatus('denied');
          setGpsMessage(
            'Location permission was declined. You can still submit an SOS by entering your campus location manually.'
          );
        } else {
          setGpsStatus('unavailable');
          setGpsMessage(
            'GPS signal could not be acquired right now. Please enter your building, floor, or nearby landmark below.'
          );
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');

    if (!locationDescription.trim() && !coords) {
      setError('Please share your current GPS location or enter a manual campus location description.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await apiFetch<{
        incident: Pick<IncidentSummary, 'id' | 'incident_number' | 'priority' | 'status'>;
      }>('/api/incidents', {
        method: 'POST',
        body: JSON.stringify({
          isSos: true,
          idempotencyKey,
          category,
          title: `SOS Emergency Alert: ${category}`,
          description:
            description.trim() || 'Urgent SOS emergency alert triggered from campus safety dashboard.',
          locationDescription: locationDescription.trim() || 'GPS location shared with consent',
          consentGiven,
          latitude: coords?.lat ?? null,
          longitude: coords?.lng ?? null,
          accuracyMeters: coords?.accuracy ?? null,
        }),
      });
      setConfirmedIncident(result.incident);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit SOS alert.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetAndClose = () => {
    const submittedId = confirmedIncident?.id;
    setConfirmedIncident(null);
    setLocationDescription('');
    setDescription('');
    setCoords(null);
    setConsentGiven(false);
    setGpsStatus('idle');
    setGpsMessage('');
    setError('');
    if (submittedId) {
      onSubmitted(submittedId);
    } else {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sos-modal-title"
    >
      <div className="w-full max-w-xl bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden my-auto">
        <div className="flex items-center justify-between px-6 py-4 bg-red-700 text-white">
          <div className="flex items-center gap-2.5">
            <AlertOctagon className="w-5 h-5 shrink-0" aria-hidden="true" />
            <h2 id="sos-modal-title" className="text-lg font-bold tracking-tight">
              {confirmedIncident ? 'SOS Emergency Alert Recorded' : 'Confirm SOS Emergency Alert'}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleResetAndClose}
            className="p-1.5 rounded-lg text-white/90 hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-white"
            aria-label="Close SOS dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {confirmedIncident ? (
          <div className="p-6 space-y-5">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-950">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-1 text-sm">
                <p className="font-semibold">Your SOS alert has been submitted and logged.</p>
                <p className="text-emerald-900">
                  Authorized Campus Responders have been notified in the response queue. Please monitor your incident tracking timeline for responder acknowledgement—assistance is confirmed only once a responder updates the status.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm">
              <div>
                <div className="text-xs text-slate-500">Reference Number</div>
                <div className="font-mono font-bold text-slate-900 tabular-nums mt-0.5">
                  {confirmedIncident.incident_number}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Current Status</div>
                <div className="font-semibold text-amber-700 mt-0.5">{confirmedIncident.status}</div>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-slate-900 text-white text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="font-semibold">Need immediate voice contact?</div>
                <div className="text-slate-300 text-xs">Campus Security 24/7 Control Room</div>
              </div>
              <a
                href="tel:+15550109111"
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-xs text-center whitespace-nowrap"
              >
                Call +1 (555) 010-9111
              </a>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleResetAndClose}
                className="px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold"
              >
                Track Live Status
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-950 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
              <p>
                Submitting this form raises a <strong>Critical Priority</strong> emergency alert to authorized campus security and medical responders. For life-threatening emergencies, also dial <strong>911</strong> if safe.
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-sm text-red-800" role="alert">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="sos-category" className="block text-sm font-semibold text-slate-900 mb-1.5">
                Emergency Category
              </label>
              <select
                id="sos-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-600"
              >
                {SOS_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3 p-4 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Consent-Based Location Sharing</div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Your location is requested only when you click below so responders can locate you faster. It is never collected silently.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRequestGps}
                  disabled={gpsStatus === 'requesting'}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap shrink-0 disabled:opacity-60"
                >
                  <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{gpsStatus === 'requesting' ? 'Locating...' : 'Share Current Location'}</span>
                </button>
              </div>

              {gpsMessage && (
                <p
                  className={`text-xs ${
                    gpsStatus === 'captured' ? 'text-emerald-700 font-medium' : 'text-amber-800'
                  }`}
                >
                  {gpsMessage}
                </p>
              )}

              {coords && (
                <CampusMap
                  centerLat={coords.lat}
                  centerLng={coords.lng}
                  heightClass="h-44"
                  markers={[
                    {
                      id: 'sos-preview',
                      lat: coords.lat,
                      lng: coords.lng,
                      label: 'Your Shared Location',
                      sublabel: `±${coords.accuracy ?? '?'}m`,
                      isSos: true,
                    },
                  ]}
                />
              )}
            </div>

            <div>
              <label htmlFor="sos-location-desc" className="block text-sm font-semibold text-slate-900 mb-1.5">
                Building, Room, or Landmark {coords ? '(Optional)' : '(Required if GPS unavailable)'}
              </label>
              <input
                id="sos-location-desc"
                type="text"
                value={locationDescription}
                onChange={(e) => setLocationDescription(e.target.value)}
                placeholder="e.g., Science Library 2nd Floor North Wing"
                maxLength={300}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-600"
              />
            </div>

            <div>
              <label htmlFor="sos-description" className="block text-sm font-semibold text-slate-900 mb-1.5">
                Brief Details (Optional)
              </label>
              <textarea
                id="sos-description"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Share any immediate details if safe to type..."
                maxLength={1000}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-600"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-sm font-bold disabled:opacity-60"
              >
                {submitting ? 'Submitting SOS Alert...' : 'Submit SOS Emergency Alert'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
