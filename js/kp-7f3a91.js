// ПАНЕЛЬ КУРАТОРА. Загружается только после проверки роли (путь к файлу хранится в базе, в документе roles).
import {ECON, EVENTS, BANNERS, calcReward} from './data.js';
export async function mount(root, {db, F, out}){
  const day = () => new Date().toLocaleDateString('sv'), nf = n => (n||0).toLocaleString('ru');
  const rs = await F.getDocs(F.query(F.collection(db, 'roles'), F.where('role', '==', 'player')));
  if(rs.empty){ root.innerHTML = '<p>В коллекции roles нет документа с role = player.</p>'; return; }
  const uid = rs.docs[0].id, pref = F.doc(db, 'players', uid), sref = F.doc(db, 'settings', 'main');
  let S = null, SET = {};
  root.innerHTML = `<header><span class=logo>Панель куратора</span><button class=b2 id=out>Выйти</button></header><main>
  <section><h3>Игрок</h3><div id=st>Игрок ещё не заходил в игру.</div>
   <input id=ac type=number placeholder="Кристаллы (±)"><input id=ao type=number placeholder="ОВ (±)"><input id=an placeholder="Комментарий"><button class=b id=adj>Применить правку</button></section>
  <section><h3>Калькулятор наград</h3>
   <select id=cat>${Object.entries(ECON.cats).map(([k, v]) => `<option value=${k}>${v}</option>`).join('')}</select>
   <input id=min type=number value=30 placeholder="Минут">
   <select id=ev><option value="">— или готовое событие —</option>${EVENTS.map((e, i) => `<option value=${i}>${e.n} (${nf(e.c)})</option>`).join('')}</select>
   <select id=gr><option value=none>Оценка: нет</option><option value=good>хорошо +15%</option><option value=excellent>отлично +30%</option></select>
   <select id=sk><option value=0>Серия: меньше 3 дней</option><option value=3>3+ дня (+10%)</option><option value=7>7+ дней (+20%)</option><option value=14>14+ дней (+30%)</option></select><br>
   <label><input type=checkbox id=debt> Хвост/долг ×1,5</label> <label><input type=checkbox id=own> Сам придумал +20%</label> <label><input type=checkbox id=gaz> Утренняя газета</label> <label><input type=checkbox id=bas> Три корзины</label> <label><input type=checkbox id=ovt> Сверхурочные</label> <label><input type=checkbox id=rest> День отдыха</label><br>
   <input id=note placeholder="Название задания / комментарий"><div id=res></div>
   <button class=b id=give>Начислить</button> <button class=b2 id=mkp>Создать промокод</button> <input id=days type=number placeholder="Срок, дней (пусто = без срока)"><div id=code></div></section>
  <section><h3>Долги (до 5)</h3><div id=dbt></div><input id=nd placeholder="Описание долга"><button class=b id=addd>Добавить</button> <button class=b2 id=clean>Чистый лист (+20 000 💎)</button></section>
  <section><h3>Баннер и настройки</h3>
   <select id=bi>${BANNERS.map((b, i) => `<option value=${i}>${b.n}</option>`).join('')}</select><input id=bs type=datetime-local><br>
   <input id=pr type=number placeholder="Цена крутки (1000)"><input id=sp type=number placeholder="Цена в лавке (500)"><button class=b id=ss>Сохранить (новый баннер сбрасывает продление)</button><br>
   <input id=et placeholder="Задание продления"><button class=b2 id=ei>Выдать задание</button><button class=b2 id=ed>Засчитать: +5 дней</button><br>
   <button class=b id=gar>Открыть «Ночной Гараж»</button> <span id=sst></span></section>
  <section><h3>Промокоды (неиспользованные)</h3><div id=pl></div></section>
  <section><h3>История</h3><div id=lg></div></section>
  <section><h3>Расширенная правка и резервная копия</h3><textarea id=js rows=8 style="width:100%"></textarea><br><button class=b2 id=sj>Сохранить правку JSON</button>
   <button class=b2 id=ex>Скачать копию</button> <input type=file id=im accept=.json><button class=b2 id=imp>Загрузить копию</button></section></main>`;
  const $ = s => root.querySelector(s), v = s => $(s).value, ck = s => $(s).checked;
  const todayPrev = () => (S?.log || []).filter(l => l.d === day()).reduce((a, l) => a + (l.k || 0), 0);
  const calc = () => calcReward({cat:v('#cat'), min:+v('#min')||0, ev:v('#ev'), grade:v('#gr'), streak:+v('#sk'), debt:ck('#debt'), own:ck('#own'), gaz:ck('#gaz'), bas:ck('#bas'), over:ck('#ovt'), rest:ck('#rest'), prev:todayPrev(), lupa:S?.items?.lupa > 0});
  const recalc = () => { const r = calc(); $('#res').innerHTML = r.lines.map(([a, b]) => `<div>${a}: <b>${typeof b === 'number' ? nf(b) : b}</b></div>`).join('') + `<p><b>Итого: ${nf(r.c)} 💎 и ${nf(r.o)} ОВ</b></p>`; };
  root.addEventListener('input', recalc);
  const upd = p => F.updateDoc(pref, p);
  const stamp = (c, o, note, k = 0) => F.arrayUnion({t:Date.now(), d:day(), c, o, note, k});
  F.onSnapshot(sref, d => { SET = d.data() || {}; $('#sst').textContent = `Баннер ${BANNERS[SET.bannerIdx||0].n}, продление: ${SET.ext ? 'да' : 'нет'}, Гараж: ${SET.garage ? 'открыт' : 'закрыт'}`; });
  F.onSnapshot(pref, d => {
    S = d.exists() ? d.data() : null; if(!S) return;
    $('#st').innerHTML = `💎 ${nf(S.crystals)} · ✦ ${nf(S.ov)} ОВ · Осколки ${S.shards} · Глава ${S.story.done}/4 · Героев: ${Object.keys(S.owned).length}<br>Погибшие: ${Object.keys(S.dead||{}).map(i => `${i}${S.dead[i]==='eternal'?' (вечная память)':''}`).join(', ') || 'нет'}<br>Пити: ${JSON.stringify(S.pity)}`;
    $('#dbt').innerHTML = (S.debts||[]).map((x, i) => `<div>${x} <button class=b2 data-d=${i}>Закрыт</button></div>`).join('') || 'Нет долгов';
    $('#lg').innerHTML = '<b>Начисления:</b><br>' + [...(S.log||[])].reverse().slice(0, 30).map(l => `${l.d}: ${nf(l.c)} 💎 / ${nf(l.o)} ОВ — ${l.note||''}`).join('<br>') + '<br><b>Крутки:</b><br>' + [...(S.plog||[])].reverse().slice(0, 20).map(l => `${new Date(l.t).toLocaleString('ru')}: ${l.b} ×${l.n}, лучший ${l.best}★`).join('<br>');
    if(document.activeElement !== $('#js')) $('#js').value = JSON.stringify(S, null, 1); recalc();
  });
  F.onSnapshot(F.query(F.collection(db, 'promos'), F.where('used', '==', false)), q => {
    $('#pl').innerHTML = q.docs.map(d => { const x = d.data(); return `<div><b>${d.id}</b> ${x.title}: ${nf(x.c)} 💎 / ${nf(x.o)} ОВ <button class=b2 data-p=${d.id}>Удалить</button></div>`; }).join('') || 'Нет';
  });
  root.addEventListener('click', async e => {
    const t = e.target, id = t.id; if(!S && id !== 'out' && id !== 'ss' && id !== 'gar') return alert('Игрок ещё не заходил в игру.');
    if(t.dataset.d !== undefined){ const d = [...S.debts]; d.splice(+t.dataset.d, 1); return upd({debts:d}); }
    if(t.dataset.p) return F.deleteDoc(F.doc(db, 'promos', t.dataset.p));
    if(id === 'out') out();
    if(id === 'give'){ const r = calc(); await upd({crystals:F.increment(r.c), ov:F.increment(r.o), log:stamp(r.c, r.o, v('#note') || 'Начисление', r.k)}); $('#note').value = ''; }
    if(id === 'mkp'){ const r = calc(), code = Math.random().toString(36).slice(2, 10).toUpperCase();
      await F.setDoc(F.doc(db, 'promos', code), {title:v('#note') || 'Задание', cat:v('#cat'), c:r.c, o:r.o, k:r.k, used:false, exp:v('#days') ? Date.now() + v('#days')*864e5 : 0});
      $('#code').innerHTML = `Код: <b>${code}</b> (${nf(r.c)} 💎, ${nf(r.o)} ОВ)`; }
    if(id === 'adj'){ const c = +v('#ac') || 0, o = +v('#ao') || 0; await upd({crystals:F.increment(c), ov:F.increment(o), log:stamp(c, o, 'Ручная правка: ' + v('#an'))}); }
    if(id === 'addd'){ if((S.debts||[]).length >= 5) return alert('Не больше 5 активных долгов'); if(v('#nd')) await upd({debts:[...(S.debts||[]), v('#nd')]}); $('#nd').value = ''; }
    if(id === 'clean'){ if((S.debts||[]).length) return alert('Сначала закройте все долги'); await upd({crystals:F.increment(20000), ov:F.increment(2000), log:stamp(20000, 2000, 'Чистый лист')}); }
    if(id === 'ss'){ const p = {bannerIdx:+v('#bi'), ext:false, extTask:'', price:+v('#pr') || 1000, shopPrice:+v('#sp') || 500};
      if(v('#bs')) p.bannerStart = new Date(v('#bs')).getTime(); await F.setDoc(sref, p, {merge:true}); }
    if(id === 'ei') await F.setDoc(sref, {extTask:v('#et')}, {merge:true});
    if(id === 'ed') await F.setDoc(sref, {ext:true, extTask:''}, {merge:true});
    if(id === 'gar') await F.setDoc(sref, {garage:true}, {merge:true});
    if(id === 'sj'){ try{ await upd(JSON.parse(v('#js'))); alert('Сохранено'); }catch(x){ alert('Ошибка в JSON: ' + x.message); } }
    if(id === 'ex'){ const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({uid, player:S, settings:SET}, null, 1)], {type:'application/json'})); a.download = `lumiere-${day()}.json`; a.click(); }
    if(id === 'imp'){ const f = $('#im').files[0]; if(!f) return alert('Выберите файл копии'); const d = JSON.parse(await f.text());
      if(confirm('Заменить текущие данные игрока данными из файла?')){ await F.setDoc(pref, d.player); await F.setDoc(sref, d.settings || {}); alert('Загружено'); } }
  });
}
