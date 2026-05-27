let lastFocusedElement = null;

document.addEventListener('focusin', (e) => {
  const tagName = e.target.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || e.target.isContentEditable) {
    lastFocusedElement = e.target;
  }
});

function fillTarget(element, text) {
  if (!element) return false;

  try {
    element.focus();
    element.select();

    if (document.execCommand('insertText', false, text)) {
      return true;
    }

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;
    if (nativeSetter) {
      nativeSetter.call(element, text);
    } else {
      element.value = text;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));

    return true;
  } catch (e) {
    return false;
  }
}

function showCategoryPicker(selectionText) {
  chrome.runtime.sendMessage({ action: 'getCategories' }, (response) => {
    const categories = response.categories || [];
    const categoryColors = ['#4285f4', '#f9a825', '#34a853', '#9c27b0', '#ff5722', '#00bcd4'];

    const overlay = document.createElement('div');
    overlay.className = 'quickfill-category-picker';
    overlay.innerHTML = `
      <div class="picker-overlay"></div>
      <div class="picker-modal">
        <div class="picker-header">
          <h3>收藏到 QuickFill</h3>
          <button class="picker-close">✕</button>
        </div>
        <div class="picker-content">
          <div class="picker-preview">${escapeHtml(selectionText.slice(0, 100))}${selectionText.length > 100 ? '...' : ''}</div>
          <div class="picker-label">选择分类（可多选）</div>
          <div class="picker-categories">
            <span class="picker-category" data-name="">无分类</span>
            ${categories.map((cat, index) => {
              const color = categoryColors[index % categoryColors.length];
              return `<span class="picker-category" data-name="${cat.name}" style="--cat-color: ${color}; border-color: ${color};">${cat.name}</span>`;
            }).join('')}
          </div>
        </div>
        <div class="picker-footer">
          <button class="picker-cancel">取消</button>
          <button class="picker-confirm">确认收藏</button>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      .quickfill-category-picker {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .picker-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
      }
      .picker-modal {
        position: relative;
        background: white;
        border-radius: 12px;
        padding: 20px;
        width: 320px;
        max-width: 90vw;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      }
      .picker-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }
      .picker-header h3 {
        font-size: 16px;
        font-weight: 600;
        margin: 0;
        color: #333;
      }
      .picker-close {
        width: 28px;
        height: 28px;
        border: none;
        border-radius: 50%;
        background: #f5f5f5;
        cursor: pointer;
        font-size: 14px;
        color: #666;
      }
      .picker-close:hover {
        background: #e0e0e0;
      }
      .picker-preview {
        background: #f8f9fa;
        padding: 12px;
        border-radius: 8px;
        font-size: 13px;
        color: #666;
        margin-bottom: 12px;
        word-break: break-all;
        max-height: 60px;
        overflow-y: auto;
      }
      .picker-label {
        font-size: 12px;
        color: #666;
        margin-bottom: 8px;
      }
      .picker-categories {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 16px;
      }
      .picker-category {
        padding: 6px 12px;
        border: 2px solid #e0e0e0;
        border-radius: 20px;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s;
        background: white;
        color: #666;
      }
      .picker-category:hover {
        border-color: #667eea;
        color: #667eea;
      }
      .picker-category.selected {
        background: #667eea;
        border-color: #667eea;
        color: white;
      }
      .picker-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
      .picker-footer button {
        padding: 8px 16px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        cursor: pointer;
      }
      .picker-cancel {
        background: #f5f5f5;
        color: #666;
      }
      .picker-cancel:hover {
        background: #e0e0e0;
      }
      .picker-confirm {
        background: #667eea;
        color: white;
      }
      .picker-confirm:hover {
        background: #5a6fd6;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(overlay);

    const selectedCategories = [];

    overlay.querySelectorAll('.picker-category').forEach(cat => {
      cat.addEventListener('click', () => {
        cat.classList.toggle('selected');
        const name = cat.dataset.name;
        const index = selectedCategories.indexOf(name);
        if (index > -1) {
          selectedCategories.splice(index, 1);
        } else {
          selectedCategories.push(name);
        }
      });
    });

    const close = () => {
      overlay.remove();
      style.remove();
    };

    overlay.querySelector('.picker-close').addEventListener('click', close);
    overlay.querySelector('.picker-cancel').addEventListener('click', close);
    overlay.querySelector('.picker-overlay').addEventListener('click', close);

    overlay.querySelector('.picker-confirm').addEventListener('click', () => {
      const labels = selectedCategories.filter(n => n);
      chrome.runtime.sendMessage({
        action: 'saveCardFromSelection',
        text: selectionText,
        labels
      }, (response) => {
        if (response?.success) {
          close();
          showToast('已收藏到 QuickFill');
        } else {
          showToast('收藏失败');
        }
      });
    });
  });
}

function showToast(message) {
  const existingToast = document.querySelector('.quickfill-toast');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.className = 'quickfill-toast';
  toast.textContent = message;
  
  const toastStyle = document.createElement('style');
  toastStyle.textContent = `
    .quickfill-toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 999999;
      animation: slideUp 0.3s ease;
    }
    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateX(-50%) translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    }
  `;

  document.head.appendChild(toastStyle);
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
    toastStyle.remove();
  }, 2000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fillText') {
    const text = processVariables(request.text);

    let element = document.activeElement;
    if (element) {
      const tag = element.tagName.toLowerCase();
      if (tag !== 'input' && tag !== 'textarea' && !element.isContentEditable) {
        element = null;
      }
    }
    if (!element) {
      element = lastFocusedElement;
    }

    const success = fillTarget(element, text);
    sendResponse({ success });
  } else if (request.action === 'showCategoryPicker') {
    showCategoryPicker(request.text);
    sendResponse({ success: true });
  }
});

function processVariables(text) {
  const now = new Date();

  const date = now.toISOString().split('T')[0];
  const time = now.toTimeString().split(' ')[0];

  const phonePrefixes = ['13', '14', '15', '16', '17', '18', '19'];
  const prefix = phonePrefixes[Math.floor(Math.random() * phonePrefixes.length)];
  const randomPhone = prefix + Math.floor(Math.random() * 100000000).toString().padStart(9, '0');

  return text
    .replace(/\{\{date\}\}/g, date)
    .replace(/\{\{time\}\}/g, time)
    .replace(/\{\{random_phone\}\}/g, randomPhone);
}
