import { CheckCircle2, FileText, MapPin, Upload } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { IncidentCategory, IncidentSummary } from '../types';
import { CampusMap } from './CampusMap';

interface IncidentFormProps {
  onSubmitted: (incidentId: string) => void;
  onCancel: () => void;
  userRole: string;
}

export function IncidentForm({ onSubmitted, onCancel, userRole }: IncidentFormProps) {
  const [categories, setCategories] = useState<IncidentCategory[]>([]);
  const [category, setCategory] = useState('Security incident');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [incidentTime, setIncidentTime] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [locationDescription, setLocationDescription] = useState('');
  const [consentGiven, setConsentGiven] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number | null } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'requesting' | 'captured' | 'denied' | 'unavailable'>('idle');
  const [gpsMessage, setGpsMessage] = useState('');
  const [affectedIndividuals, setAffectedIndividuals] = useState('');
  const [reporterContact, setReporterContact] = useState('');
  const [attachment, setAttachment] = useState<{
    filename: string;
    mimeType: string;
    dataBase64: string;
    size: number;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<Pick<
    IncidentSummary,
    'id' | 'incident_number' | 'priority' | 'status'
  > | null>(null);

  const idempotencyKey = useMemo(
    () =>
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `inc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    []
  );

  useEffect(() => {
    apiFetch<{ categories: IncidentCategory[] }>('/api/public/categories')
      .then((res) => {
        if (res.categories.length > 0) {
          setCategories(res.categories);
          setCategory(res.categories[0].name);
        }
      })
      .catch(() => {
        // Fallback silently if offline
      });
  }, []);

  const handleRequestGps = () => {
    setError('');
    if (!navigator.geolocation) {
      setGpsStatus('unavailable');
      setGpsMessage('Geolocation is not supported by this browser. You can pin a location on the map or enter it manually.');
      return;
    }

    setGpsStatus('requesting');
    setGpsMessage('Requesting browser permission for a single location reading...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setConsentGiven(true);
        setCoords({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          accuracy: Math.round(pos.coords.accuracy),
        });
        setGpsStatus('captured');
        setGpsMessage(`GPS coordinates captured with consent (±${Math.round(pos.coords.accuracy)}m).`);
      },
      (err) => {
        setGpsStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
        setGpsMessage(
          err.code === err.PERMISSION_DENIED
            ? 'GPS permission denied. Please enter a manual location or click the campus map below.'
            : 'Unable to obtain GPS fix. Please enter a manual location or click the campus map below.'
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleMapPick = (lat: number, lng: number) => {
    setConsentGiven(true);
    setCoords({ lat, lng, accuracy: null });
    setGpsStatus('captured');
    setGpsMessage(`Approximate location pinned on map (${lat}, ${lng}).`);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    const file = e.target.files?.[0];
    if (!file) {
      setAttachment(null);
      return;
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      setError('Unsupported file type. Please upload JPEG, PNG, WEBP, or PDF.');
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Attachment size exceeds the 5 MB limit.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAttachment({
          filename: file.name,
          mimeType: file.type,
          dataBase64: reader.result,
          size: file.size,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');

    if (!title.trim() || !description.trim()) {
      setError('Incident title and detailed description are required.');
      return;
    }
    if (!locationDescription.trim() && !coords) {
      setError('Please enter a location description or share a location pin.');
      return;
    }

    setSubmitting(true);
    try {
      const isoTime = incidentTime ? new Date(incidentTime).toISOString() : new Date().toISOString();
      const res = await apiFetch<{
        incident: Pick<IncidentSummary, 'id' | 'incident_number' | 'priority' | 'status'>;
      }>('/api/incidents', {
        method: 'POST',
        body: JSON.stringify({
          isSos: false,
          idempotencyKey,
          category,
          title: title.trim(),
          description: description.trim(),
          incidentTime: isoTime,
          locationDescription: locationDescription.trim(),
          consentGiven,
          latitude: coords?.lat ?? null,
          longitude: coords?.lng ?? null,
          accuracyMeters: coords?.accuracy ?? null,
          affectedIndividuals: affectedIndividuals.trim(),
          reporterContact: reporterContact.trim(),
          attachment,
        }),
      });
      setCreated(res.incident);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit incident report.');
    } finally {
      setSubmitting(false);
    }
  };

  if (created) {
    return (
      <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex items-start gap-3 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-950">
          <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-sm space-y-1">
            <h2 className="font-bold text-base">Incident Report Submitted</h2>
            <p>
              Your report has been recorded in the campus safety queue and routed to the authorized department. You can track acknowledgements and responder updates in real time.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-lg bg-slate-50 border border-slate-200 text-sm">
          <div>
            <div className="text-xs text-slate-500">Reference Number</div>
            <div className="font-mono font-bold text-slate-900 tabular-nums mt-0.5">
              {created.incident_number}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Assigned Priority</div>
            <div className="font-semibold capitalize text-slate-900 mt-0.5">{created.priority}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Status</div>
            <div className="font-semibold text-amber-700 mt-0.5">{created.status}</div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => onSubmitted(created.id)}
            className="px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold"
          >
            View Incident Timeline
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto bg-white border border-slate-200 rounded-xl p-6">
      <div className="border-b border-slate-200 pb-4 mb-6">
        <h2 className="text-xl font-bold text-slate-900">Report Campus Safety Incident</h2>
        <p className="text-sm text-slate-600 mt-1">
          Submit a detailed medical, security, hazard, or safety report. Priority is assigned automatically by campus safety rules based on category.
        </p>
      </div>

      {error && (
        <div className="mb-5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label htmlFor="inc-category" className="block text-sm font-semibold text-slate-900 mb-1.5">
              Incident Category
            </label>
            <select
              id="inc-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              {(categories.length > 0
                ? categories
                : [
                    { id: '1', name: 'Medical emergency', default_priority: 'critical', responder_department: 'Medical', description: '' },
                    { id: '2', name: 'Fire or smoke', default_priority: 'critical', responder_department: 'Fire', description: '' },
                    { id: '3', name: 'Physical safety threat', default_priority: 'critical', responder_department: 'Security', description: '' },
                    { id: '4', name: 'Security incident', default_priority: 'high', responder_department: 'Security', description: '' },
                    { id: '5', name: 'Harassment or misconduct', default_priority: 'high', responder_department: 'Support', description: '' },
                    { id: '6', name: 'Missing person', default_priority: 'high', responder_department: 'Security', description: '' },
                    { id: '7', name: 'Suspicious activity', default_priority: 'medium', responder_department: 'Security', description: '' },
                    { id: '8', name: 'Infrastructure hazard', default_priority: 'medium', responder_department: 'Facilities', description: '' },
                    { id: '9', name: 'Other incident', default_priority: 'low', responder_department: 'Safety Desk', description: '' },
                  ]
              ).map((cat) => (
                <option key={cat.name} value={cat.name}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="inc-time" className="block text-sm font-semibold text-slate-900 mb-1.5">
              Date & Time of Incident
            </label>
            <input
              id="inc-time"
              type="datetime-local"
              value={incidentTime}
              onChange={(e) => setIncidentTime(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
        </div>

        <div>
          <label htmlFor="inc-title" className="block text-sm font-semibold text-slate-900 mb-1.5">
            Incident Title
          </label>
          <input
            id="inc-title"
            type="text"
            required
            maxLength={160}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Brief, clear summary (e.g., Broken streetlight on West Walkway)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        <div>
          <label htmlFor="inc-desc" className="block text-sm font-semibold text-slate-900 mb-1.5">
            Detailed Description
          </label>
          <textarea
            id="inc-desc"
            required
            rows={4}
            maxLength={3000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what happened, any immediate hazards, and relevant context without sharing unnecessary private personal data..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        <div className="space-y-4 p-4 rounded-lg bg-slate-50 border border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Incident Location & Consent</h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Enter the campus location below. Optionally share your current GPS coordinates or click the map to pin an approximate spot.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRequestGps}
              disabled={gpsStatus === 'requesting'}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap shrink-0"
            >
              <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{gpsStatus === 'requesting' ? 'Requesting GPS...' : 'Use My Current Location'}</span>
            </button>
          </div>

          {gpsMessage && (
            <p className={`text-xs ${gpsStatus === 'captured' ? 'text-emerald-700 font-medium' : 'text-amber-800'}`}>
              {gpsMessage}
            </p>
          )}

          <div>
            <label htmlFor="inc-loc-desc" className="block text-xs font-semibold text-slate-700 mb-1">
              Location Description (Building, Floor, Landmark)
            </label>
            <input
              id="inc-loc-desc"
              type="text"
              maxLength={300}
              value={locationDescription}
              onChange={(e) => setLocationDescription(e.target.value)}
              placeholder="e.g., Engineering Hall North Staircase, Room 204"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={consentGiven}
              onChange={(e) => {
                setConsentGiven(e.target.checked);
                if (!e.target.checked) setCoords(null);
              }}
              className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
            />
            <span>
              I explicitly consent to sharing the captured or pinned coordinates with authorized campus responders for this incident only.
            </span>
          </label>

          <CampusMap
            centerLat={coords?.lat ?? 37.4275}
            centerLng={coords?.lng ?? -122.1697}
            interactivePicker={true}
            onPickLocation={handleMapPick}
            heightClass="h-56"
            markers={
              coords
                ? [
                    {
                      id: 'picked',
                      lat: coords.lat,
                      lng: coords.lng,
                      label: 'Selected Incident Pin',
                      sublabel: `${coords.lat}, ${coords.lng}`,
                      accuracyMeters: coords.accuracy,
                    },
                  ]
                : []
            }
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label htmlFor="inc-affected" className="block text-sm font-semibold text-slate-900 mb-1.5">
              {userRole === 'faculty'
                ? 'Affected Individuals / Students Involved (Optional)'
                : 'Affected Individuals (Optional)'}
            </label>
            <input
              id="inc-affected"
              type="text"
              maxLength={500}
              value={affectedIndividuals}
              onChange={(e) => setAffectedIndividuals(e.target.value)}
              placeholder="Only provide details needed for responder safety"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div>
            <label htmlFor="inc-contact" className="block text-sm font-semibold text-slate-900 mb-1.5">
              Preferred Callback Contact (Optional)
            </label>
            <input
              id="inc-contact"
              type="text"
              maxLength={120}
              value={reporterContact}
              onChange={(e) => setReporterContact(e.target.value)}
              placeholder="Phone or extension if different from profile"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
        </div>

        <div>
          <label htmlFor="inc-attachment" className="block text-sm font-semibold text-slate-900 mb-1.5">
            Supporting Photo or Document (Optional, max 5 MB · JPEG, PNG, WEBP, PDF)
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 cursor-pointer">
              <Upload className="w-4 h-4" aria-hidden="true" />
              <span>Choose File</span>
              <input
                id="inc-attachment"
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf"
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>
            {attachment && (
              <div className="inline-flex items-center gap-2 text-xs text-slate-700">
                <FileText className="w-4 h-4 text-slate-500" aria-hidden="true" />
                <span>
                  {attachment.filename} ({(attachment.size / 1024).toFixed(1)} KB)
                </span>
                <button
                  type="button"
                  onClick={() => setAttachment(null)}
                  className="text-red-700 hover:underline font-medium"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold disabled:opacity-60"
          >
            {submitting ? 'Submitting Report...' : 'Submit Incident Report'}
          </button>
        </div>
      </form>
    </div>
  );
}
