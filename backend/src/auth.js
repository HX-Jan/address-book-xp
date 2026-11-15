import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Router } from 'express';
import { ContactError } from './contacts.js';
import { accountBookFile, dataDirectory, readJson, writeJson } from './storage.js';

const file = join(dataDirectory, 'accounts.json');
const cookieName = 'xp_address_session';
const sessionLifetime = 7 * 24 * 60 * 60 * 1000;
const scryptAsync = promisify(scrypt);
const dummySalt = randomBytes(16);
const dummyHash = Buffer.alloc(64);
const attempts = new Map();
let resetAttemptsAt = 0;

const usernameKey = (name) => name.normalize('NFKC').trim().toLowerCase();
const readAccounts = () => readJson(file, { users: [], sessions: [] });
const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export function findAccount(username) {
  const key = usernameKey(username);
  return readAccounts().users.find((user) => user.key === key);
}

function sessionToken(request) {
  const cookie = request.get('cookie')?.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`));
  const token = cookie?.slice(cookieName.length + 1);
  return /^[\w-]{43}$/.test(token || '') ? token : '';
}

function signedInUser(request) {
  const token = sessionToken(request);
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
  const previousToken = sessionToken(request);
  const previousHash = previousToken ? hashToken(previousToken) : '';
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  data.sessions = data.sessions.filter((entry) => entry.tokenHash !== previousHash && entry.expiresAt > now);
  data.sessions.push({ tokenHash: hashToken(token), userId: user.id, expiresAt: now + sessionLifetime });
  writeJson(file, data);
  response.cookie(cookieName, token, { ...cookieOptions(request), maxAge: sessionLifetime });
}

function passwordHash(password, salt) {
  return scryptAsync(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
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
  const username = typeof request.body?.username === 'string' ? request.body.username.normalize('NFKC').trim() : '';
  const password = request.body?.password;
  if (username.length < 2 || username.length > 24 || !/^[\p{L}\p{N}_-]+$/u.test(username)) {
    throw new ContactError('用户名需为 2 至 24 个字符，可使用文字、数字、下划线或短横线。');
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new ContactError('密码需为 8 至 128 个字符。');
  }

  const salt = randomBytes(16);
  const hash = await passwordHash(password, salt);
  const data = readAccounts();
  const key = usernameKey(username);
  if (data.users.some((user) => user.key === key)) throw new ContactError('这个用户名已被使用。', 409);

  const user = { id: randomUUID(), key, username, salt: salt.toString('hex'), hash: hash.toString('hex') };
  data.users.push(user);
  signIn(request, response, data, user);
  response.status(201).json({ user: { username } });
});

authRouter.post('/login', limitAuthAttempts, async (request, response) => {
  const { username, password } = request.body || {};
  if (typeof username !== 'string' || username.length > 24 || typeof password !== 'string' || password.length > 128) {
    throw new ContactError('用户名或密码不正确。', 401);
  }

  const user = findAccount(username);
  const hash = await passwordHash(password, user ? Buffer.from(user.salt, 'hex') : dummySalt);
  const valid = timingSafeEqual(hash, user ? Buffer.from(user.hash, 'hex') : dummyHash);
  if (!valid || !user) throw new ContactError('用户名或密码不正确。', 401);

  signIn(request, response, readAccounts(), user);
  response.json({ user: { username: user.username } });
});

authRouter.post('/logout', (request, response) => {
  const token = sessionToken(request);
  if (token) {
    const tokenHash = hashToken(token);
    const data = readAccounts();
    const active = data.sessions.filter((entry) => entry.tokenHash !== tokenHash);
    if (active.length !== data.sessions.length) writeJson(file, { ...data, sessions: active });
  }
  response.clearCookie(cookieName, cookieOptions(request)).sendStatus(204);
});
