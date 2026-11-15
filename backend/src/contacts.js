import { randomUUID } from 'node:crypto';
import { readJson, writeJson } from './storage.js';

export const methodLabels = { phone: '电话', email: '邮箱', social: '社交账号', address: '地址' };

export class ContactError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function readContact(input) {
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 80) {
    throw new ContactError('请输入 1 至 80 个字符的姓名。');
  }

  if (!Array.isArray(input.methods) || input.methods.length > 32) {
    throw new ContactError('每位联系人最多可保存 32 项联系方式。');
  }

  const methods = input.methods.map((method) => {
    const value = typeof method?.value === 'string' ? method.value.trim() : '';
    if (!Object.hasOwn(methodLabels, method?.type) || !value || value.length > 300) {
      throw new ContactError('请为每项联系方式填写类型和内容（最多 300 个字符）。');
    }

    return { type: method.type, value };
  });

  return { name, methods, favorite: input.favorite === true };
}

export function listAddressBook(file) {
  const data = readJson(file, { contacts: [], groups: [] });
  if (Array.isArray(data)) {
    return { contacts: data.map((contact) => ({ ...contact, groupIds: [] })), groups: [] };
  }
  return data;
}

export function addContact(file, input) {
  const data = readContact(input);
  if (!data.methods.some(({ type }) => type === 'phone')) {
    throw new ContactError('请填写电话号码。');
  }

  const contact = { id: randomUUID(), ...data, groupIds: [] };
  const book = listAddressBook(file);
  book.contacts.push(contact);
  writeJson(file, book);
  return contact;
}

export function changeContact(file, id, change) {
  const book = listAddressBook(file);
  const { contacts, groups } = book;
  const index = contacts.findIndex((contact) => contact.id === id);
  if (index === -1) throw new ContactError('这位联系人已不存在。', 404);

  const contact = change(contacts[index], groups);
  if (contact) contacts[index] = contact;
  else contacts.splice(index, 1);

  writeJson(file, book);
  return contact;
}

function groupNameKey(name) {
  return name.normalize('NFKC').toLowerCase();
}

export function saveGroup(file, id, input) {
  const name = typeof input === 'string' ? input.trim() : '';
  if (!name) throw new ContactError('请输入分组名称。');

  const book = listAddressBook(file);
  const existing = book.groups.find((group) => group.id === id);
  if (id && !existing) throw new ContactError('这个分组已不存在。', 404);
  const key = groupNameKey(name);
  if (book.groups.some((group) => group.id !== id && groupNameKey(group.name) === key)) {
    throw new ContactError('这个分组名称已存在。', 409);
  }

  const group = existing || { id: randomUUID() };
  group.name = name;
  if (!existing) book.groups.push(group);
  writeJson(file, book);
  return group;
}

export function deleteGroup(file, id) {
  const book = listAddressBook(file);
  const index = book.groups.findIndex((group) => group.id === id);
  if (index === -1) throw new ContactError('这个分组已不存在。', 404);

  book.groups.splice(index, 1);
  for (const contact of book.contacts) {
    contact.groupIds = contact.groupIds.filter((groupId) => groupId !== id);
  }
  writeJson(file, book);
}

export function setContactGroups(file, id, groupIds) {
  if (!Array.isArray(groupIds)) throw new ContactError('请选择有效的分组。');

  return changeContact(file, id, (contact, groups) => {
    const knownIds = new Set(groups.map((group) => group.id));
    if (groupIds.some((groupId) => !knownIds.has(groupId))) {
      throw new ContactError('部分分组已不存在，请刷新后重试。', 409);
    }

    return { ...contact, groupIds: [...new Set(groupIds)] };
  });
}

function contactKey({ name, methods }) {
  return JSON.stringify([name, methods.map(({ type, value }) => `${type}:${value}`).sort()]);
}

export function importContacts(file, incoming) {
  const book = listAddressBook(file);
  const { contacts } = book;
  const known = new Set(contacts.map(contactKey));
  const added = [];

  for (const contact of incoming) {
    const key = contactKey(contact);
    if (known.has(key)) continue;

    known.add(key);
    added.push({ id: randomUUID(), ...contact, groupIds: [] });
  }

  if (added.length) {
    contacts.push(...added);
    writeJson(file, book);
  }
  return { imported: added.length, skipped: incoming.length - added.length };
}
