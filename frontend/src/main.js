import { api } from './api.js';
import { startSession } from './auth.js';
import { icon, mountIcons } from './icons.js';
import './style.css';

const fields = { phone: '电话', email: '邮箱', social: '社交账号', address: '地址' };
const collator = new Intl.Collator('zh-CN', { numeric: true });
const $ = (id) => document.getElementById(id);
const views = document.querySelectorAll('[data-view]');
const detailsDialog = $('details');
const editor = $('editor');
const methodPicker = $('method-picker');
const deleteDialog = $('delete-dialog');
const groupManager = $('group-manager');
const groupMembership = $('group-membership');
const groupDelete = $('group-delete');
const groupFilter = $('group-filter');
const search = $('search');
const list = $('contact-list');
const methodFields = $('method-fields');

let contacts = [];
let groups = [];
let activeGroupId = '';
let view = 'all';
let selectedId = null;
let listStatus = 'loading';
let editingId;
let deletingId;
let renamingGroupId;
let deletingGroupId;
let feedbackTimer;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function selectedContact() {
  return contacts.find(({ id }) => id === selectedId);
}

function searchableText(value) {
  return value.normalize('NFKC').toLocaleLowerCase();
}

function visibleContacts(groupContacts) {
  const query = searchableText(search.value.trim());
  const digits = /^[\d+().\s\p{Dash_Punctuation}]+$/u.test(query) ? query.replace(/\D/g, '') : '';
  return groupContacts.filter((contact) => {
    if (view === 'favorites' && !contact.favorite) return false;
    if (searchableText(contact.name).includes(query)) return true;

    return contact.methods.some(({ type, value }) => {
      const text = searchableText(value);
      return text.includes(query) || (type === 'phone' && digits && text.replace(/\D/g, '').includes(digits));
    });
  }).sort((a, b) => collator.compare(a.name, b.name));
}

function sortedGroups() {
  return groups.toSorted((a, b) => collator.compare(a.name, b.name));
}

function renderGroupFilter() {
  if (!groups.some(({ id }) => id === activeGroupId)) activeGroupId = '';
  const options = sortedGroups().map(({ id, name }) => new Option(name, id));
  groupFilter.replaceChildren(new Option('全部分组', ''), ...options, new Option('管理分组…', 'manage'));
  groupFilter.value = activeGroupId;
}

function renderRow(contact) {
  const row = element('li');
  const button = element('button', 'contact-row');
  button.type = 'button';
  button.dataset.contactId = contact.id;
  button.setAttribute('aria-haspopup', 'dialog');

  const phone = contact.methods.find(({ type }) => type === 'phone')?.value;
  const email = contact.methods.find(({ type }) => type === 'email')?.value;
  const name = element('span', 'row-primary');
  name.append(element('span', 'row-name', contact.name));
  const summary = phone || email || contact.methods[0]?.value;
  if (summary) name.append(element('span', 'row-summary', summary));

  const phoneCell = element('span', 'row-value column-phone', phone || '—');
  const emailCell = element('span', 'row-value column-email', email || '—');
  const controls = element('span', 'row-end');

  if (contact.favorite) {
    const marker = icon('star');
    marker.classList.add('favorite-mark');
    controls.append(marker);
  }

  controls.append(icon('forward'));
  button.append(name, phoneCell, emailCell, controls);
  row.append(button);
  return row;
}

function renderMethod(type, values) {
  const group = element('dl', 'method-group');
  group.append(element('dt', '', fields[type]));
  for (const { value } of values) {
    const item = element('dd');
    const number = value.replace(/[().\s-]/g, '');
    let address;
    if (type === 'phone' && /^\+?\d+$/.test(number)) address = `tel:${number}`;
    if (type === 'email' && /^[^\s@]+@[^\s@]+$/.test(value)) {
      address = `mailto:${encodeURIComponent(value.toWellFormed()).replace('%40', '@')}`;
    }
    if (address) {
      const target = element('a', 'method-value', value);
      target.href = address;
      item.append(target);
    } else {
      item.append(element('span', 'method-value', value));
    }
    if (type === 'phone' || type === 'email') {
      const copy = element('button', 'icon-button plain copy-method');
      const label = `复制${fields[type]}`;
      copy.type = 'button';
      copy.setAttribute('aria-label', label);
      copy.title = label;
      copy.append(icon('copy'));
      copy.addEventListener('click', () => copyMethod(type, value));
      item.append(copy);
    }
    group.append(item);
  }
  return group;
}

async function copyMethod(type, value) {
  const contactId = selectedId;
  const output = $('detail-copy-status');
  let message;
  let failed = false;
  try {
    await navigator.clipboard.writeText(value);
    message = `已复制${fields[type]}`;
  } catch {
    message = '无法复制，请手动选中文字。';
    failed = true;
  }

  if (!detailsDialog.open || selectedId !== contactId) return;
  output.classList.toggle('form-error', failed);
  output.textContent = message;
}

function renderDetails(contact) {
  if (!contact) {
    if (detailsDialog.open) detailsDialog.close();
    return;
  }

  detailsDialog.dataset.contactId = contact.id;
  $('contact-name').textContent = contact.name;
  const favorite = $('favorite');
  const favoriteLabel = contact.favorite ? '取消收藏' : '收藏联系人';
  favorite.setAttribute('aria-pressed', contact.favorite);
  favorite.setAttribute('aria-label', favoriteLabel);
  favorite.title = favoriteLabel;

  const methodGroups = Object.entries(Object.groupBy(contact.methods, ({ type }) => type));
  const details = methodGroups.map(([type, values]) => renderMethod(type, values));
  if (!details.length) details.push(element('p', 'no-methods', '暂无联系方式'));
  $('method-details').replaceChildren(...details);
  const names = sortedGroups().filter(({ id }) => contact.groupIds?.includes(id)).map(({ name }) => name);
  $('contact-groups').textContent = names.join('、') || '未分组';

  if (!detailsDialog.open) {
    $('detail-copy-status').textContent = '';
    setDialogError('detail-error');
    detailsDialog.showModal();
  }
}

function render() {
  const groupContacts = activeGroupId ? contacts.filter((contact) => contact.groupIds?.includes(activeGroupId)) : contacts;
  const visible = visibleContacts(groupContacts);
  if (selectedId && !visible.some(({ id }) => id === selectedId)) selectedId = null;
  $('all-count').textContent = listStatus === 'ready' ? groupContacts.length : '';
  $('favorite-count').textContent = listStatus === 'ready' ? groupContacts.filter(({ favorite }) => favorite).length : '';
  for (const button of views) button.setAttribute('aria-pressed', button.dataset.view === view);

  list.replaceChildren(...visible.map(renderRow));
  list.hidden = !visible.length;
  $('column-head').hidden = list.hidden;
  $('list-state').hidden = Boolean(visible.length);
  $('retry').hidden = listStatus !== 'error';
  const empty = search.value.trim() || activeGroupId ? '未找到联系人' : view === 'favorites' ? '暂无收藏' : '暂无联系人';
  const statuses = { loading: '正在载入…', error: '无法载入联系人', ready: empty };
  $('list-status').textContent = statuses[listStatus];
  renderDetails(selectedContact());
}

async function loadContacts() {
  listStatus = 'loading';
  render();
  try {
    ({ contacts, groups = [] } = await api.list());
    renderGroupFilter();
    listStatus = 'ready';
  } catch {
    listStatus = 'error';
  }
  render();
}

function storeContact(contact) {
  const index = contacts.findIndex(({ id }) => id === contact.id);
  if (index === -1) contacts.push(contact);
  else contacts[index] = contact;
  listStatus = 'ready';
}

function notice(message, error = false) {
  const output = $('feedback');
  clearTimeout(feedbackTimer);
  output.classList.toggle('is-error', error);
  output.hidden = false;
  output.textContent = message;
  feedbackTimer = setTimeout(() => { output.hidden = true; }, 5000);
}

function setDialogError(id, message = '') {
  $(id).textContent = message;
  $(id).hidden = !message;
}

function appendMethod({ type = 'phone', value = '' } = {}, focus = true) {
  const row = element('div', 'method-field');
  row.dataset.methodType = type;

  const input = element('input');
  input.maxLength = 300;
  input.value = value;

  if (editingId) {
    const select = element('select');
    select.setAttribute('aria-label', '联系方式类型');
    for (const [key, label] of Object.entries(fields)) select.add(new Option(label, key));
    select.value = type;
    input.setAttribute('aria-label', '联系方式');

    const updateInput = () => {
      row.dataset.methodType = select.value;
      input.inputMode = { phone: 'tel', email: 'email' }[select.value] || 'text';
      input.placeholder = { phone: '号码', email: '邮箱地址', social: '账号', address: '详细地址' }[select.value];
    };
    select.addEventListener('change', updateInput);
    updateInput();
    row.append(select, input);
  } else {
    const field = element('label', 'field');
    const label = element('span', 'field-label', type === 'phone' ? '其他电话' : fields[type]);
    if (type === 'social' || type === 'address') label.append(element('small', '', '选填'));
    input.type = { phone: 'tel', email: 'email' }[type] || 'text';
    field.append(label, input);
    row.classList.add('optional-method');
    row.append(field);
  }

  const remove = element('button', 'icon-button remove-method');
  remove.type = 'button';
  remove.setAttribute('aria-label', '移除此联系方式');
  remove.append(icon('close'));
  remove.addEventListener('click', () => {
    row.remove();
    $('add-method').disabled = false;
    $('add-method').focus();
  });

  row.append(remove);
  methodFields.append(row);
  $('add-method').disabled = methodFields.children.length >= (editingId ? 32 : 31);
  if (focus) input.focus();
}

function openEditor(contact) {
  editingId = contact?.id;
  editor.classList.toggle('create-editor', !contact);
  $('editor-title').textContent = contact ? '编辑联系人' : '新建联系人';
  $('name').value = contact?.name ?? '';
  const newFields = $('new-contact-fields');
  newFields.hidden = Boolean(contact);
  newFields.disabled = newFields.hidden;
  $('edit-methods-label').hidden = !contact;
  $('phone').value = '';
  methodFields.replaceChildren();
  $('add-method').disabled = false;
  for (const method of contact?.methods || []) appendMethod(method, false);
  setDialogError('form-error');
  editor.showModal();
}

function startAction(button, action, onError) {
  button.disabled = true;
  return action().catch(onError).finally(() => { button.disabled = false; });
}

function renderGroupManager() {
  const rows = sortedGroups().map(({ id, name }) => {
    const row = element('li');
    row.append(element('span', 'group-name', name));
    for (const [action, label] of [['rename', '重命名'], ['delete', '删除']]) {
      const button = element('button', `button plain${action === 'delete' ? ' delete' : ''}`, label);
      button.type = 'button';
      button.dataset.groupAction = action;
      button.dataset.groupId = id;
      button.setAttribute('aria-label', `${label} ${name}`);
      row.append(button);
    }
    return row;
  });
  $('group-list').replaceChildren(...rows);
  $('group-list').hidden = rows.length === 0;
}

function setGroupForm(group) {
  renamingGroupId = group?.id;
  $('group-name').value = group?.name ?? '';
  $('save-group').textContent = group ? '保存名称' : '新建分组';
  $('cancel-rename').hidden = !group;
  setDialogError('group-error');
}

groupFilter.addEventListener('change', () => {
  if (groupFilter.value === 'manage') {
    groupFilter.value = activeGroupId;
    setGroupForm();
    renderGroupManager();
    groupManager.showModal();
    return;
  }

  activeGroupId = groupFilter.value;
  render();
});

$('group-list').addEventListener('click', (event) => {
  const action = event.target.closest('[data-group-action]');
  if (!action || $('save-group').disabled) return;

  const group = groups.find(({ id }) => id === action.dataset.groupId);
  if (!group) return;
  if (action.dataset.groupAction === 'rename') {
    setGroupForm(group);
    $('group-name').focus();
    $('group-name').select();
  } else {
    deletingGroupId = group.id;
    $('group-delete-message').textContent = `删除分组「${group.name}」？组内联系人将保留。`;
    setDialogError('group-delete-error');
    groupDelete.showModal();
  }
});

$('cancel-rename').addEventListener('click', () => {
  if ($('save-group').disabled) return;
  setGroupForm();
  $('group-name').focus();
});

$('group-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = $('group-name').value.trim();
  setDialogError('group-error');
  startAction($('save-group'), async () => {
    const { group } = await api.saveGroup(renamingGroupId, name);
    groups = [...groups.filter(({ id }) => id !== group.id), group];
    renderGroupFilter();
    renderGroupManager();
    setGroupForm();
    $('group-name').focus();
  }, (error) => setDialogError('group-error', error.message));
});

$('confirm-group-delete').addEventListener('click', () => {
  const id = deletingGroupId;
  setDialogError('group-delete-error');
  startAction($('confirm-group-delete'), async () => {
    await api.removeGroup(id);
    groups = groups.filter((group) => group.id !== id);
    contacts = contacts.map((contact) => ({ ...contact, groupIds: contact.groupIds?.filter((groupId) => groupId !== id) || [] }));
    groupDelete.close();
    if (renamingGroupId === id) setGroupForm();
    renderGroupFilter();
    renderGroupManager();
    render();
    $('group-name').focus();
  }, (error) => setDialogError('group-delete-error', error.message));
});

$('edit-groups').addEventListener('click', () => {
  const contact = selectedContact();
  const choices = sortedGroups().map(({ id, name }) => {
    const label = element('label', 'group-choice');
    const checkbox = element('input');
    checkbox.type = 'checkbox';
    checkbox.value = id;
    checkbox.checked = contact.groupIds?.includes(id) || false;
    label.append(checkbox, element('span', '', name));
    return label;
  });
  if (!choices.length) choices.push(element('p', 'group-empty', '暂无分组'));
  $('group-choices').replaceChildren(...choices);
  setDialogError('group-membership-error');
  groupMembership.showModal();
});

$('group-membership-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const id = selectedId;
  const groupIds = Array.from($('group-choices').querySelectorAll('input:checked'), ({ value }) => value);
  setDialogError('group-membership-error');
  startAction($('save-membership'), async () => {
    const { contact } = await api.contactGroups(id, groupIds);
    storeContact(contact);
    groupMembership.close();
    render();
  }, (error) => setDialogError('group-membership-error', error.message));
});

for (const button of views) {
  button.addEventListener('click', () => {
    view = button.dataset.view;
    render();
  });
}

search.addEventListener('input', render);
list.addEventListener('click', (event) => {
  const row = event.target.closest('[data-contact-id]');
  if (!row) return;

  selectedId = row.dataset.contactId;
  renderDetails(selectedContact());
});

$('close-details').addEventListener('click', () => detailsDialog.close());
detailsDialog.addEventListener('close', () => {
  if (detailsDialog.open) return;

  selectedId = null;
  const opener = list.querySelector(`[data-contact-id="${CSS.escape(detailsDialog.dataset.contactId)}"]`);
  (opener || search).focus({ preventScroll: true });
});
$('retry').addEventListener('click', loadContacts);
$('new-contact').addEventListener('click', () => openEditor());
$('edit').addEventListener('click', () => openEditor(selectedContact()));
$('add-method').addEventListener('click', () => {
  if (editingId) appendMethod();
  else methodPicker.showModal();
});
methodPicker.addEventListener('click', (event) => {
  const option = event.target.closest('[data-method-type]');
  if (!option) return;

  methodPicker.close();
  appendMethod({ type: option.dataset.methodType });
});

for (const dialog of [editor, methodPicker, deleteDialog, groupManager, groupMembership, groupDelete]) {
  const controls = dialog.querySelectorAll('[data-close]');
  const isSubmitting = () => dialog.querySelector('.dialog-footer button:last-child')?.disabled;
  for (const control of controls) control.addEventListener('click', () => {
    if (!isSubmitting()) dialog.close();
  });
  dialog.addEventListener('cancel', (event) => {
    if (isSubmitting()) event.preventDefault();
  });
}

$('contact-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = $('name').value.trim();
  const methods = Array.from(methodFields.children, (row) => ({
    type: row.dataset.methodType,
    value: row.querySelector('input').value.trim(),
  })).filter(({ value }) => value);
  if (!editingId) {
    methods.unshift({ type: 'phone', value: $('phone').value.trim() });
  }
  const save = $('save');
  const closeButtons = editor.querySelectorAll('[data-close]');
  setDialogError('form-error');
  for (const button of closeButtons) button.disabled = true;

  startAction(save, async () => {
    const { contact } = await api.save(editingId, { name, methods });
    storeContact(contact);
    if (!editingId) {
      view = 'all';
      activeGroupId = '';
      groupFilter.value = '';
    }
    search.value = '';
    selectedId = contact.id;
    editor.close();
    render();
  }, (error) => setDialogError('form-error', error.message)).finally(() => {
    for (const button of closeButtons) button.disabled = false;
  });
});

$('favorite').addEventListener('click', () => {
  const current = selectedContact();
  setDialogError('detail-error');
  startAction($('favorite'), async () => {
    const { contact } = await api.favorite(current.id, !current.favorite);
    storeContact(contact);
    render();
  }, (error) => setDialogError('detail-error', error.message));
});

$('delete').addEventListener('click', () => {
  const { id, name } = selectedContact();
  deletingId = id;
  $('delete-message').textContent = `确定删除「${name}」？`;
  setDialogError('delete-error');
  deleteDialog.showModal();
});

$('confirm-delete').addEventListener('click', () => {
  const cancel = deleteDialog.querySelector('[data-close]');
  cancel.disabled = true;
  setDialogError('delete-error');
  startAction($('confirm-delete'), async () => {
    await api.remove(deletingId);
    contacts = contacts.filter(({ id }) => id !== deletingId);
    deleteDialog.close();
    render();
    notice('已删除联系人');
  }, (error) => setDialogError('delete-error', error.message)).finally(() => { cancel.disabled = false; });
});

$('import').addEventListener('click', () => $('workbook').click());
$('workbook').addEventListener('change', () => {
  const [file] = $('workbook').files;
  $('workbook').value = '';
  if (!file) return;

  startAction($('import'), async () => {
    const { imported, skipped } = await api.import(file);
    await loadContacts();
    const result = imported ? `已导入 ${imported} 位联系人` : '无新增联系人';
    notice(skipped ? `${result}，跳过 ${skipped} 条重复记录` : result);
  }, (error) => notice(error.message, true));
});

$('export').addEventListener('click', () => {
  startAction($('export'), async () => {
    const response = await api.export();
    const url = URL.createObjectURL(await response.blob());
    const link = element('a');
    link.href = url;
    link.download = 'contacts.xlsx';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, (error) => notice(error.message, true));
});

mountIcons();
startSession(loadContacts);
