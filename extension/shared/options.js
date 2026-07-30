const input = document.getElementById('app-url');
const saveButton = document.getElementById('save');
const feedback = document.getElementById('feedback');

async function restore() {
  const { appUrl } = await storageGet('appUrl');
  if (appUrl) {
    input.value = appUrl;
  }
}

saveButton.addEventListener('click', async () => {
  const value = input.value.trim();
  try {
    // eslint-disable-next-line no-new -- só valida o formato, não usamos a instância
    new URL(value);
  } catch {
    feedback.textContent = 'URL inválida.';
    feedback.style.color = '#ba1a1a';
    return;
  }

  await storageSet({ appUrl: value });
  feedback.textContent = 'Salvo.';
  feedback.style.color = '';
});

restore();
