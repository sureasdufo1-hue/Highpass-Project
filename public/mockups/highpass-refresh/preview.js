// Design-only preview: no API, credentials, storage, or clinical data.
const screens = [...document.querySelectorAll('.screen')];
const tabs = [...document.querySelectorAll('.preview-bar [data-view]')];
const frame = document.querySelector('#app-frame');
const dialog = document.querySelector('#preview-dialog');
document.querySelectorAll('[data-view]').forEach(button => {
  button.addEventListener('click', () => {
    const next = button.dataset.view;
    if (!screens.some(screen => screen.id === next)) return;
    screens.forEach(screen => { screen.hidden = screen.id !== next; });
    tabs.forEach(tab => {
      const selected = tab.dataset.view === next;
      tab.classList.toggle('selected', selected);
      tab.setAttribute('aria-pressed', String(selected));
    });
  });
});
document.querySelector('#mobile-toggle').addEventListener('click', event => {
  const enabled = frame.classList.toggle('mobile-preview');
  event.currentTarget.setAttribute('aria-pressed', String(enabled));
  event.currentTarget.textContent = enabled ? '데스크톱 보기' : '모바일 보기';
});
document.querySelectorAll('[data-preview]').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelector('#dialog-title').textContent = button.dataset.preview;
    dialog.showModal();
  });
});
document.querySelector('#dialog-close').addEventListener('click', () => dialog.close());
