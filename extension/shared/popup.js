const statusEl = document.getElementById('status');
const openAppButton = document.getElementById('open-app');
const openOptionsButton = document.getElementById('open-options');

async function loadConfiguredUrl() {
  const { appUrl } = await storageGet('appUrl');
  if (appUrl) {
    statusEl.textContent = appUrl;
    openAppButton.disabled = false;
  } else {
    statusEl.textContent = 'Configure a URL do Volante+ nas opções antes de usar.';
    openAppButton.disabled = true;
  }
  return appUrl;
}

openAppButton.addEventListener('click', async () => {
  const { appUrl } = await storageGet('appUrl');
  if (appUrl) {
    tabsCreate({ url: appUrl });
  }
});

openOptionsButton.addEventListener('click', () => {
  if (runtimeApi.runtime.openOptionsPage) {
    runtimeApi.runtime.openOptionsPage();
  } else {
    tabsCreate({ url: runtimeApi.runtime.getURL('options.html') });
  }
});

loadConfiguredUrl();
