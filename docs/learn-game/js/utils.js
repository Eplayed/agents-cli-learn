// 通用工具函数

export function $(id) { return document.getElementById(id); }

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

let toastTimer = null;
export function toast(msg, kind = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = `toast ${kind}`; }, 1800);
}

export function typeLabel(t) {
  return { single: '单选', multi: '多选', fill: '填空', locate: '代码定位', order: '排序' }[t] || t;
}

// 比较答案（支持各种题型）
export function checkAnswer(q, sel) {
  if (q.type === 'single') return sel === q.answer;
  if (q.type === 'multi') {
    if (!(sel instanceof Set)) return false;
    if (sel.size !== q.answer.length) return false;
    return q.answer.every(v => sel.has(v));
  }
  if (q.type === 'fill' || q.type === 'locate') {
    if (!sel) return false;
    const norm = s => String(s).toLowerCase().trim().replace(/[\s\\\\/]+/g, '/').replace(/^\/+|\/+$/g, '');
    return q.answer.some(a => norm(sel) === norm(a));
  }
  if (q.type === 'order') {
    if (!Array.isArray(sel)) return false;
    if (sel.length !== q.answer.length) return false;
    return sel.every((v, i) => v === q.answer[i]);
  }
  return false;
}

// 把用户答案/正确答案格式化成可读字符串
export function formatAns(q, val, kind = 'user') {
  if (q.type === 'single') {
    const v = kind === 'user' ? val : q.answer;
    const opt = q.options.find(o => o.value === v);
    return opt ? `<code>${escapeHtml(opt.text)}</code>` : '<em>未选</em>';
  }
  if (q.type === 'multi') {
    const arr = kind === 'user'
      ? (val instanceof Set ? [...val] : [])
      : q.answer;
    if (arr.length === 0) return '<em>未选</em>';
    return arr.map(v => {
      const o = q.options.find(o => o.value === v);
      return o ? escapeHtml(o.text) : escapeHtml(v);
    }).join(' / ');
  }
  if (q.type === 'fill' || q.type === 'locate') {
    const v = kind === 'user' ? (val || '') : q.answer[0];
    return `<code>${escapeHtml(v)}</code>`;
  }
  if (q.type === 'order') {
    const arr = kind === 'user' ? (Array.isArray(val) ? val : []) : q.answer;
    if (arr.length === 0) return '<em>未排</em>';
    return arr.map(id => {
      const it = q.items.find(x => x.id === id);
      const text = it ? it.text : id;
      return escapeHtml(text.length > 30 ? text.slice(0, 30) + '…' : text);
    }).join(' → ');
  }
  return escapeHtml(String(val));
}
