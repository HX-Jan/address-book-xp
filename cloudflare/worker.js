import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  addContactToBook, changeContactInBook, ContactError, deleteGroupInBook,
  importContactsIntoBook, readContact, saveGroupInBook, setGroupsInBook,
} from '../backend/src/contact-domain.js';
import {
  cookieName, hashToken, newToken, registrationUsername, sessionLifetime, sessionToken, usernameKey,
} from '../backend/src/credentials.js';

const passwordScheme = 'pbkdf2-sha256';
const responseHeaders = { 'Cache-Control': 'no-store' };
const json = (payload, status = 200, headers = {}) => Response.json(payload, {
  status, headers: { ...responseHeaders, ...headers },
});
const noContent = (headers = {}) => new Response(null, { status: 204, headers: { ...responseHeaders, ...headers } });

async function readJson(request, limit = 192 * 1024) {
  if (Number(request.headers.get('content-length')) > limit) {
    throw new ContactError('文件或数据超出大小限制。', 413);
  }

  const decoder = new TextDecoder();
  let text = '';
  let length = 0;
  for await (const chunk of request.body || []) {
    length += chunk.byteLength;
    if (length > limit) throw new ContactError('文件或数据超出大小限制。', 413);
    text += decoder.decode(chunk, { stream: true });
  }
  try {
    const payload = JSON.parse(text + decoder.decode());
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Expected a JSON object');
    return payload;
  } catch {
    throw new ContactError('请求数据格式无效。');
  }
}

function secureCookie(token, maxAge) {
  return { 'Set-Cookie': `${cookieName}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict` };
}

function readTokenHash(request) {
  const token = sessionToken(request.headers.get('cookie'));
  return token ? hashToken(token) : '';
}

async function signedInUser(db, request) {
  const hash = readTokenHash(request);
  if (!hash) return null;
  return db.prepare(`
    SELECT users.id, users.username FROM sessions JOIN users ON sessions.user_id = users.id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).bind(hash, Date.now()).first();
}

async function authenticate(db, request, registering) {
  const { username, salt, proof } = await readJson(request);
  if (typeof username !== 'string' || username.length > 24 || typeof proof !== 'string' || !/^[0-9a-f]{64}$/.test(proof)) {
    throw new ContactError('用户名或密码不正确。', 401);
  }

  const key = usernameKey(username);
  const proofHash = hashToken(proof);
  const statements = [];
  let user;
  if (registering) {
    const name = registrationUsername(username);
    if (typeof salt !== 'string' || !/^[0-9a-f]{32}$/.test(salt)) throw new ContactError('注册请求无效。');
    user = { id: crypto.randomUUID(), username: name };
    statements.push(db.prepare(`
      INSERT INTO users (id, username, name_key, salt, password_hash) VALUES (?, ?, ?, ?, ?)
    `).bind(user.id, user.username, key, salt, proofHash));
  } else {
    user = await db.prepare('SELECT id, username, password_hash FROM users WHERE name_key = ?').bind(key).first();
    const match = timingSafeEqual(Buffer.from(proofHash, 'hex'), Buffer.from(user?.password_hash || '0'.repeat(64), 'hex'));
    if (!user || !match) throw new ContactError('用户名或密码不正确。', 401);
  }

  const token = newToken();
  const now = Date.now();
  statements.push(
    db.prepare('DELETE FROM sessions WHERE expires_at <= ? OR token_hash = ?').bind(now, readTokenHash(request)),
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').bind(hashToken(token), user.id, now + sessionLifetime),
  );
  try {
    await db.batch(statements);
  } catch (error) {
    if (registering && error.message.includes('users.name_key')) throw new ContactError('这个用户名已被使用。', 409);
    throw error;
  }
  return json({ user: { id: user.id, username: user.username } }, registering ? 201 : 200, secureCookie(token, sessionLifetime / 1000));
}

async function handleAuth(request, env, url) {
  const path = url.pathname;
  const method = request.method;
  const db = env.DB;
  if (method === 'GET' && path === '/api/auth/session') {
    return json({ user: await signedInUser(db, request), passwordScheme, workbookMode: 'browser' });
  }
  if (method === 'POST' && path === '/api/auth/logout') {
    const hash = readTokenHash(request);
    if (hash) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(hash).run();
    return noContent(secureCookie('', 0));
  }

  const isSalt = method === 'GET' && path === '/api/auth/salt';
  const isCredentials = method === 'POST' && ['/api/auth/register', '/api/auth/login'].includes(path);
  if (!isSalt && !isCredentials) throw new ContactError('找不到对应功能。', 404);

  const { success } = await env.AUTH_RATE_LIMIT.limit({ key: request.headers.get('CF-Connecting-IP') || 'local' });
  if (!success) return json({ error: '尝试次数过多，请稍后再试。' }, 429, { 'Retry-After': '60' });
  if (isCredentials) return authenticate(db, request, path === '/api/auth/register');

  const username = url.searchParams.get('username') || '';
  if (username.length > 24) throw new ContactError('用户名或密码不正确。', 401);
  const key = usernameKey(username);
  const entry = await db.prepare(`
    SELECT users.salt, settings.value AS secret FROM settings LEFT JOIN users ON users.name_key = ?
    WHERE settings.key = 'salt_secret'
  `).bind(key).first();
  const otherSalt = createHmac('sha256', entry.secret).update(key).digest('hex').slice(0, 32);
  return json({ salt: entry.salt || otherSalt });
}

async function loadBook(db, id) {
  const row = await db.prepare('SELECT version, data FROM books WHERE user_id = ?').bind(id).first();
  return { version: row?.version || 0, book: row ? JSON.parse(row.data) : { contacts: [], groups: [] } };
}

async function updateBook(db, id, operation) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { version, book } = await loadBook(db, id);
    const result = operation(book);
    const data = JSON.stringify(book);
    // Leave room for row metadata under D1's 2 MB maximum row size.
    if (Buffer.byteLength(data, 'utf8') > 1_900_000) throw new ContactError('通讯录数据已达到存储上限。', 413);
    const write = version
      ? db.prepare('UPDATE books SET data = ?, version = version + 1 WHERE user_id = ? AND version = ?').bind(data, id, version)
      : db.prepare('INSERT INTO books (user_id, version, data) VALUES (?, 1, ?) ON CONFLICT(user_id) DO NOTHING').bind(id, data);
    if ((await write.run()).meta.changes) return result;
  }
  throw new ContactError('通讯录同时有其他修改，请重试。', 409);
}

async function contactRoutes(request, db, userId, url) {
  const method = request.method;
  const [resource, id, action, extra] = url.pathname.slice(5).split('/');
  if (extra) throw new ContactError('找不到对应功能。', 404);
  const update = (operation) => updateBook(db, userId, operation);

  if (resource === 'groups') {
    if (method === 'DELETE' && id && !action) {
      await update((book) => deleteGroupInBook(book, id));
      return noContent();
    }
    if ((method === 'POST' && !id) || (method === 'PATCH' && id && !action)) {
      const { name } = await readJson(request);
      return json({ group: await update((book) => saveGroupInBook(book, id, name)) }, id ? 200 : 201);
    }
  }
  if (resource === 'contacts') {
    if (method === 'GET' && !id) return json((await loadBook(db, userId)).book);
    if (method === 'POST' && !id) {
      const input = await readJson(request);
      return json({ contact: await update((book) => addContactToBook(book, input)) }, 201);
    }
    if (method === 'POST' && id === 'import' && !action) {
      const { contacts } = await readJson(request, 5 * 1024 * 1024);
      if (!Array.isArray(contacts) || contacts.length > 5000) throw new ContactError('请使用最多 5,000 位联系人的 Excel 表格。');
      const validated = contacts.map(readContact);
      return json(await update((book) => importContactsIntoBook(book, validated)));
    }
    if (method === 'PUT' && id && action === 'groups') {
      const { groupIds } = await readJson(request);
      return json({ contact: await update((book) => setGroupsInBook(book, id, groupIds)) });
    }
    if (method === 'PATCH' && id && action === 'favorite') {
      const { favorite } = await readJson(request);
      if (typeof favorite !== 'boolean') throw new ContactError('收藏状态无效。');
      return json({ contact: await update((book) => changeContactInBook(book, id, (contact) => ({ ...contact, favorite }))) });
    }
    if (method === 'PUT' && id && !action) {
      const { name, methods } = readContact(await readJson(request));
      return json({ contact: await update((book) => changeContactInBook(book, id, (contact) => ({ ...contact, name, methods }))) });
    }
    if (method === 'DELETE' && id && !action) {
      await update((book) => changeContactInBook(book, id, () => null));
      return noContent();
    }
  }
  throw new ContactError('找不到对应功能。', 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      const origin = request.headers.get('origin');
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)
          && (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== url.origin))) {
        throw new ContactError('此请求无法在当前页面完成。', 403);
      }
      if (request.method === 'GET' && url.pathname === '/api/health') {
        await env.DB.prepare('SELECT key FROM settings LIMIT 1').first();
        return json({ status: 'ok' });
      }
      if (url.pathname.startsWith('/api/auth/')) return await handleAuth(request, env, url);
      const user = await signedInUser(env.DB, request);
      if (!user) throw new ContactError('请先登录。', 401);
      const expectedAccount = request.headers.get('x-address-book-account');
      if (expectedAccount && expectedAccount !== user.id) throw new ContactError('账号已切换，请刷新页面。', 401);
      return await contactRoutes(request, env.DB, user.id, url);
    } catch (error) {
      if (error instanceof ContactError) return json({ error: error.message }, error.status);
      console.error(error);
      return json({ error: '暂时无法保存或读取联系人。请重试。' }, 500);
    }
  },
};
