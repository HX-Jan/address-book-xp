import express from 'express';

const app = express();
const host = '127.0.0.1';
const port = 3000;

app.disable('x-powered-by');

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.get('/api/contacts', (_request, response) => {
  response.json({ contacts: [] });
});

app.listen(port, host, (error) => {
  if (error) {
    throw error;
  }

  console.log(`Address book API listening on http://${host}:${port}`);
});
