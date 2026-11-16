import { api, configureSession } from './api.js';

const $ = (id) => document.getElementById(id);

function showError(output, message = '') {
  output.textContent = message;
  output.hidden = !message;
}

export function startSession(onSignIn) {
  const workspace = $('workspace');
  const authScreen = $('auth-screen');
  const modeButtons = document.querySelectorAll('[data-auth-mode]');
  const submit = $('auth-submit');
  const username = $('auth-username');
  const password = $('auth-password');
  const confirmation = $('auth-confirm');
  const accountMenu = $('account-menu');
  const sessionUpdates = new BroadcastChannel('xp-address-session');
  let mode = 'login';

  const reloadSession = () => {
    workspace.hidden = true;
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    window.location.reload();
  };
  const sessionChanged = () => {
    sessionUpdates.postMessage('changed');
    reloadSession();
  };
  sessionUpdates.addEventListener('message', reloadSession);

  const checkSession = async () => {
    $('session-message').textContent = '正在连接…';
    $('session-retry').hidden = true;
    try {
      const session = await api.session();
      const { user } = session;
      configureSession(session);
      $('session-state').hidden = true;
      if (user) {
        $('account-name').textContent = user.username;
        workspace.hidden = false;
        onSignIn();
      } else {
        authScreen.hidden = false;
      }
    } catch (error) {
      $('session-message').textContent = error.message;
      $('session-retry').hidden = false;
    }
  };

  for (const button of modeButtons) {
    button.addEventListener('click', () => {
      mode = button.dataset.authMode;
      const registering = mode === 'register';
      for (const tab of modeButtons) tab.setAttribute('aria-pressed', tab === button);
      $('auth-confirm-field').hidden = !registering;
      confirmation.disabled = !registering;
      confirmation.required = registering;
      confirmation.value = '';
      password.value = '';
      password.autocomplete = registering ? 'new-password' : 'current-password';
      submit.textContent = registering ? '注册' : '登录';
      showError($('auth-error'));
    });
  }

  $('auth-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled) return;

    const errorOutput = $('auth-error');
    showError(errorOutput);
    if (mode === 'register' && password.value !== confirmation.value) {
      showError(errorOutput, '两次输入的密码不一致。');
      confirmation.focus();
      return;
    }

    submit.disabled = true;
    for (const button of modeButtons) button.disabled = true;
    try {
      await api[mode]({ username: username.value.trim(), password: password.value });
      sessionChanged();
    } catch (error) {
      showError(errorOutput, error.message);
      submit.disabled = false;
      for (const button of modeButtons) button.disabled = false;
    }
  });

  $('session-retry').addEventListener('click', checkSession);
  $('logout').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    showError($('logout-error'));
    try {
      await api.logout();
      sessionChanged();
    } catch (error) {
      showError($('logout-error'), error.message);
      button.disabled = false;
    }
  });

  document.addEventListener('click', (event) => {
    if (accountMenu.open && !accountMenu.contains(event.target)) accountMenu.open = false;
  });
  accountMenu.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !accountMenu.open) return;
    accountMenu.open = false;
    accountMenu.querySelector('summary').focus();
  });

  window.addEventListener('addressbook:session-expired', () => {
    if (!workspace.hidden) reloadSession();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) reloadSession();
  });

  checkSession();
}
