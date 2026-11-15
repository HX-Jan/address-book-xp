import './style.css';

const panel = document.querySelector('.contact-panel');
const contactList = document.querySelector('.contact-list');
const status = document.querySelector('.status');
const panelState = document.querySelector('.panel-state');
const retry = document.querySelector('.retry');

function renderContacts(contacts) {
  const rows = contacts.map(({ name }) => {
    const row = document.createElement('li');
    row.textContent = name;
    return row;
  });

  contactList.replaceChildren(...rows);
  contactList.hidden = rows.length === 0;
  panelState.classList.toggle('panel-state--summary', rows.length > 0);
  status.textContent = rows.length ? `${rows.length} 位联系人` : '暂无联系人';
}

async function loadContacts() {
  panel.setAttribute('aria-busy', 'true');
  status.textContent = '正在加载联系人…';
  retry.hidden = true;

  try {
    const response = await fetch('/api/contacts', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      throw new Error(`Unable to load contacts: ${response.status}`);
    }

    const { contacts } = await response.json();
    renderContacts(contacts);
  } catch {
    status.textContent = '无法连接到通讯录服务，请确认后端已启动。';
    retry.hidden = false;
  } finally {
    panel.setAttribute('aria-busy', 'false');
  }
}

retry.addEventListener('click', loadContacts);
loadContacts();
