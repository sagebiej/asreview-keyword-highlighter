const COLORS = [
  '#FFD700','#FF6B6B','#51CF66','#339AF0','#F06595',
  '#FF922B','#845EF7','#20C997','#F59F00','#74C0FC'
];

const list = document.getElementById('keywordsList');
const addBtn = document.getElementById('addBtn');
const applyBtn = document.getElementById('applyBtn');
const clearBtn = document.getElementById('clearBtn');
const toggle = document.getElementById('enableToggle');
const status = document.getElementById('status');

let keywords = [''];
let enabled = true;

function renderRows() {
  list.innerHTML = '';
  keywords.forEach((kw, i) => {
    const row = document.createElement('div');
    row.className = 'keyword-row';

    const dot = document.createElement('div');
    dot.className = 'color-dot';
    dot.style.background = COLORS[i % COLORS.length];

    const input = document.createElement('input');
    input.className = 'keyword-input';
    input.type = 'text';
    input.value = kw;
    input.placeholder = 'Keyword ' + (i + 1);
    input.addEventListener('input', e => { keywords[i] = e.target.value; });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doApply(); });

    const del = document.createElement('button');
    del.className = 'del-btn';
    del.textContent = '\u00d7';
    del.title = 'Remove';
    del.addEventListener('click', () => {
      keywords.splice(i, 1);
      if (keywords.length === 0) keywords = [''];
      renderRows();
    });

    row.appendChild(dot);
    row.appendChild(input);
    row.appendChild(del);
    list.appendChild(row);
  });
}

function showStatus(msg, isOk) {
  if (isOk === undefined) isOk = true;
  status.textContent = msg;
  status.className = 'status ' + (isOk ? 'ok' : '');
  setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 2500);
}

// Inject content script if needed, then send message
function sendToTab(tab, msg, onDone) {
  chrome.tabs.sendMessage(tab.id, { type: 'PING' }, (pingResp) => {
    const err = chrome.runtime.lastError;
    if (err || !pingResp) {
      // Content script not present — inject it first
      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, files: ['content.js'] },
        () => {
          const injErr = chrome.runtime.lastError;
          if (injErr) {
            showStatus('Cannot access this tab', false);
            return;
          }
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, msg, () => {
              chrome.runtime.lastError; // suppress error
              if (onDone) onDone();
            });
          }, 200);
        }
      );
    } else {
      chrome.tabs.sendMessage(tab.id, msg, () => {
        chrome.runtime.lastError; // suppress error
        if (onDone) onDone();
      });
    }
  });
}

function doApply() {
  const active = keywords.filter(k => k && k.trim());
  chrome.storage.sync.set({ keywords: active, enabled: enabled });
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]) return;
    const msg = enabled
      ? { type: 'APPLY_HIGHLIGHTS', keywords: active }
      : { type: 'REMOVE_HIGHLIGHTS' };
    sendToTab(tabs[0], msg, () => {
      if (enabled) {
        showStatus('\u2713 ' + active.length + ' keyword' + (active.length !== 1 ? 's' : '') + ' highlighted');
      } else {
        showStatus('\u2713 Highlights removed');
      }
    });
  });
}

addBtn.addEventListener('click', () => {
  if (keywords.length >= 10) { showStatus('Max 10 keywords', false); return; }
  keywords.push('');
  renderRows();
  setTimeout(() => {
    const inputs = list.querySelectorAll('.keyword-input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }, 50);
});

clearBtn.addEventListener('click', () => {
  keywords = [''];
  chrome.storage.sync.set({ keywords: [], enabled: enabled });
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs[0]) {
      sendToTab(tabs[0], { type: 'REMOVE_HIGHLIGHTS' }, null);
    }
  });
  renderRows();
  showStatus('Cleared');
});

applyBtn.addEventListener('click', doApply);

toggle.addEventListener('change', () => {
  enabled = toggle.checked;
  doApply();
});

// Load saved state
chrome.storage.sync.get(['keywords', 'enabled'], data => {
  if (data.keywords && data.keywords.length > 0) {
    keywords = data.keywords;
  }
  if (data.enabled !== undefined) {
    enabled = data.enabled;
    toggle.checked = enabled;
  }
  renderRows();
});
