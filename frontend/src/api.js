let activeAccountId;
let passwordScheme;
let workbookMode;

export function configureSession(session) {
  activeAccountId = session.user?.id;
  passwordScheme = session.passwordScheme;
  workbookMode = session.workbookMode;
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

const toHex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

async function authenticate(mode, credentials) {
  if (passwordScheme !== 'pbkdf2-sha256') return request(`/auth/${mode}`, json('POST', credentials));

  const { username, password } = credentials;
  if (mode === 'register' && password.length < 8) throw new Error('密码需为 8 至 128 个字符。');
  const { salt } = mode === 'register'
    ? { salt: toHex(crypto.getRandomValues(new Uint8Array(16))) }
    : await request(`/auth/salt?username=${encodeURIComponent(username)}`);
  if (typeof salt !== 'string' || !/^[0-9a-f]{32}$/.test(salt)) throw new Error('暂时无法登录，请重试。');
  const saltBytes = Uint8Array.from(salt.match(/../g), (pair) => Number.parseInt(pair, 16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: 600000 }, key, 256);
  const proof = toHex(new Uint8Array(bits));
  return request(`/auth/${mode}`, json('POST', { username, salt, proof }));
}

async function exportContacts() {
  if (workbookMode !== 'browser') return request('/contacts/export');

  const [{ contacts }, { exportWorkbook }] = await Promise.all([request('/contacts'), import('../../backend/src/workbook.js')]);
  return new Response(await exportWorkbook(contacts));
}

async function importContacts(file) {
  if (workbookMode === 'browser') {
    if (file.size > 5 * 1024 * 1024) throw new Error('文件或数据超出大小限制。');
    const { readWorkbook } = await import('../../backend/src/workbook.js');
    const contacts = await readWorkbook(await file.arrayBuffer());
    return request('/contacts/import', json('POST', { contacts }));
  }
  return request('/contacts/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    body: file,
  });
}

export const api = {
  session: () => request('/auth/session'),
  register: (credentials) => authenticate('register', credentials),
  login: (credentials) => authenticate('login', credentials),
  logout: () => request('/auth/logout', { method: 'POST' }),
  list: () => request('/contacts'),
  save: (id, contact) => (id ? request(`/contacts/${id}`, json('PUT', contact)) : request('/contacts', json('POST', contact))),
  favorite: (id, favorite) => request(`/contacts/${id}/favorite`, json('PATCH', { favorite })),
  remove: (id) => request(`/contacts/${id}`, { method: 'DELETE' }),
  contactGroups: (id, groupIds) => request(`/contacts/${id}/groups`, json('PUT', { groupIds })),
  saveGroup: (id, name) => (id ? request(`/groups/${id}`, json('PATCH', { name })) : request('/groups', json('POST', { name }))),
  removeGroup: (id) => request(`/groups/${id}`, { method: 'DELETE' }),
  export: exportContacts,
  import: importContacts,
};
