chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "quickfill-save",
    title: "📥 收藏到 QuickFill",
    contexts: ["selection"]
  });

  chrome.storage.local.get(['cards', 'categories'], (result) => {
    const updates = {};
    if (!result.cards) updates.cards = [];
    if (!result.categories) updates.categories = [];
    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates);
    }
  });
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-sidepanel') {
    chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
  }
});

chrome.action.onClicked.addListener(() => {
  chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "quickfill-save" && info.selectionText && tab.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'showCategoryPicker', text: info.selectionText }, (response) => {
      if (chrome.runtime.lastError) {
        const newCard = {
          id: Date.now().toString(),
          content: info.selectionText,
          labels: [],
          pinned: false,
          order: 0,
          createdAt: Date.now()
        };
        chrome.storage.local.get('cards', (result) => {
          const cards = result.cards || [];
          cards.push(newCard);
          chrome.storage.local.set({ cards });
        });
      }
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'getCards':
      chrome.storage.local.get('cards', (result) => {
        sendResponse({ cards: result.cards || [] });
      });
      return true;
    case 'saveCard':
      chrome.storage.local.get('cards', (result) => {
        const cards = result.cards || [];
        cards.push(request.card);
        chrome.storage.local.set({ cards });
        sendResponse({ success: true });
      });
      return true;
    case 'updateCard':
      chrome.storage.local.get('cards', (result) => {
        const cards = result.cards || [];
        const index = cards.findIndex(c => c.id === request.card.id);
        if (index !== -1) {
          cards[index] = request.card;
          chrome.storage.local.set({ cards });
        }
        sendResponse({ success: true });
      });
      return true;
    case 'deleteCard':
      chrome.storage.local.get('cards', (result) => {
        const cards = result.cards || [];
        const filtered = cards.filter(c => c.id !== request.id);
        chrome.storage.local.set({ cards: filtered });
        sendResponse({ success: true });
      });
      return true;
    case 'exportData':
      chrome.storage.local.get(['cards', 'categories'], (result) => {
        sendResponse({ cards: result.cards || [], categories: result.categories || [] });
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
        sendResponse({ categories: result.categories || [] });
      });
      return true;
    case 'saveCategories':
      chrome.storage.local.set({ categories: request.categories });
      sendResponse({ success: true });
      return true;
    case 'saveCardFromSelection':
      const card = {
        id: Date.now().toString(),
        content: request.text,
        labels: request.labels || [],
        pinned: false,
        order: 0,
        createdAt: Date.now()
      };
      chrome.storage.local.get('cards', (result) => {
        const cards = result.cards || [];
        cards.push(card);
        chrome.storage.local.set({ cards });
        sendResponse({ success: true });
      });
      return true;
  }
});
