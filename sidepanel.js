let cards = [];
let categories = [];
let searchQuery = '';
let currentCategory = 'all';
let isManaging = false;

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}

function sendMessage(action, data) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action, ...data }, resolve);
  });
}

async function loadCards() {
  const response = await sendMessage('getCards');
  cards = response.cards || [];
  renderCards();
}

async function loadAd() {
  const adContainer = document.getElementById('ad-container');
  if (!adContainer) return;

  try {
    const { createManagedRefreshableAd } = await import('@playanext/playa-yield-sdk');
    
    await createManagedRefreshableAd({
      container: '#ad-container',
      placement: 'sidepanel',
      size: { width: 320, height: 50 }
    });
    
    adContainer.style.display = 'block';
  } catch (err) {
    console.error('[QuickFill] PlayaYield SDK 加载失败:', err.message);
    adContainer.innerHTML = `
      <div style="padding: 8px 12px; display: flex; align-items: center; justify-content: center; gap: 8px;">
        <span style="color: #666; font-size: 12px;">📢</span>
        <a href="#" style="color: #667eea; font-size: 12px; text-decoration: none;" onclick="event.preventDefault();">
          支持 QuickFill → 解锁更多功能
        </a>
      </div>
    `;
    adContainer.style.display = 'block';
  }
}

async function loadCategories() {
  const response = await sendMessage('getCategories');
  categories = response.categories || [];
  renderCategoryTabs();
}

function renderCategoryTabs() {
  const container = document.querySelector('.category-tabs');
  
  const categoryColors = ['#4285f4', '#f9a825', '#34a853', '#9c27b0', '#ff5722', '#00bcd4'];
  
  let html = `
    <button class="category-tab ${currentCategory === 'all' ? 'active' : ''}" data-category="all">全部</button>
    <button class="category-tab ${currentCategory === 'uncategorized' ? 'active' : ''}" data-category="uncategorized">未分类</button>
  `;
  
  categories.forEach((cat, index) => {
    const color = categoryColors[index % categoryColors.length];
    const isActive = currentCategory === cat.name;
    html += `
      <button class="category-tab ${isActive ? 'active' : ''} has-color" data-category="${cat.name}" style="--cat-color: ${color};">
        <span class="cat-dot" style="background: ${color};"></span>
        ${cat.name}${isManaging ? `<span class="delete-cat" data-delete="${cat.name}">×</span>` : ''}
      </button>
    `;
  });
  
  html += `
    <button class="category-tab add-btn" id="add-category-btn" title="添加分类">+</button>
    <button class="category-tab manage-btn ${isManaging ? 'active' : ''}" id="manage-category-btn" title="${isManaging ? '完成管理' : '管理分类'}">
      ${isManaging ? '✓' : '⚙️'}
    </button>
  `;
  
  container.innerHTML = html;
  
  document.querySelectorAll('.category-tab[data-category]').forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target.classList.contains('delete-cat')) {
        const catName = e.target.dataset.delete;
        deleteCategory(catName);
      } else {
        if (!isManaging) {
          currentCategory = tab.dataset.category;
          renderCards();
        }
      }
    });
  });
  
  document.getElementById('add-category-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    showAddCategoryModal();
  });
  
  document.getElementById('manage-category-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    isManaging = !isManaging;
    renderCategoryTabs();
    showToast(isManaging ? '进入管理模式，点击分类旁的×删除' : '退出管理模式');
  });
}

async function deleteCategory(name) {
  if (name === 'all' || name === 'uncategorized') {
    showToast('无法删除默认分类');
    return;
  }
  
  if (!confirm(`确定删除分类"${name}"？该分类下的卡片将移除此分类标签。`)) return;
  
  categories = categories.filter(c => c.name !== name);
  
  const updatedCards = cards.map(card => {
    if (Array.isArray(card.labels)) {
      return { ...card, labels: card.labels.filter(l => l !== name) };
    } else if (card.label === name) {
      const newCard = { ...card };
      delete newCard.label;
      newCard.labels = [];
      return newCard;
    }
    return card;
  });
  
  await sendMessage('importData', { cards: updatedCards, categories });
  
  if (currentCategory === name) {
    currentCategory = 'all';
  }
  
  renderCategoryTabs();
  await loadCards();
  showToast('已删除分类');
}

function showAddCategoryModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2>添加分类</h2>
        <button class="close-btn">✕</button>
      </div>
      <div class="modal-body">
        <input type="text" id="category-name" placeholder="输入分类名称..." maxlength="10">
      </div>
      <div class="modal-footer left">
        <button class="cancel">取消</button>
        <button class="confirm">添加</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('show'), 10);

  const closeModal = () => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 300);
  };

  overlay.querySelector('.close-btn').addEventListener('click', closeModal);
  overlay.querySelector('.cancel').addEventListener('click', closeModal);

  overlay.querySelector('.confirm').addEventListener('click', async () => {
    const name = document.getElementById('category-name').value.trim();
    
    if (!name) {
      showToast('请输入分类名称');
      return;
    }
    
    if (categories.some(c => c.name === name)) {
      showToast('该分类已存在');
      return;
    }
    
    categories.push({ name });
    await sendMessage('saveCategories', { categories });
    renderCategoryTabs();
    closeModal();
    showToast('已添加分类');
  });
}

function renderCards() {
  const container = document.getElementById('card-list');
  const filtered = cards.filter(card => {
    const labels = Array.isArray(card.labels) ? card.labels : (card.label ? [card.label] : []);
    
    let categoryMatch = true;
    if (currentCategory === 'uncategorized') {
      categoryMatch = labels.length === 0;
    } else if (currentCategory !== 'all') {
      categoryMatch = labels.includes(currentCategory);
    }
    
    let searchMatch = true;
    if (searchQuery) {
      searchMatch = card.content.toLowerCase().includes(searchQuery.toLowerCase());
    }
    
    return categoryMatch && searchMatch;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return (a.order || 0) - (b.order || 0);
  });

  if (sorted.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>暂无卡片</p>
        <p>右键网页文本可快速收藏</p>
      </div>
    `;
    return;
  }

  container.innerHTML = sorted.map(card => {
    const labels = Array.isArray(card.labels) ? card.labels : (card.label ? [card.label] : []);
    const labelHtml = labels.map(label => `
      <span class="card-label ${getLabelClass(label)}" style="background-color: ${getCategoryColor(label)}">${label}</span>
    `).join('');
    
    return `
      <div class="card ${card.pinned ? 'pinned' : ''}" data-id="${card.id}" draggable="true">
        <div class="card-labels">${labelHtml}</div>
        <div class="card-content">${escapeHtml(card.content)}</div>
        <div class="card-actions">
          <button class="pin-btn" title="${card.pinned ? '取消置顶' : '置顶'}">${card.pinned ? '📌' : ''}</button>
          <button class="edit-btn" title="编辑">✏️</button>
          <button class="delete-btn" title="删除">🗑️</button>
        </div>
      </div>
    `;
  }).join('');

  attachCardEvents();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getLabelClass(label) {
  const classes = { '工作': 'work', '测试': 'test', '个人': 'personal' };
  return classes[label] || 'other';
}

function getCategoryColor(categoryName) {
  const index = categories.findIndex(c => c.name === categoryName);
  const colors = ['#4285f4', '#f9a825', '#34a853', '#9c27b0', '#ff5722', '#00bcd4'];
  return colors[index % colors.length];
}

async function fillCard(cardData) {
  if (!cardData) return;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const response = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { action: 'fillText', text: cardData.content }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response || { success: false });
        }
      });
    });

    if (response?.success) {
      showToast('已填充到输入框');
    } else {
      throw new Error('Content script not available');
    }
  } catch (err) {
    navigator.clipboard.writeText(cardData.content.slice(0, 10000)).then(() => {
      showToast('已写入剪贴板，请 Ctrl+V');
    }).catch(() => {
      showToast('填充失败，请手动复制');
    });
  }
}

function attachCardEvents() {
  document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      e.preventDefault();
      e.stopPropagation();
      const id = card.dataset.id;
      const cardData = cards.find(c => c.id === id);
      fillCard(cardData);
    });

    card.querySelector('.pin-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = card.dataset.id;
      const cardData = cards.find(c => c.id === id);
      if (cardData) {
        cardData.pinned = !cardData.pinned;
        await sendMessage('updateCard', { card: cardData });
        await loadCards();
      }
    });

    card.querySelector('.edit-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = card.dataset.id;
      const cardData = cards.find(c => c.id === id);
      if (cardData) {
        showEditModal(cardData);
      }
    });

    card.querySelector('.delete-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = card.dataset.id;
      if (confirm('确定删除此卡片？')) {
        await sendMessage('deleteCard', { id });
        await loadCards();
        showToast('已删除');
      }
    });
  });
}

function showAddModal() {
  showEditModal(null);
}

function showEditModal(card = null) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const cardLabels = Array.isArray(card?.labels) ? card.labels : (card?.label ? [card.label] : []);
  
  const categoryColors = ['#4285f4', '#f9a825', '#34a853', '#9c27b0', '#ff5722', '#00bcd4'];
  
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2>${card ? '编辑卡片' : '添加卡片'}</h2>
        <button class="close-btn">✕</button>
      </div>
      <div class="modal-body">
        <textarea id="modal-content" placeholder="输入文本内容...">${card?.content || ''}</textarea>
        <div class="category-selector">
          <div class="category-selector-label">选择分类（可多选）</div>
          <div class="category-tags">
            ${categories.map((cat, index) => {
              const color = categoryColors[index % categoryColors.length];
              const isSelected = cardLabels.includes(cat.name);
              return `<span class="category-tag ${isSelected ? 'selected' : ''}" data-name="${cat.name}" style="background-color: ${isSelected ? color : '#f0f0f0'}; color: ${isSelected ? 'white' : '#333'};">${cat.name}</span>`;
            }).join('')}
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="cancel">取消</button>
        <button class="confirm">${card ? '保存' : '添加'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('show'), 10);

  overlay.querySelectorAll('.category-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      tag.classList.toggle('selected');
      const color = tag.style.backgroundColor;
      if (tag.classList.contains('selected')) {
        const index = categories.findIndex(c => c.name === tag.dataset.name);
        const catColor = categoryColors[index % categoryColors.length];
        tag.style.backgroundColor = catColor;
        tag.style.color = 'white';
      } else {
        tag.style.backgroundColor = '#f0f0f0';
        tag.style.color = '#333';
      }
    });
  });

  overlay.querySelector('.close-btn').addEventListener('click', () => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 300);
  });

  overlay.querySelector('.cancel').addEventListener('click', () => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 300);
  });

  overlay.querySelector('.confirm').addEventListener('click', async () => {
    const content = document.getElementById('modal-content').value.trim().slice(0, 10000);
    const selectedLabels = Array.from(overlay.querySelectorAll('.category-tag.selected')).map(tag => tag.dataset.name);
    
    if (!content) {
      showToast('请输入内容');
      return;
    }

    if (card) {
      card.content = content;
      card.labels = selectedLabels;
      delete card.label;
      await sendMessage('updateCard', { card });
    } else {
      const newCard = {
        id: Date.now().toString(),
        content,
        labels: selectedLabels,
        pinned: false,
        order: cards.length,
        createdAt: Date.now()
      };
      await sendMessage('saveCard', { card: newCard });
    }

    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 300);
    await loadCards();
    showToast(card ? '已更新' : '已添加');
  });
}

async function exportData() {
  const response = await sendMessage('exportData');
  const data = {
    version: 1,
    exportTime: new Date().toISOString(),
    cards: response.cards || [],
    categories: response.categories || []
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `quickfill-backup-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('已导出');
}

function showImportModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2>导入数据</h2>
        <button class="close-btn">✕</button>
      </div>
      <div class="modal-body">
        <input type="file" id="import-file" accept=".json" style="width: 100%; padding: 8px;">
        <div style="margin-top: 12px;">
          <label>
            <input type="radio" name="import-mode" value="replace" checked> 覆盖导入
          </label>
          <label style="margin-left: 12px;">
            <input type="radio" name="import-mode" value="merge"> 追加合并
          </label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="cancel">取消</button>
        <button class="confirm">导入</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('show'), 10);

  overlay.querySelector('.close-btn').addEventListener('click', () => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 300);
  });

  overlay.querySelector('.cancel').addEventListener('click', () => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 300);
  });

  overlay.querySelector('.confirm').addEventListener('click', async () => {
    const fileInput = document.getElementById('import-file');
    const file = fileInput.files[0];
    const mode = document.querySelector('input[name="import-mode"]:checked').value;

    if (!file) {
      showToast('请选择文件');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        
        let importedCards = imported.cards || imported;
        
        if (!Array.isArray(importedCards)) {
          showToast('无效的文件格式');
          return;
        }

        if (mode === 'replace') {
          await sendMessage('importData', { cards: importedCards });
          if (imported.categories) {
            await sendMessage('saveCategories', { categories: imported.categories });
          }
        } else {
          const response = await sendMessage('getCards');
          const existingCards = response.cards || [];
          const merged = [...existingCards, ...importedCards];
          await sendMessage('importData', { cards: merged });
          
          if (imported.categories) {
            const catResponse = await sendMessage('getCategories');
            const existingCats = catResponse.categories || [];
            const mergedCats = [...existingCats, ...imported.categories.filter(ic => !existingCats.some(ec => ec.name === ic.name))];
            await sendMessage('saveCategories', { categories: mergedCats });
          }
        }

        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 300);
        await loadCards();
        await loadCategories();
        showToast('导入成功');
      } catch (err) {
        showToast('文件解析失败');
      }
    };
    reader.readAsText(file);
  });
}

document.getElementById('search-input').addEventListener('input', (e) => {
  searchQuery = e.target.value;
  renderCards();
});

document.getElementById('add-btn').addEventListener('click', showAddModal);
document.getElementById('add-btn-top').addEventListener('click', showAddModal);
document.getElementById('export-btn').addEventListener('click', exportData);
document.getElementById('import-btn').addEventListener('click', showImportModal);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    if (changes.cards) {
      loadCards();
    }
    if (changes.categories) {
      loadCategories();
    }
  }
});

loadCards();
loadCategories();
setTimeout(() => loadAd(), 2000);

document.getElementById('card-list').addEventListener('dragstart', (e) => {
  if (e.target.classList.contains('card')) {
    e.dataTransfer.setData('text/plain', e.target.dataset.id);
  }
});

document.getElementById('card-list').addEventListener('dragover', (e) => {
  e.preventDefault();
});

document.getElementById('card-list').addEventListener('drop', async (e) => {
  e.preventDefault();
  const draggedId = e.dataTransfer.getData('text/plain');
  const dropTarget = e.target.closest('.card');
  
  if (!draggedId || !dropTarget || draggedId === dropTarget.dataset.id) return;

  const draggedIndex = cards.findIndex(c => c.id === draggedId);
  const targetIndex = cards.findIndex(c => c.id === dropTarget.dataset.id);

  if (draggedIndex !== -1 && targetIndex !== -1) {
    const [draggedCard] = cards.splice(draggedIndex, 1);
    cards.splice(targetIndex, 0, draggedCard);
    
    cards.forEach((card, index) => {
      card.order = index;
    });

    await sendMessage('importData', { cards });
    await loadCards();
    showToast('已重新排序');
  }
});