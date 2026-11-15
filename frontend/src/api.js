let activeAccountId;

export function setActiveAccount(id) {
  activeAccountId = id;
}

async function request(path, options) {
  const headers = new Headers(options?.headers);
  if (activeAccountId && !path.startsWith('/auth/')) headers.set('X-Address-Book-Account', activeAccountId);
  const response = await fetch(`/api${path}`, {
    signal: AbortSignal.timeout(15000),
    ...options,
    headers,
  }).catch(() => {
    throw new Error('无法连接，请稍后重试。');
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) {
      window.dispatchEvent(new Event('addressbook:session-expired'));
    }
    const result = isJson ? await response.json() : null;
    throw new Error(result?.error || '暂时无法完成此操作，请重试。');
  }

  return isJson ? response.json() : response;
}

function json(method, body) {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export const api = {
  session: () => request('/auth/session'),
  register: (credentials) => request('/auth/register', json('POST', credentials)),
  login: (credentials) => request('/auth/login', json('POST', credentials)),
  logout: () => request('/auth/logout', { method: 'POST' }),
  list: () => request('/contacts'),
  save: (id, contact) => (id ? request(`/contacts/${id}`, json('PUT', contact)) : request('/contacts', json('POST', contact))),
  favorite: (id, favorite) => request(`/contacts/${id}/favorite`, json('PATCH', { favorite })),
  remove: (id) => request(`/contacts/${id}`, { method: 'DELETE' }),
  contactGroups: (id, groupIds) => request(`/contacts/${id}/groups`, json('PUT', { groupIds })),
  saveGroup: (id, name) => (id ? request(`/groups/${id}`, json('PATCH', { name })) : request('/groups', json('POST', { name }))),
  removeGroup: (id) => request(`/groups/${id}`, { method: 'DELETE' }),
  export: () => request('/contacts/export'),
  import: (file) => request('/contacts/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    body: file,
  }),
};
