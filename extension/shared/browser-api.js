/**
 * Shim mínimo cross-browser: Firefox expõe `browser.*` com Promises nativas;
 * Chrome/Edge expõem só `chrome.*`, historicamente baseado em callback. Em
 * vez de trazer a lib inteira do webextension-polyfill, envolvemos só as
 * três chamadas que esta extensão usa.
 */
const runtimeApi = typeof browser !== 'undefined' ? browser : chrome;

function storageGet(keys) {
  if (typeof browser !== 'undefined') {
    return browser.storage.sync.get(keys);
  }
  return new Promise((resolve) => chrome.storage.sync.get(keys, resolve));
}

function storageSet(items) {
  if (typeof browser !== 'undefined') {
    return browser.storage.sync.set(items);
  }
  return new Promise((resolve) => chrome.storage.sync.set(items, resolve));
}

function tabsCreate(createProperties) {
  if (typeof browser !== 'undefined') {
    return browser.tabs.create(createProperties);
  }
  return new Promise((resolve) => chrome.tabs.create(createProperties, resolve));
}
