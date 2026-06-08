// 单题渲染 + 判分核心（mini-quiz 和 final-quiz 共用）
import { shuffle, typeLabel, checkAnswer, formatAns, escapeHtml } from '../../utils.js';

let userSelection = null;

export function renderQuestionInputHTML(q) {
  if (q.type === 'single' || q.type === 'multi') {
    // 打乱选项顺序（每次渲染都随机）
    const shuffledOptions = shuffle([...q.options]);
    return `<div class="options">${shuffledOptions.map((opt, i) => `
      <div class="option" data-value="${escapeHtml(opt.value)}">
        <div class="opt-mark">${String.fromCharCode(65 + i)}</div>
        <div>${opt.text}</div>
      </div>
    `).join('')}</div>`;
  }
  if (q.type === 'fill' || q.type === 'locate') {
    return `<input type="text" class="fill-input" id="fillInput" placeholder="输入答案后回车或点提交…" autocomplete="off" spellcheck="false" />`;
  }
  if (q.type === 'order') {
    const shuffled = shuffle(q.items);
    return `<div class="order-list" id="orderList">
      ${shuffled.map(it => `
        <div class="order-item" draggable="true" data-id="${escapeHtml(it.id)}">
          <span class="order-handle">⋮⋮</span>
          <div>${it.text}</div>
        </div>
      `).join('')}
    </div>`;
  }
  return '';
}

export function buildQuestionCardHTML(q, opts = {}) {
  const tagsRow = `
    <div class="q-tags-row">
      <span class="q-tag type-${q.type}">${typeLabel(q.type)}</span>
      ${q.knowledgeTag ? `<span class="q-tag knowledge">📚 ${escapeHtml(q.knowledgeTag)}</span>` : ''}
    </div>
  `;
  return `
    <div class="question-card" data-qid="${q.id}">
      ${tagsRow}
      <p class="q-text">${q.text}</p>
      ${q.hint ? `<div class="q-hint">${q.hint}</div>` : ''}
      ${renderQuestionInputHTML(q)}
      <div class="feedback" data-feedback></div>
      <div class="actions">
        <button class="btn-primary" data-act="submit" disabled>${opts.submitLabel || '提交'}</button>
      </div>
    </div>
  `;
}

// 给单个 card 元素绑定交互。onComplete 在用户答完并查看反馈后触发
export function bindQuestionCard(cardEl, q, callbacks) {
  userSelection = null;
  const submitBtn = cardEl.querySelector('[data-act="submit"]');
  const fb = cardEl.querySelector('[data-feedback]');

  if (q.type === 'single') {
    cardEl.querySelectorAll('.option').forEach(el => {
      el.onclick = () => {
        if (el.classList.contains('disabled')) return;
        cardEl.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
        el.classList.add('selected');
        userSelection = el.dataset.value;
        submitBtn.disabled = false;
      };
    });
  } else if (q.type === 'multi') {
    userSelection = new Set();
    cardEl.querySelectorAll('.option').forEach(el => {
      el.onclick = () => {
        if (el.classList.contains('disabled')) return;
        const v = el.dataset.value;
        if (userSelection.has(v)) { userSelection.delete(v); el.classList.remove('selected'); }
        else { userSelection.add(v); el.classList.add('selected'); }
        submitBtn.disabled = userSelection.size === 0;
      };
    });
  } else if (q.type === 'fill' || q.type === 'locate') {
    const input = cardEl.querySelector('#fillInput, .fill-input');
    input.focus();
    input.oninput = () => {
      userSelection = input.value.trim();
      submitBtn.disabled = userSelection.length === 0;
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter' && !submitBtn.disabled) submitBtn.click();
    };
  } else if (q.type === 'order') {
    const list = cardEl.querySelector('.order-list');
    userSelection = Array.from(list.querySelectorAll('.order-item')).map(el => el.dataset.id);
    submitBtn.disabled = false;
    setupDragOrder(list, () => {
      userSelection = Array.from(list.querySelectorAll('.order-item')).map(el => el.dataset.id);
    });
  }

  submitBtn.onclick = () => {
    const correct = checkAnswer(q, userSelection);
    markCardResult(cardEl, q, userSelection, correct, fb);
    callbacks.onAnswered({
      correct,
      userSelection,
      formattedUser: formatAns(q, userSelection, 'user'),
      formattedCorrect: formatAns(q, null, 'correct'),
    });

    submitBtn.textContent = '继续 →';
    submitBtn.onclick = () => callbacks.onContinue();
  };
}

function setupDragOrder(list, onChange) {
  let dragged = null;
  list.querySelectorAll('.order-item').forEach(item => {
    item.addEventListener('dragstart', () => {
      dragged = item;
      item.classList.add('dragging');
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      onChange();
    });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      const after = getDragAfter(list, e.clientY);
      if (!after) list.appendChild(dragged);
      else list.insertBefore(dragged, after);
    });
  });
}

function getDragAfter(container, y) {
  const items = [...container.querySelectorAll('.order-item:not(.dragging)')];
  return items.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, el: child };
    return closest;
  }, { offset: -Infinity }).el;
}

function markCardResult(cardEl, q, sel, correct, fb) {
  if (q.type === 'single') {
    cardEl.querySelectorAll('.option').forEach(el => {
      el.classList.add('disabled');
      if (el.dataset.value === q.answer) el.classList.add('correct');
      else if (el.dataset.value === sel) el.classList.add('incorrect');
    });
  } else if (q.type === 'multi') {
    cardEl.querySelectorAll('.option').forEach(el => {
      el.classList.add('disabled');
      const v = el.dataset.value;
      const inAns = q.answer.includes(v);
      const inSel = sel instanceof Set && sel.has(v);
      if (inAns) el.classList.add('correct');
      else if (inSel) el.classList.add('incorrect');
    });
  } else if (q.type === 'order') {
    const list = cardEl.querySelector('.order-list');
    list.querySelectorAll('.order-item').forEach((el, i) => {
      el.draggable = false;
      el.style.cursor = 'default';
      if (el.dataset.id === q.answer[i]) el.classList.add('correct');
      else el.classList.add('incorrect');
    });
  } else if (q.type === 'fill' || q.type === 'locate') {
    const input = cardEl.querySelector('.fill-input');
    input.disabled = true;
    input.classList.add(correct ? 'correct' : 'incorrect');
  }

  const userDisplay = formatAns(q, sel, 'user');
  const correctDisplay = formatAns(q, null, 'correct');
  fb.classList.add('show', correct ? 'good' : 'bad');
  fb.innerHTML = correct
    ? `<h4>✅ 正确！</h4>
       <p>${q.explain}</p>
       ${q.deeper ? `<div class="deep">🧠 延伸：${q.deeper}</div>` : ''}`
    : `<h4>❌ 错了</h4>
       <p>你的答案：${userDisplay}</p>
       <p>正确答案：${correctDisplay}</p>
       <p>${q.explain}</p>
       ${q.deeper ? `<div class="deep">🧠 延伸：${q.deeper}</div>` : ''}`;

  cardEl.classList.add(correct ? 'pop' : 'shake');
}
