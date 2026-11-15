(() => {
  const widget = document.getElementById('chat-widget');
  const toggle = document.getElementById('chat-toggle');
  const panel = document.getElementById('chat-panel');
  const input = document.getElementById('chat-input');
  const send = document.getElementById('chat-send');
  const messages = document.getElementById('chat-messages');

  function setOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) input.focus({preventScroll: true});
    else toggle.focus({preventScroll: true});
  }

  toggle.addEventListener('click', () => setOpen(panel.hidden));
  document.getElementById('chat-close').addEventListener('click', () => setOpen(false));
  widget.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  });
  input.addEventListener('input', () => { send.disabled = !input.value.trim(); });
  document.getElementById('chat-form').addEventListener('submit', event => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const message = document.createElement('p');
    message.className = 'chat-message chat-message-user';
    message.textContent = text;
    messages.append(message);
    input.value = '';
    send.disabled = true;
    messages.scrollTop = messages.scrollHeight;
    input.focus({preventScroll: true});
  });
  // Keep the global widget available when the map enters native fullscreen.
  document.addEventListener('fullscreenchange', () => {
    (document.fullscreenElement || document.body).append(widget);
  });
})();
