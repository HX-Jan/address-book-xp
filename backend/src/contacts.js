import {
  addContactToBook, changeContactInBook, deleteGroupInBook,
  importContactsIntoBook, saveGroupInBook, setGroupsInBook,
} from './contact-domain.js';
import { readJson, writeJson } from './storage.js';

export { ContactError, readContact } from './contact-domain.js';

export function listAddressBook(file) {
  const data = readJson(file, { contacts: [], groups: [] });
  if (Array.isArray(data)) {
    return { contacts: data.map((contact) => ({ ...contact, groupIds: [] })), groups: [] };
  }
  return data;
}

function updateBook(file, operation) {
  const book = listAddressBook(file);
  const result = operation(book);
  writeJson(file, book);
  return result;
}

export const addContact = (file, input) => updateBook(file, (book) => addContactToBook(book, input));
export const changeContact = (file, id, change) => updateBook(file, (book) => changeContactInBook(book, id, change));
export const saveGroup = (file, id, name) => updateBook(file, (book) => saveGroupInBook(book, id, name));
export const deleteGroup = (file, id) => updateBook(file, (book) => deleteGroupInBook(book, id));
export const setContactGroups = (file, id, groupIds) => updateBook(file, (book) => setGroupsInBook(book, id, groupIds));

export function importContacts(file, incoming) {
  const book = listAddressBook(file);
  const result = importContactsIntoBook(book, incoming);
  if (result.imported) writeJson(file, book);
  return result;
}
