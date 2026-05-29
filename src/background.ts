import { initializePlayaYield } from '@playanext/playa-yield-sdk';

interface Card {
  id: string;
  content: string;
  labels: string[];
  pinned: boolean;
  order: number;
  createdAt: number;
}

interface Category {
  id: string;
  name: string;
  color: string;
}

const LANG_DATA: Record<string, Record<string, string>> = {
  'zh_CN': { contextMenuSave: '📥 收藏到 QuickFill' },
  'en': { contextMenuSave: '📥 Save to QuickFill' },
  'ja': { contextMenuSave: '📥 QuickFillに保存' },
  'ko': { contextMenuSave: '📥 QuickFill에 저장' }
};

initializePlayaYield({
  //apiKey: 'pk_test_4b77f8f8c7674f4abe63b9637ab41192',
  apiKey: 'pk_live_e4f6217102f342109c05c547b4004dc6',
  debug: false
});

chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    console.log('[QuickFill] keepAlive');
  }
});

function getContextMenuTitle(callback: (title: string) => void): void {
  chrome.storage.local.get('quickfill_language', (result) => {
    const storedLang = result.quickfill_language;
    const lang = storedLang ? String(storedLang) : chrome.i18n.getMessage('@@ui_locale') || 'zh_CN';
    const title = LANG_DATA[lang]?.contextMenuSave || '📥 收藏到 QuickFill';
    callback(title);
  });
}

function updateContextMenu(): void {
  getContextMenuTitle((title) => {
    chrome.contextMenus.update('quickfill-save', { title });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  getContextMenuTitle((title) => {
    chrome.contextMenus.create({
      id: "quickfill-save",
      title: title,
      contexts: ["selection"]
    });
  });

  chrome.storage.local.get(['cards', 'categories'], (result) => {
    const updates: Record<string, unknown> = {};
    if (!result.cards) updates.cards = [];
    if (!result.categories) updates.categories = [];
    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates);
    }
  });
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.quickfill_language) {
    updateContextMenu();
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-sidepanel') {
    chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
  } else if (command === 'fill-last-input') {
    chrome.storage.session.get('lastFilledText', (result) => {
      if (result.lastFilledText) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'fillText', text: result.lastFilledText });
          }
        });
      }
    });
  } else if (command === 'save-selection') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) return;
      chrome.tabs.sendMessage(tabId, { action: 'getSelection' }, (response) => {
        if (chrome.runtime.lastError || !response?.text) return;
        chrome.tabs.sendMessage(tabId, { action: 'showCategoryPicker', text: response.text });
      });
    });
  }
});

chrome.action.onClicked.addListener(() => {
  chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab) return;
  if (info.menuItemId === "quickfill-save" && info.selectionText && tab.id) {
    const tabId = tab.id;
    chrome.tabs.sendMessage(tabId, { action: 'showCategoryPicker', text: info.selectionText }, (response) => {
      if (chrome.runtime.lastError) {
        const newCard: Card = {
          id: Date.now().toString(),
          content: info.selectionText as string,
          labels: [],
          pinned: false,
          order: 0,
          createdAt: Date.now()
        };
        chrome.storage.local.get('cards', (result) => {
          const cards = (result.cards as Card[]) || [];
          cards.push(newCard);
          chrome.storage.local.set({ cards });
        });
      }
    });
  }
});

chrome.runtime.onMessage.addListener((request: { action: string; [key: string]: unknown }, sender, sendResponse) => {
  switch (request.action) {
    case 'getCards':
      chrome.storage.local.get('cards', (result) => {
        sendResponse({ cards: (result.cards as Card[]) || [] });
      });
      return true;
    case 'saveCard':
      chrome.storage.local.get('cards', (result) => {
        const cards = ((result.cards as Card[]) || []).filter(Boolean);
        cards.push(request.card as Card);
        chrome.storage.local.set({ cards });
        sendResponse({ success: true });
      });
      return true;
    case 'updateCard':
      chrome.storage.local.get('cards', (result) => {
        const cards = ((result.cards as Card[]) || []).filter(Boolean);
        const index = cards.findIndex(c => c.id === (request.card as Card).id);
        if (index !== -1) {
          cards[index] = request.card as Card;
          chrome.storage.local.set({ cards });
        }
        sendResponse({ success: true });
      });
      return true;
    case 'deleteCard':
      chrome.storage.local.get('cards', (result) => {
        const cards = ((result.cards as Card[]) || []).filter(Boolean);
        const filtered = cards.filter(c => c.id !== request.id);
        chrome.storage.local.set({ cards: filtered });
        sendResponse({ success: true });
      });
      return true;
    case 'saveCards':
      chrome.storage.local.set({ cards: request.cards });
      sendResponse({ success: true });
      return true;
    case 'exportData':
      chrome.storage.local.get(['cards', 'categories'], (result) => {
        sendResponse({ cards: (result.cards as Card[]) || [], categories: (result.categories as Category[]) || [] });
      });
      return true;
    case 'importData':
      chrome.storage.local.set({
        cards: request.cards,
        ...(request.categories ? { categories: request.categories } : {})
      });
      sendResponse({ success: true });
      return true;
    case 'getCategories':
      chrome.storage.local.get('categories', (result) => {
        sendResponse({ categories: (result.categories as Category[]) || [] });
      });
      return true;
    case 'saveCategories':
      chrome.storage.local.set({ categories: request.categories });
      sendResponse({ success: true });
      return true;
    case 'saveCardFromSelection':
      const card: Card = {
        id: Date.now().toString(),
        content: request.text as string,
        labels: (request.labels as string[]) || [],
        pinned: false,
        order: 0,
        createdAt: Date.now()
      };
      chrome.storage.local.get('cards', (result) => {
        const cards = (result.cards as Card[]) || [];
        cards.push(card);
        chrome.storage.local.set({ cards });
        sendResponse({ success: true });
      });
      return true;
  }
});