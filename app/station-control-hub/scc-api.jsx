// ===== Station Control Center API client =====
// The WebDev resource is a sibling of the mounted app folder. Derive its URL
// from the current page so the same build works on every Ignition project.
function apiUrl() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const index = parts.indexOf('webdev');
  const project = index >= 0 && parts[index + 1] ? parts[index + 1] : '';
  return `/system/webdev/${project}/api`;
}

async function sccRequest(op, action, args = {}) {
  const response = await fetch(apiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op, action, args })
  });
  let body;
  try {
    body = await response.json();
  } catch (error) {
    throw new Error(`API returned a non-JSON response (${response.status})`);
  }
  if (!response.ok || body.ok === false) {
    throw new Error(body.message || body.error || `API request failed (${response.status})`);
  }
  return body.data !== undefined ? body.data : body;
}

const sccApi = {
  read: (action, args) => sccRequest('read', action, args),
  commit: (action, args) => sccRequest('commit', action, args)
};

function showApiError(error) {
  window.sccToast?.(error?.message || 'The Station Control API request failed.', 'error');
}

Object.assign(window, { apiUrl, sccApi, showApiError });