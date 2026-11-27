document.addEventListener('DOMContentLoaded', () => {
  const login = document.getElementById('login-form');
  const register = document.getElementById('register-form');
  const message = document.getElementById('form-error');
  async function submit(url, body) {
    message.textContent = '';
    try {
      const result = await QueueSmart.request(url, { method: 'POST', body: JSON.stringify(body) });
      QueueSmart.saveSession(result);
    } catch (error) { message.textContent = error.message; }
  }
  if (login) login.addEventListener('submit', async event => {
    event.preventDefault();
    if (!login.reportValidity()) return;
    await submit('/api/auth/login', {
      email: document.getElementById('login-email').value,
      password: document.getElementById('login-password').value
    });
  });
  if (register) register.addEventListener('submit', async event => {
    event.preventDefault();
    if (!register.reportValidity()) return;
    await submit('/api/auth/register', {
      name: document.getElementById('register-name').value,
      email: document.getElementById('register-email').value,
      password: document.getElementById('register-password').value,
      role: 'user'
    });
  });
});
