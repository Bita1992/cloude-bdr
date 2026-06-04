export function nowIso() {
  return new Date().toISOString();
}

export function localDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

export function dateAtLocalTime(offsetDays = 0, time = '09:00') {
  const base = new Date(`${localDate()}T12:00:00-03:00`);
  base.setDate(base.getDate() + offsetDays);
  const [hour, minute] = time.split(':').map(Number);
  base.setHours(hour, minute || 0, 0, 0);
  return base.toISOString();
}

export function addDaysIso(dateIso, days, time = '09:00') {
  const d = new Date(dateIso || nowIso());
  d.setDate(d.getDate() + days);
  const [hour, minute] = time.split(':').map(Number);
  d.setHours(hour, minute || 0, 0, 0);
  return d.toISOString();
}

export function startOfTodayIso() {
  return new Date(`${localDate()}T00:00:00-03:00`).toISOString();
}

export function endOfTodayIso() {
  return new Date(`${localDate()}T23:59:59-03:00`).toISOString();
}
