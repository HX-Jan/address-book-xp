import { findAccount } from './auth.js';
import { listAddressBook } from './contacts.js';
import { accountBookFile, legacyBookFile, writeJson } from './storage.js';

const username = process.argv[2];
const user = username && findAccount(username);
if (!user) {
  console.error('请先注册目标账号，然后运行 npm run migrate:contacts -- <用户名>。');
  process.exit(1);
}

const targetFile = accountBookFile(user.id);
const target = listAddressBook(targetFile);
const legacy = listAddressBook(legacyBookFile);
if (target.contacts.length || target.groups.length) {
  console.error('目标账号已有联系人或分组，请使用空通讯录账号。');
  process.exit(1);
}
if (legacy.contacts.length || legacy.groups.length) writeJson(targetFile, legacy);
console.log(`已复制 ${legacy.contacts.length} 位联系人和 ${legacy.groups.length} 个分组至账号 ${user.username}。`);
