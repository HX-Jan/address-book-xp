const paths = {
  star: '<path d="m12 3.8 2.5 5.1 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8L12 3.8Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.8" cy="10.8" r="5.8"/><path d="m15 15 4.1 4.1"/>',
  edit: '<path d="m13.8 6.4 3.8 3.8M5 19l4.4-1 9.2-9.2a2.7 2.7 0 0 0-3.8-3.8L5.7 14.2 5 19Z"/>',
  trash: '<path d="M4.5 7h15m-12 0 .7 12h7.6l.7-12M9 7V4.5h6V7m-5 3.5v5m4-5v5"/>',
  upload: '<path d="M12 16V4m-4 4 4-4 4 4M5 14v5h14v-5"/>',
  download: '<path d="M12 4v12m-4-4 4 4 4-4M5 14v5h14v-5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  copy: '<rect x="8" y="8" width="11" height="11" rx="1.5"/><path d="M15 8V6.5A1.5 1.5 0 0 0 13.5 5h-7A1.5 1.5 0 0 0 5 6.5v7A1.5 1.5 0 0 0 6.5 15H8"/>',
  account: '<circle cx="12" cy="8" r="3.25"/><path d="M5.5 19v-1a4.25 4.25 0 0 1 4.25-4.25h4.5A4.25 4.25 0 0 1 18.5 18v1"/>',
  forward: '<path d="m9.5 6 6 6-6 6"/>',
};

export function icon(name) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
  return span;
}

export function mountIcons() {
  document.querySelectorAll('[data-icon]').forEach((element) => element.append(icon(element.dataset.icon)));
}
