import { useState, useEffect } from 'react';

export function useDailyReport(date) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load(d) {
    setLoading(true);
    setError(null);
    try {
      const url = d ? `/api/daily-report?date=${d}` : '/api/daily-report';
      const res = await fetch(url, { credentials: 'same-origin' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      setReport(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(date); }, [date]);

  return { report, loading, error, reload: () => load(date) };
}

export async function postDailyReportAction(type, id, payload = {}) {
  const map = {
    confirm:  { url: `/api/tasks/${id}/complete`, body: { outcome: 'confirmed', fields: {} } },
    snooze:   { url: `/api/tasks/${id}/snooze`,   body: {} },
    followup: { url: `/api/tasks/${id}/complete`, body: { outcome: 'sent', fields: {} } },
    call:     { url: `/api/tasks/${id}/complete`, body: { outcome: 'callback_requested', fields: {} } },
  };
  const entry = map[type];
  if (!entry) return;
  await fetch(entry.url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...entry.body, ...payload }),
  });
}
