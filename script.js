/* eslint-disable no-alert */
let BANK = [];
let QUIZ = [];
let state = {
  idx: 0,
  submitted: {}, // uid -> { chosen: ['A'], correct: bool }
  instant: false,
  count: 20,
};

// -------- Wrong-set (错题集) helpers --------
const WRONG_KEY = 'uniheal_wrong_uids_v1';
function loadWrongSet(){
  try{
    const raw = localStorage.getItem(WRONG_KEY);
    if(!raw) return new Set();
    const arr = JSON.parse(raw);
    if(Array.isArray(arr)) return new Set(arr.map(n => parseInt(n,10)).filter(n => Number.isFinite(n)));
    return new Set();
  }catch(_e){
    return new Set();
  }
}
function saveWrongSet(set){
  try{
    const arr = Array.from(set.values()).filter(n => Number.isFinite(n));
    localStorage.setItem(WRONG_KEY, JSON.stringify(arr));
  }catch(_e){}
}
function clearWrongSet(){
  try{ localStorage.removeItem(WRONG_KEY); }catch(_e){}
}
function updateWrongUI(){
  const btn = $('wrongBtn');
  const clearBtn = $('clearWrongBtn');
  if(!btn) return;
  const n = loadWrongSet().size;
  btn.textContent = `错题集（${n}）`;
  btn.disabled = n === 0;
  if(clearBtn) clearBtn.disabled = n === 0;
}

const $ = (id) => document.getElementById(id);

// -------- Random helpers (better-than-sort(Math.random)) --------
function randInt(max){
  // return integer in [0, max)
  if(max <= 0) return 0;
  if(window.crypto && crypto.getRandomValues){
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % max;
  }
  return Math.floor(Math.random() * max);
}
function fisherYates(arr){
  for(let i = arr.length - 1; i > 0; i--){
    const j = randInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function letter(i){
  return String.fromCharCode('A'.charCodeAt(0) + i);
}
// Shuffle options and remap answer keys (A/B/...) accordingly.
function shuffleOptionsAndAnswer(q){
  const opts = q.options.map(o => ({...o})); // clone
  fisherYates(opts);

  const mapOldToNew = {};
  opts.forEach((o, idx) => {
    const newKey = letter(idx);
    mapOldToNew[o.key] = newKey;
    o.key = newKey;
  });

  const newAns = (q.answer || []).map(k => mapOldToNew[k]).filter(Boolean);
  return { ...q, options: opts, answer: newAns };
}

function uniqueSorted(arr){
  return Array.from(new Set(arr)).sort();
}
function arraysEqual(a,b){
  const aa=uniqueSorted(a);
  const bb=uniqueSorted(b);
  return aa.length===bb.length && aa.every((v,i)=>v===bb[i]);
}

async function loadBank(){
  const res = await fetch('./questions.json', {cache:'no-store'});
  BANK = await res.json();
}

function pickQuestionsFrom(basePool, {count, qtype, shuffle}){
  let pool = basePool || [];
  if(qtype !== 'all') pool = pool.filter(q => q.type === qtype);
  if(pool.length === 0) throw new Error('题库为空或筛选后无题目。');

  let chosen = [...pool];
  // Use Fisher–Yates for an unbiased shuffle
  if(shuffle) fisherYates(chosen);
  chosen = chosen.slice(0, Math.min(count, chosen.length));

  // Keep answer keys stable (do NOT shuffle option order).
  return chosen.map(q => ({
    ...q,
    options: (q.options || []).map(o => ({...o})),
    answer: (q.answer || []).slice(),
  }));
}

function pickQuestions(opts){
  return pickQuestionsFrom(BANK, opts);
}

function show(el, on){ el.classList.toggle('hidden', !on); }

function renderQuestion(){
  const q = QUIZ[state.idx];
  if(!q){ return; }

  $('progressText').textContent = `第 ${state.idx+1} 题 / ${QUIZ.length} 题`;
  $('barFill').style.width = `${Math.round(((state.idx+1)/QUIZ.length)*100)}%`;
  $('typePill').textContent = q.type === 'multiple' ? '多选' : '单选';

  $('questionBox').innerHTML = `<div><span class="muted">#${q.uid}</span> ${escapeHtml(q.question)}</div>`;

  const box = $('optionsBox');
  box.innerHTML = '';

  const prev = state.submitted[q.uid]?.chosen || [];
  const inputType = q.type === 'multiple' ? 'checkbox' : 'radio';

  q.options.forEach(opt => {
    const id = `q${q.uid}_${opt.key}`;
    const checked = prev.includes(opt.key) ? 'checked' : '';
    const div = document.createElement('label');
    div.className = 'opt';
    div.setAttribute('for', id);
    div.innerHTML = `
      <input id="${id}" name="opt" type="${inputType}" value="${opt.key}" ${checked}/>
      <div class="key">${opt.key}</div>
      <div class="text">${escapeHtml(opt.text)}</div>
    `;
    box.appendChild(div);
  });

  // reset feedback
  $('feedback').className = 'feedback hidden';
  $('feedback').textContent = '';

  // if already submitted and instant, show it
  if(state.instant && state.submitted[q.uid]){
    showInstantFeedback(q);
  }

  $('prevBtn').disabled = state.idx === 0;
  $('nextBtn').disabled = state.idx === QUIZ.length - 1;
}

function getChosen(){
  const q = QUIZ[state.idx];
  const inputs = Array.from(document.querySelectorAll('#optionsBox input'));
  if(q.type === 'multiple'){
    return inputs.filter(i => i.checked).map(i => i.value);
  }else{
    const one = inputs.find(i => i.checked);
    return one ? [one.value] : [];
  }
}

function markOptions(q, chosen){
  const correct = uniqueSorted(q.answer);
  const chosenS = uniqueSorted(chosen);
  const labels = Array.from(document.querySelectorAll('#optionsBox .opt'));
  labels.forEach(label => {
    label.classList.remove('correct','wrong');
    const input = label.querySelector('input');
    const key = input.value;
    if(correct.includes(key)) label.classList.add('correct');
    if(chosenS.includes(key) && !correct.includes(key)) label.classList.add('wrong');
  });
}

function showInstantFeedback(q){
  const chosen = state.submitted[q.uid].chosen;
  const ok = state.submitted[q.uid].correct;
  const fb = $('feedback');
  fb.classList.remove('hidden');
  fb.classList.toggle('good', ok);
  fb.classList.toggle('bad', !ok);
  fb.textContent = ok ? '✅ 正确' : `❌ 错误。正确答案：${q.answer.join('')}`;
  markOptions(q, chosen);
}

function submitCurrent(){
  const q = QUIZ[state.idx];
  const chosen = getChosen();
  if(chosen.length === 0){
    alert('请先选择一个选项。');
    return;
  }
  const ok = arraysEqual(chosen, q.answer);
  state.submitted[q.uid] = { chosen, correct: ok };

  if(state.instant){
    showInstantFeedback(q);
  }else{
    // non-instant: still store, but keep UI clean
    $('feedback').className = 'feedback hidden';
  }
}

function finish(){
  const total = QUIZ.length;
  const correct = Object.values(state.submitted).filter(r => r.correct).length;
  const pct = total ? Math.round((correct/total)*100) : 0;

  $('scoreBig').textContent = `${pct}%`;
  $('scoreRaw').textContent = `${correct}/${total}`;
  $('scorePct').textContent = `${pct}%`;

  // review list (only wrong or unanswered)
  const review = $('reviewList');
  review.innerHTML = '';
  QUIZ.forEach(q => {
    const rec = state.submitted[q.uid];
    const ok = rec?.correct === true;
    if(ok) return;
    const chosen = rec?.chosen?.join('') || '(未作答)';
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `
      <div class="q">#${q.uid} ${escapeHtml(q.question)}</div>
      <div class="a">你的答案：${escapeHtml(chosen)} ｜ 正确答案：${escapeHtml(q.answer.join(''))}</div>
    `;
    review.appendChild(div);
  });

  // update wrong-set: add wrong/unanswered, remove those answered correctly
  const wrongSet = loadWrongSet();
  QUIZ.forEach(q => {
    const rec = state.submitted[q.uid];
    const ok = rec?.correct === true;
    if(ok) wrongSet.delete(q.uid);
    else wrongSet.add(q.uid);
  });
  saveWrongSet(wrongSet);
  updateWrongUI();

  show($('quiz'), false);
  show($('result'), true);
}

function escapeHtml(str){
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

function wire(){
    function ensureBankLoaded(){
      if(!BANK || BANK.length === 0){
        const isFile = (location && location.protocol === 'file:');
        alert(isFile
          ? '题库未加载：你是用 file:// 方式直接打开了网页，浏览器会拦截读取 questions.json。\n\n解决办法：\n1）把本页面放到 GitHub Pages；或\n2）在该目录运行 `python -m http.server 8000`，再访问 http://localhost:8000。'
          : '题库未加载，请稍后刷新页面重试。');
        return false;
      }
      return true;
    }

    function startWithPool(pool){
      if(!ensureBankLoaded()) return;

      const count = Math.max(1, parseInt($('count').value || '20', 10));
      const qtype = $('qtype').value;
      const shuffle = $('shuffle').checked;
      state.instant = $('instant').checked;
      state.count = count;

      try{
        QUIZ = pickQuestionsFrom(pool, {count, qtype, shuffle});
      }catch(e){
        alert(e.message || String(e));
        return;
      }
      state.idx = 0;
      state.submitted = {};

      show($('setup'), false);
      show($('result'), false);
      show($('quiz'), true);
      renderQuestion();
    }

    $('startBtn').addEventListener('click', () => startWithPool(BANK));

    $('wrongBtn').addEventListener('click', () => {
      if(!ensureBankLoaded()) return;
      const wrongSet = loadWrongSet();
      if(wrongSet.size === 0){
        alert('错题集为空。\n\n提示：做完一套测试后，做错/未作答的题会自动加入错题集。');
        updateWrongUI();
        return;
      }
      const pool = BANK.filter(q => wrongSet.has(q.uid));
      startWithPool(pool);
    });

    $('clearWrongBtn').addEventListener('click', () => {
      const n = loadWrongSet().size;
      if(n === 0){
        alert('错题集已经是空的。');
        return;
      }
      if(confirm(`确定要清空错题集吗？（将删除本机浏览器保存的 ${n} 条错题记录）`)){
        clearWrongSet();
        updateWrongUI();
        alert('已清空错题集。');
      }
    });

    updateWrongUI();

  $('submitBtn').addEventListener('click', submitCurrent);

  $('prevBtn').addEventListener('click', () => {
    state.idx = Math.max(0, state.idx-1);
    renderQuestion();
  });
  $('nextBtn').addEventListener('click', () => {
    state.idx = Math.min(QUIZ.length-1, state.idx+1);
    renderQuestion();
  });

  $('restartBtn').addEventListener('click', () => {
    show($('result'), false);
    show($('setup'), true);
  });

  // If user reaches the last question and has submitted it, "Next" could finish
  $('nextBtn').addEventListener('dblclick', () => {
    // quick finish shortcut
    finish();
  });

  // Keyboard: Enter submit; Ctrl+Enter finish
  document.addEventListener('keydown', (e) => {
    if($('quiz').classList.contains('hidden')) return;
    if(e.key === 'Enter'){
      e.preventDefault();
      if(e.ctrlKey || e.metaKey){
        finish();
      }else{
        submitCurrent();
      }
    }
  });

  // Add finish button dynamically
  const finishBtn = document.createElement('button');
  finishBtn.type = 'button';
  finishBtn.textContent = '交卷';
  finishBtn.addEventListener('click', () => {
    // allow finish even if not all submitted
    finish();
  });
  document.querySelector('#quiz .actions').appendChild(finishBtn);
}

(async function main(){
  // 先绑定事件，避免题库加载失败时按钮“完全没反应”
  wire();

  const statusEl = document.getElementById('loadStatus');
  try{
    await loadBank();
    if(statusEl) statusEl.textContent = `题库已加载：${BANK.length} 题`;
    updateWrongUI();
  }catch(e){
    console.error(e);
    if(statusEl) statusEl.textContent = '题库加载失败（本地 file:// 打开会被浏览器拦截）。';
  }
})();
