// ПАНЕЛЬ ИГРОКА. Здесь нет ни кода, ни ссылок на панель куратора: путь к ней хранится в базе и приходит только куратору.
import {firebaseConfig} from './config.js';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import * as A from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import * as F from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {COL,HEROES,ITEMS,BANNERS,CH,GLOSS,STD,SHARD,ENDINGS,GIFTSET,H,IT,imgH,imgI,SPK} from './data.js';

const app = initializeApp(firebaseConfig), auth = A.getAuth(app), db = F.getFirestore(app);
const $ = s => document.querySelector(s);
const E = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const rnd = a => a[Math.floor(Math.random()*a.length)], wait = ms => new Promise(r => setTimeout(r, ms));
const day = () => new Date().toLocaleDateString('sv'), nf = n => (n||0).toLocaleString('ru');
const RM = matchMedia('(prefers-reduced-motion:reduce)').matches;
let S = null, SET = {}, uid, ref, tab = 'home', bsel = 'lim', flt = {s:0, k:'all'}, sound = localStorage.snd !== '0', fxOn = 0, started = 0;
const ACT = {}, GS = new Set();

// ---------- вспомогательное ----------
const pic = id => `<img src="${IT(id) ? imgI(id) : imgH(id)}" alt="" loading=lazy onerror="this.remove()">`;   // нет файла: картинка просто не показывается
const beastOf = id => ITEMS.find(x => x.k === 'beast' && x.o === id), gearOf = id => ITEMS.find(x => x.k === 'gear' && x.o === id);
const setOk = (id, O = S.owned, I = S.items) => !!(O[id] && I[beastOf(id)?.id] > 0 && I[gearOf(id)?.id] > 0);
const has = k => { if(!k) return false; const [t, id] = k.split(':'); return t === 'b' ? (S.items[id] || 0) > 0 : t === 'set' ? setOk(id) : false; };
const chCost = i => CH[i].cost - (i === 0 && (has('b:grosh') || setOk('noel')) ? 1000 : 0);
const colOf = (s, k) => k === 'hero' ? COL[s] : s >= 5 ? COL[5] : s === 4 ? COL[4] : '#7a8ca8';
const bEnd = () => SET.bannerStart ? SET.bannerStart + (SET.ext ? 15 : 10)*864e5 : 0;
function toast(t){ const e = $('#toast'); e.textContent = t; e.className = 'on'; clearTimeout(toast.t); toast.t = setTimeout(() => e.className = '', 4000); }
function ask(msg, danger){ return new Promise(r => { const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="box${danger?' danger':''}"><p>${msg}</p><button class=b data-v=1>Да</button><button class=b2 data-v=0>Отмена</button></div>`;
  m.onclick = e => { const v = e.target.dataset.v; if(v !== undefined){ m.remove(); r(v === '1'); } }; document.body.append(m); }); }
function beep(f, d){ if(!sound) return; try{ const c = beep.c || (beep.c = new AudioContext()), o = c.createOscillator(), g = c.createGain();
  o.frequency.value = f; g.gain.value = .05; g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + d); o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + d); }catch{} }

// ---------- вход и роли ----------
document.addEventListener('click', e => { const a = e.target.closest('[data-a]'); if(a && ACT[a.dataset.a]) ACT[a.dataset.a](a.dataset); });
document.addEventListener('keydown', e => { if(e.code === 'Space' && tab === 'story' && !/INPUT|TEXTAREA/.test(e.target.tagName)){ const n = document.querySelector('[data-a=next]'); if(n){ e.preventDefault(); n.click(); } } });
const loginScreen = () => $('#app').innerHTML = `<div class=login><h1>Хроники Люмьера</h1><input id=lg placeholder="Логин" autocomplete=username><input id=pw type=password placeholder="Пароль" autocomplete=current-password><button class=b data-a=in>Войти</button><p id=err class=red></p></div>`;
ACT.in = async () => { try{ await A.signInWithEmailAndPassword(auth, $('#lg').value.trim().toLowerCase() + '@lumiere.game', $('#pw').value); }catch{ $('#err').textContent = 'Неверный логин или пароль'; } };
ACT.out = () => { started = 0; A.signOut(auth); };
ACT.snd = () => { sound = !sound; localStorage.snd = sound ? '1' : '0'; render(); };
A.onAuthStateChanged(auth, async u => {
  if(!u){ S = null; return loginScreen(); }
  uid = u.uid; let r;
  try{ r = (await F.getDoc(F.doc(db, 'roles', uid))).data(); }catch{}
  if(r?.role === 'curator' && r.panel){ const m = await import(r.panel); return m.mount($('#app'), {db, auth, A, F, out: ACT.out}); }
  if(r?.role === 'player') return start();
  $('#app').innerHTML = '<div class=login><p>Нет доступа.</p><button class=b data-a=out>Выйти</button></div>';
});
const NEW = () => ({crystals:0, ov:0, pity:{lim:{p6:0,p5:0,l6:false,l5:false}, std:{p6:0,p5:0}, shop:{p4:0,p5:0}},
  owned:{}, items:{}, shards:0, story:{done:0, cur:null, flags:{}}, dead:{}, surv:{}, seen:{}, setGift:{}, debts:[], log:[], plog:[], lastPull:null, lastDelay:0});
async function start(){
  if(started) return; started = 1; ref = F.doc(db, 'players', uid);
  if(!(await F.getDoc(ref)).exists()) await F.setDoc(ref, NEW());
  F.onSnapshot(F.doc(db, 'settings', 'main'), d => { SET = d.data() || {}; render(); });
  F.onSnapshot(ref, d => { S = d.data(); render(); });
}

// ---------- логика круток ----------
function pickF(P, b, s, std){
  if(std || !b['f'+s]) return rnd(STD[s]);          // постоянный баннер или нет героя баннера: берём стандартного
  const k = 'l' + s;
  if(P[k] || Math.random() < .5){ P[k] = false; return rnd(b['f'+s]); }
  P[k] = true; return rnd(STD[s]);                   // проиграл 50/50: флаг сохраняется
}
function pullHero(P, b, std){
  P.p6++; P.p5++;
  const p6 = P.p6 < 65 ? .006 : Math.min(1, .006 + (P.p6 - 64)*.066);
  if(Math.random() < p6){ P.p6 = 0; P.p5 = 0; return pickF(P, b, 6, std); }
  if(P.p5 >= 40 || Math.random() < .06){ P.p5 = 0; return pickF(P, b, 5, std); }
  const all = HEROES.filter(h => h.s === 4).map(h => h.id);
  if(std) return rnd(all);
  return Math.random() < .5 ? rnd(b.f4) : rnd(all.filter(x => !b.f4.includes(x)));
}
function pullShop(P){
  P.p4++; P.p5++; let s;
  if(P.p5 >= 50) s = 5; else { let r = Math.random()*100, a = 0; s = 1;
    for(const [i, w] of [[1,25],[2,35],[3,28],[4,10],[5,2]]){ a += w; if(r < a){ s = i; break; } }
    if(P.p4 >= 8 && s < 4) s = 4; }
  if(s >= 5){ P.p5 = 0; P.p4 = 0; } else if(s === 4) P.p4 = 0;
  const pool = ITEMS.filter(i => i.k !== 'relic' && i.s === s), W = i => [6,3,1][pool.indexOf(i) % 3];   // скрытый вес 60/30/10
  let t = Math.random()*pool.reduce((a, i) => a + W(i), 0);
  for(const i of pool){ t -= W(i); if(t <= 0) return i; } return pool[0];
}
async function commit(patch, res, fail){
  patch.lastPull = {res, shown:false}; fxOn = 1;     // результат сохраняется ДО анимации
  try{ await F.updateDoc(ref, patch); }catch{ fxOn = 0; return toast('Не удалось сохранить. Попробуйте ещё раз.'); }
  animate(res);
}
ACT.pull = async d => {
  const n = +d.n, lim = d.t === 'lim', b = BANNERS[SET.bannerIdx || 0], price = SET.price || 1000, cost = n*price;
  if(lim && ((b.need && S.story.done < b.need) || (bEnd() && Date.now() > bEnd()))) return toast('Этот баннер сейчас недоступен');
  if(S.crystals < cost) return toast(`Не хватает ${nf(cost - S.crystals)} Кристаллов`);
  const P = structuredClone(S.pity), Q = lim ? P.lim : P.std, O = structuredClone(S.owned), I = structuredClone(S.items), res = []; let sh = 0;
  for(let i = 0; i < n; i++){
    const id = pullHero(Q, b, !lim), h = H(id), isNew = !O[id]; let note;
    if(isNew){ O[id] = {m:0, tr:0}; note = 'NEW'; }
    else if(O[id].m < 3){ O[id].m++; O[id].tr = Math.min(5, (O[id].tr||0) + 1); note = 'Воспоминание +1'; }
    else { sh += 10; note = 'Осколки +10'; }
    res.push({id, n:h.n, s:h.s, c:COL[h.s], isNew, note});
  }
  const patch = {crystals:F.increment(-cost), pity:P, owned:O, shards:F.increment(sh),
    plog:[...(S.plog||[]), {t:Date.now(), b:lim ? b.n : 'Вечерний салон', n, best:Math.max(...res.map(r => r.s))}].slice(-100)};
  for(const g of GIFTSET) if(setOk(g, O, I) && !S.setGift?.[g]){ I.delay = (I.delay||0) + 1; patch['setGift.'+g] = true; toast('Комплект собран: +1 Руна отсрочки'); }
  patch.items = I; commit(patch, res);
};
ACT.spull = async d => {
  const n = +d.n, cost = n*(SET.shopPrice || 500);
  if(S.crystals < cost) return toast(`Не хватает ${nf(cost - S.crystals)} Кристаллов`);
  const P = structuredClone(S.pity), I = structuredClone(S.items), res = []; let sh = 0;
  for(let i = 0; i < n; i++){
    const it = pullShop(P.shop); let note = 'NEW', isNew = 1;
    if(it.k === 'rune'){ I[it.id] = (I[it.id]||0) + 1; isNew = 0; note = '+1 расходник'; }
    else if(I[it.id] > 0){ sh += SHARD[it.s]; isNew = 0; note = 'Осколки +' + SHARD[it.s]; } else I[it.id] = 1;
    res.push({id:it.id, n:it.n, s:it.s, c:colOf(it.s, 'i'), isNew, note});
  }
  commit({crystals:F.increment(-cost), pity:P, items:I, shards:F.increment(sh),
    plog:[...(S.plog||[]), {t:Date.now(), b:'Серебряная Пыль', n, best:Math.max(...res.map(r => r.s))}].slice(-100)}, res);
};
ACT.buy = async d => {
  const cost = +d.c; if(S.shards < cost) return toast('Не хватает Осколков Памяти');
  await F.updateDoc(ref, {shards:F.increment(-cost), ['items.'+d.id]:F.increment(1)}); toast('Куплено');
};
ACT.redeem = async () => {
  const code = $('#pc').value.trim().toUpperCase(); if(!code) return;
  try{
    const pr = F.doc(db, 'promos', code), d = (await F.getDoc(pr)).data();
    if(!d || d.used || (d.exp && Date.now() > d.exp)) return toast('Код недействителен или уже использован');
    const b = F.writeBatch(db); b.update(pr, {used:true, by:uid});
    b.update(ref, {crystals:F.increment(d.c), ov:F.increment(d.o), claim:code, log:F.arrayUnion({t:Date.now(), d:day(), c:d.c, o:d.o, note:'Промокод: ' + d.title, k:d.k||0})});
    await b.commit(); toast(`+${nf(d.c)} Кристаллов, +${nf(d.o)} ОВ`);
  }catch{ toast('Не удалось активировать код'); }
};

// ---------- анимация ----------
const cardH = (r, big) => `<div class="rc${big?' big':''}" style="--c:${r.c}">${pic(r.id)}<i>${'★'.repeat(r.s)}</i><b>${E(r.n)}</b><small>${E(r.note||'')}</small></div>`;
async function animate(res){
  fxOn = 1; const o = $('#fx'); o.className = 'on'; let skip = 0; const w = ms => skip ? 0 : wait(ms);
  o.innerHTML = '<button class="b skip">Пропустить</button><div class=stage></div>'; o.querySelector('.skip').onclick = () => skip = 1;
  const st = o.querySelector('.stage'), best = Math.max(...res.map(r => r.s)), bc = res.find(r => r.s === best).c, six = res.some(r => r.s >= 6);
  if(!RM){                                            // при prefers-reduced-motion вспышки и тряска отключены
    st.innerHTML = '<div class=lamp></div>'; beep(120, 1.2); await w(1200);
    st.innerHTML = `<div class=flash style="--c:${bc}"></div>`; if(six) o.classList.add('shake'); beep(six ? 660 : 450, .8); await w(1000);
    o.classList.remove('shake'); st.innerHTML = `<div class=env style="--c:${bc}"></div>`; beep(200, .3); await w(1000);
  }
  st.innerHTML = '<div class=grid></div>'; const g = st.firstChild;
  for(const r of res){ g.insertAdjacentHTML('beforeend', cardH(r, r.s >= 6 && res.length > 1 || res.length === 1)); beep(300 + r.s*60, .3);
    await w(RM ? 150 : r.s >= 6 ? 3000 : r.s === 5 ? 1200 : 400); }
  await w(600); showSummary(res);
}
function showSummary(res){
  fxOn = 1; const o = $('#fx'); o.className = 'on';
  o.innerHTML = `<h3>Итог</h3><div class=grid>${res.map(r => cardH(r)).join('')}</div><p>Новых: ${res.filter(r => r.isNew).length}. Гарантии: см. на экране баннера.</p><button class=b data-a=close>Закрыть</button>`;
}
ACT.close = async () => { $('#fx').className = ''; fxOn = 0; try{ await F.updateDoc(ref, {'lastPull.shown':true}); }catch{} };

// ---------- сюжет ----------
async function die(ids, p){
  const dead = [];
  for(const id of ids){
    if(S.dead[id]) continue;
    if((S.items.delay||0) > 0 && Date.now() - (S.lastDelay||0) > 3*864e5 && await ask('Использовать Руну отсрочки, чтобы отменить гибель? (раз в 3 дня)')){ p['items.delay'] = F.increment(-1); p.lastDelay = Date.now(); continue; }
    if((S.items.bint||0) > 0 && await ask('Старый пёс «Бинт» может спасти героя, но сам погибнет. Позволить?')){ p['items.bint'] = F.increment(-1); continue; }
    p['dead.' + id] = true; dead.push(id);
  }
  if(dead.length) toast('Погиб: ' + dead.map(i => H(i).n).join(', ') + '. Карточка перенесена в Мемориал.');
}
ACT.chopen = async d => {
  const i = +d.i, cost = chCost(i); if(S.story.done !== i) return;
  if(S.ov < cost) return toast(`Не хватает ${nf(cost - S.ov)} ОВ`);
  if(await ask(`Открыть главу за ${nf(cost)} ОВ?`)) F.updateDoc(ref, {ov:F.increment(-cost), 'story.cur':{ch:i, i:0}});
};
ACT.next = async () => {
  const {ch, i} = S.story.cur, sc = CH[ch].s[i], p = {};
  if(sc.give === 'emile') p['owned.emile'] = {m:0, tr:1};
  if(sc.end){ p['story.cur'] = null; p['story.done'] = ch + 1; if(S.items.perstn > 0) p.ov = F.increment(200); } else p['story.cur'] = {ch, i:i + 1};
  F.updateDoc(ref, p);
};
ACT.pick = async d => {
  const {ch, i} = S.story.cur, c = CH[ch].s[i].c[+d.i]; if(c.need && !has(c.need)) return;
  let cost = c.free && has(c.free) ? 0 : (c.ov || 0); const kill = [...(c.kill || [])];
  if(c.short && S.ov < cost){ cost = S.ov; kill.push(...c.short); }
  if(c.kuo && !has(c.kuo[0])) kill.push(c.kuo[1]);
  if(cost > S.ov) return toast('Не хватает Очков Влияния');
  if((c.warn || c.short || c.kuo || kill.length) && !await ask('⚠ Этот выбор может стоить жизни. Продолжить?', 1)) return;
  const p = {ov:F.increment(-cost)};
  for(const k in c.f || {}) p['story.flags.' + k] = c.f[k];
  if(c.eternal){ p['dead.emile'] = 'eternal'; p['items.lantern'] = 1; }   // гибель Эмиля: без защиты и воскрешения
  await die(kill, p); p['story.cur'] = {ch, i:i + 1}; F.updateDoc(ref, p);
};
function gloss(t){
  const hit = GLOSS.filter(([k, m]) => t.includes(m) && !S.seen?.[k] && !GS.has(k));
  if(!hit.length) return; const u = {}; hit.forEach(([k]) => { GS.add(k); u['seen.' + k] = true; });
  toast(hit[0][2]); F.updateDoc(ref, u);
}
ACT.rev = async d => {
  const id = d.id, b = beastOf(id), hb = b && S.items[b.id] > 0, helper = (S.owned.selest && !S.dead.selest) || (S.owned.bastien && !S.dead.bastien);
  const cost = hb ? (helper ? 5000 : 10000) : 12000;
  if(!hb && S.story.done < 4) return toast('Нужен зверь героя. Запасной путь «Долгий поиск» откроется после Главы 4.');
  if(S.ov < cost) return toast(`Не хватает ${nf(cost - S.ov)} ОВ`);
  if(await ask(`Воскресить героя (Хроника Тени) за ${nf(cost)} ОВ?`)) F.updateDoc(ref, {ov:F.increment(-cost), ['dead.' + id]:F.deleteField(), ['surv.' + id]:true});
};

// ---------- экраны ----------
ACT.tab = d => { tab = d.k; render(); }; ACT.bsel = d => { bsel = d.k; render(); };
ACT.fk = d => { flt.k = d.v; render(); }; ACT.fs = d => { flt.s = +d.v; render(); };
const V = {
  home(){
    const lim = bsel === 'lim', b = BANNERS[SET.bannerIdx || 0], P = lim ? S.pity.lim : S.pity.std, price = SET.price || 1000, end = bEnd();
    const locked = lim && b.need && S.story.done < b.need, over = lim && end && Date.now() > end;
    const nm = a => a.map(id => H(id).n).join(' / ');
    const left = end ? Math.max(0, Math.ceil((end - Date.now())/864e5)) : null;
    const btn = n => `<button class="b${S.crystals < n*price || locked || over ? ' dis' : ''}" data-a=pull data-n=${n} data-t=${lim ? 'lim' : 'std'}>×${n} (${nf(n*price)})</button>`;
    return `<div><button class="b2" data-a=bsel data-k=lim>Салон знакомств</button><button class="b2" data-a=bsel data-k=std>Вечерний салон</button></div>
    <div class=poster><h3>${lim ? E(b.n) : 'Вечерний салон'}</h3>
    ${lim ? `<p>${b.f6 ? '6★: ' + nm(b.f6) + '<br>' : '6★: стандартный (Адриенна)<br>'}5★: ${nm(b.f5)}<br>Усиленные 4★: ${nm(b.f4)}</p><p>${locked ? 'Откроется после Главы 4' : over ? 'Баннер ушёл' : left == null ? 'Дата старта ещё не задана' : `Осталось дней: ${left}${SET.ext ? ' (продлён)' : ''}`}</p>${SET.extTask && !SET.ext ? `<p class=red>Задание продления: ${E(SET.extTask)}</p>` : ''}`
      : '<p>Пул: Адриенна, Дамьен, Мирей и все 4★ герои. Без 50/50.</p>'}
    <p>Шансы: 6★ 0,6% · 5★ 6% · 4★ 93,4%${lim ? ' (50% всех 4★ — усиленные)' : ''}<br>Мягкая гарантия 6★ с 65-й крутки, жёсткая на 80-й. Гарантия 5★ в пределах 40.</p>
    <p>Счётчик 6★: ${P.p6}/80 · 5★: ${P.p5}/40${lim ? `<br>Проигран 50/50: 6★ — ${P.l6 ? 'да' : 'нет'}, 5★ — ${P.l5 ? 'да' : 'нет'}` : ''}</p>${btn(1)}${btn(10)}</div>
    <section><input id=pc placeholder="Промокод"><button class=b data-a=redeem>Активировать</button></section>
    ${S.debts?.length ? `<section><b>Активные долги (${S.debts.length}/5):</b> ${S.debts.map(E).join('; ')}</section>` : ''}`;
  },
  story(){
    const st = S.story, cur = st.cur;
    if(!cur){ const en = st.flags?.ending;
      return CH.map((c, i) => `<section><h3>Глава ${i + 1}. ${E(c.t)}</h3><p>${st.done > i ? 'Пройдена ✔' : st.done === i ? `Стоимость: ${nf(chCost(i))} ОВ` : 'Закрыта'}</p>${st.done === i ? `<button class=b data-a=chopen data-i=${i}>Открыть главу</button>` : ''}</section>`).join('')
        + (en ? `<section><h3>Концовка: ${ENDINGS[en][0]}</h3><p>${ENDINGS[en][1]}</p></section>` : ''); }
    const sc = CH[cur.ch].s[cur.i]; let h = `<section><h3>Глава ${cur.ch + 1}. ${E(CH[cur.ch].t)}</h3>`;
    if(sc.q){
      const danger = sc.c.some(c => c.warn || c.short || c.kuo || c.kill);
      h += `<p><b>${E(sc.q)}</b></p>${danger ? '<p class=red>⚠ Этот выбор может стоить жизни</p>' : ''}` + sc.c.map((c, i) => {
        const ok = !c.need || has(c.need), cost = c.free && has(c.free) ? 0 : (c.ov || 0);
        return `<button class="b ch${ok ? '' : ' dis'}${c.warn || c.short || c.kuo ? ' warn' : ''}" data-a=pick data-i=${i}>${E(c.x)}${cost ? ` (−${nf(cost)} ОВ)` : ''}${ok ? '' : ` · нужен: ${E(c.nt)}`}${S.items.chasy > 0 && c.h ? `<small>${E(c.h)}</small>` : ''}</button>`;
      }).join('');
    } else h += `${sc.img ? `<img class=scene src="images/scenes/${sc.img}" alt="" onerror="this.remove()">` : ''}${SPK[sc.w] ? pic(SPK[sc.w]).replace('<img', '<img class=pt') : ''}<p>${sc.w ? `<b>${E(sc.w)}:</b> ` : ''}${E(sc.x)}</p>${sc.end && cur.ch === 3 && st.flags.ending ? `<p><b>Концовка: ${ENDINGS[st.flags.ending][0]}</b></p>` : ''}<button class=b data-a=next>${sc.end ? 'Закрыть главу' : 'Далее (пробел)'}</button>`;
    return h + '</section>';
  },
  col(){
    const hs = HEROES.filter(h => S.owned[h.id] && !S.dead[h.id]).map(h => ({...h, sub:`${h.f}. ${h.t} Доверие ${S.owned[h.id].tr||0}/5 · Воспоминаний ${S.owned[h.id].m||0}/3${setOk(h.id) ? ' · Комплект ✦' : ''}${S.surv?.[h.id] ? ' · Выживший' : ''}`}));
    const its = ITEMS.filter(i => S.items[i.id] > 0).map(i => ({...i, sub:`${i.o ? H(i.o).n : 'Артефакт'}${S.items[i.id] > 1 ? ' ×' + S.items[i.id] : ''}`}));
    const all = [...hs, ...its].filter(x => (!flt.s || x.s === flt.s) && (flt.k === 'all' || x.k === flt.k || (flt.k === 'item' && x.k !== 'hero')));
    const fb = (a, v, t, cur) => `<button class="b2${cur === v ? ' on' : ''}" data-a=${a} data-v=${v}>${t}</button>`;
    return `<div>${[['all','Все'],['hero','Герои'],['beast','Звери'],['item','Предметы']].map(([v, t]) => fb('fk', v, t, flt.k)).join('')}<br>${[0,1,2,3,4,5,6].map(v => fb('fs', v, v ? v + '★' : 'Любые', flt.s)).join('')}</div>
    <div class=grid>${all.map(x => `<div class=cd style="--c:${colOf(x.s, x.k)}">${pic(x.id)}<i>${'★'.repeat(x.s)}</i><b>${E(x.n)}</b><small>${E(x.sub)}</small></div>`).join('') || '<p>Здесь пока пусто. Загляните на главный экран и сделайте первую крутку.</p>'}</div>`;
  },
  shop(){
    const P = S.pity.shop, price = SET.shopPrice || 500;
    const btn = n => `<button class="b${S.crystals < n*price ? ' dis' : ''}" data-a=spull data-n=${n}>×${n} (${nf(n*price)})</button>`;
    return `<div class=poster><h3>Лавка «Серебряная Пыль»</h3><p>Звери, снаряжение, артефакты и руны. Цель выбрать нельзя.<br>Шансы: 1★ 25% · 2★ 35% · 3★ 28% · 4★ 10% · 5★ 2%<br>Гарантия: 4★ за 8 круток, 5★ на 50-й. Счётчик: ${P.p4}/8 · ${P.p5}/50</p>${btn(1)}${btn(10)}</div>
    <section><h3>Лавка Памяти</h3><p>Осколков: ${nf(S.shards)}. Героев и предметы 3★+ за осколки получить нельзя.</p>
    ${[['return', 20], ['sight', 30], ['delay', 60]].map(([id, c]) => `<button class="b${S.shards < c ? ' dis' : ''}" data-a=buy data-id=${id} data-c=${c}>${E(IT(id).n)} · ${c}</button>`).join('')}</section>`;
  },
  mem(){
    const L = Object.entries(S.dead || {}).filter(([id]) => S.owned[id]);
    return L.length ? `<div class=grid>${L.map(([id, v]) => `<div class="cd dead" style="--c:#888">${pic(id)}<b>${E(H(id).n)}</b><small>${v === 'eternal' ? 'Вечная память' : 'ПОГИБ'}</small>${v === 'eternal' ? '' : `<button class=b data-a=rev data-id=${id}>Воскресить</button>`}</div>`).join('')}</div>` : '<p>Мемориал пуст.</p>';
  },
  gar(){ return `<div class=poster><h3>Ночной Гараж: Сессия</h3><p>${SET.garage ? 'Сезон 2 скоро. Вы закрыли сессию, и афиша уже на двери лавки.' : 'Закрыто. Откроется, когда будет закрыта учебная сессия.'}</p></div>`; }
};
function render(){
  if(!S) return;
  $('#app').innerHTML = `<header><span class=logo>Хроники Люмьера</span><span>💎 ${nf(S.crystals)} · ✦ ${nf(S.ov)} ОВ</span><span><button class=ic data-a=snd title="Звук">${sound ? '🔊' : '🔇'}</button><button class=ic data-a=out title="Выйти">Выйти</button></span></header>
  <nav>${[['home','Главная'],['story','Сюжет'],['col','Коллекция'],['shop','Лавка'],['mem','Мемориал'],['gar','Ночной Гараж']].map(([k, n]) => `<button class="${tab === k ? 'on' : ''}" data-a=tab data-k=${k}>${n}</button>`).join('')}</nav><main>${V[tab]()}</main>`;
  if(tab === 'story' && S.story.cur){ const sc = CH[S.story.cur.ch].s[S.story.cur.i]; gloss(sc.x || sc.q || ''); }
  if(S.lastPull && !S.lastPull.shown && !fxOn) showSummary(S.lastPull.res);   // вкладку закрыли во время анимации: показываем итог
}
