// ASReview Keyword Highlighter - Content Script

const HIGHLIGHT_COLORS = [
  { bg: '#FFD700', text: '#1a1a1a' },
  { bg: '#FF6B6B', text: '#fff' },
  { bg: '#51CF66', text: '#1a1a1a' },
  { bg: '#339AF0', text: '#fff' },
  { bg: '#F06595', text: '#fff' },
  { bg: '#FF922B', text: '#fff' },
  { bg: '#845EF7', text: '#fff' },
  { bg: '#20C997', text: '#1a1a1a' },
  { bg: '#F59F00', text: '#1a1a1a' },
  { bg: '#74C0FC', text: '#1a1a1a' },
];

const MARKER_CLASS = 'kwhl-mark';

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function removeHighlights() {
  document.querySelectorAll('.' + MARKER_CLASS).forEach(mark => {
    const parent = mark.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize();
  });
}

function highlightInNode(node, keyword, color) {
  if (!keyword || !keyword.trim()) return;
  const regex = new RegExp('(' + escapeRegex(keyword.trim()) + ')', 'gi');

  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const parent = n.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'MARK'].includes(tag))
        return NodeFilter.FILTER_REJECT;
      if (parent.closest('.' + MARKER_CLASS))
        return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const nodesToProcess = [];
  let current;
  while ((current = walker.nextNode())) nodesToProcess.push(current);

  nodesToProcess.forEach(textNode => {
    if (!regex.test(textNode.nodeValue)) return;
    regex.lastIndex = 0;

    const frag = document.createDocumentFragment();
    let last = 0;
    let m;
    const text = textNode.nodeValue;

    while ((m = regex.exec(text)) !== null) {
      if (m.index > last) {
        frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      }
      const mark = document.createElement('mark');
      mark.className = MARKER_CLASS;
      mark.style.cssText = 'background:' + color.bg + ' !important;color:' + color.text + ' !important;border-radius:3px;padding:0 2px;font-style:inherit;';
      mark.textContent = m[0];
      frag.appendChild(mark);
      last = regex.lastIndex;
    }
    if (last < text.length) {
      frag.appendChild(document.createTextNode(text.slice(last)));
    }

    if (textNode.parentNode) {
      textNode.parentNode.replaceChild(frag, textNode);
    }
  });
}

let isHighlighting = false;

function applyHighlights(keywords) {
  if (isHighlighting) return;
  isHighlighting = true;

  // Pause observer while we modify the DOM to avoid re-triggering
  observer.disconnect();

  try {
    removeHighlights();
    if (keywords && keywords.length > 0) {
      keywords.forEach((kw, i) => {
        if (kw && kw.trim()) {
          highlightInNode(document.body, kw.trim(), HIGHLIGHT_COLORS[i % HIGHLIGHT_COLORS.length]);
        }
      });
    }
  } finally {
    isHighlighting = false;
    // Reconnect after our DOM changes have settled
    setTimeout(() => {
      observer.observe(document.body, { childList: true, subtree: true });
    }, 200);
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'APPLY_HIGHLIGHTS') {
    applyHighlights(msg.keywords);
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'REMOVE_HIGHLIGHTS') {
    observer.disconnect();
    removeHighlights();
    setTimeout(() => observer.observe(document.body, { childList: true, subtree: true }), 200);
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'PING') {
    sendResponse({ ok: true });
    return true;
  }
});

// On page load, apply saved keywords
chrome.storage.sync.get(['keywords', 'enabled'], (data) => {
  if (data.enabled !== false && data.keywords && data.keywords.length > 0) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => applyHighlights(data.keywords));
    } else {
      applyHighlights(data.keywords);
    }
  }
});

// MutationObserver: re-highlight when ASReview loads a new abstract
let debounceTimer = null;

const observer = new MutationObserver((mutations) => {
  if (isHighlighting) return;

  // Only react if real (non-mark) nodes were added
  const hasRealMutation = mutations.some(m =>
    Array.from(m.addedNodes).some(n =>
      n.nodeType === 1 && !(n.classList && n.classList.contains(MARKER_CLASS))
    )
  );
  if (!hasRealMutation) return;

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    chrome.storage.sync.get(['keywords', 'enabled'], (data) => {
      if (data.enabled !== false && data.keywords && data.keywords.length > 0) {
        applyHighlights(data.keywords);
      }
    });
  }, 600);
});

observer.observe(document.body, { childList: true, subtree: true });
