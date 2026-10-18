export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  let data;
  try { data = await response.json(); }
  catch { throw new Error('The service is unavailable right now. Please try again shortly.'); }
  if (!response.ok) throw new Error(data.error || 'That action could not be completed. Please try again.');
  return data;
}
export const post = (path, body, method = 'POST') => api(path, { method, body: JSON.stringify(body) });
export const statusLabels = { inbox: 'To review', planned: 'Planned', declined: 'Not now', shipped: 'Shipped', merged: 'Merged' };
export const statuses = ['inbox', 'planned', 'declined', 'shipped'];
export const dateLabel = value => value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
