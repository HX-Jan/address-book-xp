import express from 'express';
import { fileURLToPath } from 'node:url';
import { authRouter, requireAccount } from './auth.js';
import {
  addContact, changeContact, ContactError, deleteGroup, importContacts,
  listAddressBook, readContact, saveGroup, setContactGroups,
} from './contacts.js';
import { exportWorkbook, readWorkbook, workbookType } from './workbook.js';

const app = express();
const host = '127.0.0.1';
const port = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
if (process.env.ADDRESS_BOOK_TRUST_LOOPBACK_PROXY === '1') {
  app.set('trust proxy', 'loopback');
}
app.use('/api', (request, response, next) => {
  response.set('Cache-Control', 'no-store');
  const origin = request.get('origin');
  const sameOrigin = `${request.protocol}://${request.get('host')}`;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)
      && (request.get('sec-fetch-site') === 'cross-site' || (origin && origin !== sameOrigin))) {
    throw new ContactError('此请求无法在当前页面完成。', 403);
  }
  next();
});
app.use(express.json({ limit: '192kb' }));

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use(['/api/contacts', '/api/groups'], requireAccount);

app.get('/api/contacts', (_request, response) => {
  response.json(listAddressBook(response.locals.bookFile));
});

app.get('/api/contacts/export', async (_request, response) => {
  const workbook = await exportWorkbook(listAddressBook(response.locals.bookFile).contacts);
  response.attachment('contacts.xlsx').type(workbookType).send(workbook);
});

app.post('/api/contacts/import', express.raw({ type: workbookType, limit: '5mb' }), async (request, response) => {
  const contacts = await readWorkbook(request.body);
  response.json(importContacts(response.locals.bookFile, contacts));
});

app.post('/api/contacts', (request, response) => {
  response.status(201).json({ contact: addContact(response.locals.bookFile, request.body) });
});

app.put('/api/contacts/:id', (request, response) => {
  const edited = readContact(request.body);
  const contact = changeContact(response.locals.bookFile, request.params.id, (current) => ({
    ...current,
    name: edited.name,
    methods: edited.methods,
  }));
  response.json({ contact });
});

app.patch('/api/contacts/:id/favorite', (request, response) => {
  const favorite = request.body?.favorite;
  if (typeof favorite !== 'boolean') throw new ContactError('收藏状态无效。');

  const contact = changeContact(response.locals.bookFile, request.params.id, (current) => ({ ...current, favorite }));
  response.json({ contact });
});

app.put('/api/contacts/:id/groups', (request, response) => {
  response.json({ contact: setContactGroups(response.locals.bookFile, request.params.id, request.body?.groupIds) });
});

app.delete('/api/contacts/:id', (request, response) => {
  changeContact(response.locals.bookFile, request.params.id, () => null);
  response.sendStatus(204);
});

app.post('/api/groups', (request, response) => {
  response.status(201).json({ group: saveGroup(response.locals.bookFile, null, request.body?.name) });
});

app.patch('/api/groups/:id', (request, response) => {
  response.json({ group: saveGroup(response.locals.bookFile, request.params.id, request.body?.name) });
});

app.delete('/api/groups/:id', (request, response) => {
  deleteGroup(response.locals.bookFile, request.params.id);
  response.sendStatus(204);
});

if (process.env.ADDRESS_BOOK_SERVE_FRONTEND === '1') {
  app.use(express.static(fileURLToPath(new URL('../../frontend/dist/', import.meta.url))));
}

app.use((error, _request, response, _next) => {
  if (error instanceof ContactError) {
    return response.status(error.status).json({ error: error.message });
  }
  if (error.type === 'entity.too.large') {
    return response.status(413).json({ error: '文件或数据超出大小限制。' });
  }
  if (error.type === 'entity.parse.failed') {
    return response.status(400).json({ error: '请求数据格式无效。' });
  }

  console.error(error);
  response.status(500).json({ error: '暂时无法保存或读取联系人。请重试。' });
});

app.listen(port, host, (error) => {
  if (error) {
    throw error;
  }

  console.log(`Address book API listening on http://${host}:${port}`);
});
