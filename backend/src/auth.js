import { join } from 'node:path';
import { Router } from 'express';
import { ContactError } from './contacts.js';
import { authenticate, cookieName, createAccount, hashToken, newToken, sessionLifetime, sessionToken, usernameKey } from './credentials.js';
import { accountBookFile, dataDirectory, readJson, writeJson } from './storage.js';

const file = join(dataDirectory, 'accounts.json');
const attempts = new Map();
let resetAttemptsAt = 0;

const readAccounts = () => readJson(file, { users: [], sessions: [] });

export function findAccount(username) {
  const key = usernameKey(username);
  return readAccounts().users.find((user) => user.key === key);
}

function signedInUser(request) {
  const token = sessionToken(request.get('cookie'));
  if (!token) return null;

  const { users, sessions } = readAccounts();
  const tokenHash = hashToken(token);
  const session = sessions.find((entry) => entry.tokenHash === tokenHash && entry.expiresAt > Date.now());
  return users.find((user) => user.id === session?.userId) || null;
}

function cookieOptions(request) {
  return { httpOnly: true, sameSite: 'strict', secure: request.secure, path: '/' };
}

function signIn(request, response, data, user) {
  const previousToken = sessionToken(request.get('cookie'));
  const previousHash = previousToken ? hashToken(previousToken) : '';
  const token = newToken();
  const now = Date.now();
  data.sessions = data.sessions.filter((entry) => entry.tokenHash !== previousHash && entry.expiresAt > now);
  data.sessions.push({ tokenHash: hashToken(token), userId: user.id, expiresAt: now + sessionLifetime });
  writeJson(file, data);
  response.cookie(cookieName, token, { ...cookieOptions(request), maxAge: sessionLifetime });
}

function limitAuthAttempts(request, response, next) {
  const now = Date.now();
  if (now >= resetAttemptsAt) {
    attempts.clear();
    resetAttemptsAt = now + 15 * 60 * 1000;
  }

  const count = (attempts.get(request.ip) || 0) + 1;
  attempts.set(request.ip, count);
  if (count > 30) {
    response.set('Retry-After', String(Math.ceil((resetAttemptsAt - now) / 1000)));
    throw new ContactError('尝试次数过多，请稍后再试。', 429);
  }
  next();
}

export function requireAccount(request, response, next) {
  const user = signedInUser(request);
  if (!user) throw new ContactError('请先登录。', 401);
  const expectedAccount = request.get('x-address-book-account');
  if (expectedAccount && expectedAccount !== user.id) throw new ContactError('账号已切换，请刷新页面。', 401);

  response.locals.bookFile = accountBookFile(user.id);
  next();
}

export const authRouter = Router();

authRouter.get('/session', (request, response) => {
  const user = signedInUser(request);
  response.json({ user: user ? { id: user.id, username: user.username } : null });
});

authRouter.post('/register', limitAuthAttempts, async (request, response) => {
  const user = await createAccount(request.body);
  const data = readAccounts();
  if (data.users.some(({ key }) => key === user.key)) throw new ContactError('这个用户名已被使用。', 409);

  data.users.push(user);
  signIn(request, response, data, user);
  response.status(201).json({ user: { username: user.username } });
});

authRouter.post('/login', limitAuthAttempts, async (request, response) => {
  const user = await authenticate(request.body, (key) => readAccounts().users.find((user) => user.key === key));
  signIn(request, response, readAccounts(), user);
  response.json({ user: { username: user.username } });
});

authRouter.post('/logout', (request, response) => {
  const token = sessionToken(request.get('cookie'));
  if (token) {
    const tokenHash = hashToken(token);
    const data = readAccounts();
    const active = data.sessions.filter((entry) => entry.tokenHash !== tokenHash);
    if (active.length !== data.sessions.length) writeJson(file, { ...data, sessions: active });
  }
  response.clearCookie(cookieName, cookieOptions(request)).sendStatus(204);
});
