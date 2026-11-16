import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ContactError } from './contact-domain.js';

const scryptAsync = promisify(scrypt);
const dummySalt = Buffer.alloc(16);
const dummyHash = Buffer.alloc(64);

export const cookieName = 'xp_address_session';
export const sessionLifetime = 7 * 24 * 60 * 60 * 1000;
export const usernameKey = (name) => name.normalize('NFKC').trim().toLowerCase();
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

export function sessionToken(header) {
  const cookie = header?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`));
  const token = cookie?.slice(cookieName.length + 1);
  return /^[\w-]{43}$/.test(token || '') ? token : '';
}

function passwordHash(password, salt) {
  return scryptAsync(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
}

export function registrationUsername(value) {
  const username = typeof value === 'string' ? value.normalize('NFKC').trim() : '';
  if (username.length < 2 || username.length > 24 || !/^[\p{L}\p{N}_-]+$/u.test(username)) {
    throw new ContactError('用户名需为 2 至 24 个字符，可使用文字、数字、下划线或短横线。');
  }
  return username;
}

export async function createAccount(input) {
  const username = registrationUsername(input?.username);
  const password = input?.password;
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new ContactError('密码需为 8 至 128 个字符。');
  }

  const salt = randomBytes(16);
  const hash = await passwordHash(password, salt);
  return { id: randomUUID(), key: usernameKey(username), username, salt: salt.toString('hex'), hash: hash.toString('hex') };
}

export async function authenticate(input, findUser) {
  const { username, password } = input || {};
  if (typeof username !== 'string' || username.length > 24 || typeof password !== 'string' || password.length > 128) {
    throw new ContactError('用户名或密码不正确。', 401);
  }

  const user = await findUser(usernameKey(username));
  const hash = await passwordHash(password, user ? Buffer.from(user.salt, 'hex') : dummySalt);
  const valid = timingSafeEqual(hash, user ? Buffer.from(user.hash, 'hex') : dummyHash);
  if (!valid || !user) throw new ContactError('用户名或密码不正确。', 401);
  return user;
}
