// Livros: painel de leitura (estante com progresso, estatísticas, últimas leituras) e
// biblioteca digital de PDF/EPUB com banco próprio — clique para baixar, capa e nome personalizáveis.
import { api, auth, coll } from '../api.js';
import { store, on } from '../store.js';
import { icon } from '../icons.js';
import { esc, toast, todayISO, formModal, modal, confirmDialog, validateImage, pickImage } from '../ui.js';

const COLORS = ['#7a1f2b', '#1f3a5f', '#2f5d3a', '#5b3a1e', '#4a2366', '#1e5a5a', '#6b5412', '#3a3f4a'];
const colorOf = (t = '') => COLORS[[...t].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const CAT_ICON = { Clássicos: 'trophy', 'Autoajuda & Produtividade': 'trending', 'Finanças & Economia': 'wallet', Programação: 'code', Inglês: 'globe', Ficção: 'sparkles', Negócios: 'briefcase', Outros: 'layers' };
const CAT_SUB = { Clássicos: 'Grandes obras da história', 'Autoajuda & Produtividade': 'Melhore-se todos os dias', 'Finanças & Economia': 'Construa sua liberdade',
  Programação: 'Código e tecnologia', Inglês: 'Leituras em inglês', Ficção: 'Histórias e mundos', Negócios: 'Empreender e liderar', Outros: 'Diversos' };
const QUOTES = [['Um homem que lê, sempre terá uma vantagem sobre aqueles que não leem.', 'Mark Twain'], ['Os livros são espelhos: só se vê neles o que já se tem dentro.', 'Carlos Ruiz Zafón'],
  ['Ler é sonhar pela mão de outro.', 'Fernando Pessoa'], ['Quem não lê, mal fala, mal ouve, mal vê.', 'Monteiro Lobato']];
const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const hm = (min) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}min`;
const pct = (b) => (b.pages ? Math.min(100, Math.round(((b.current || 0) / b.pages) * 100)) : b.status === 'lido' ? 100 : 0);
const dlHref = (item) => `/api/library/${item.id}/download?token=${encodeURIComponent(auth.token)}`;

// Capa: imagem enviada ou uma capa gerada com o título.
function cover(title, author, img, extra = '') {
  if (img) return `<div class="bk-cover" ${extra}><img src="${esc(img)}" alt="" loading="lazy"></div>`;
  return `<div class="bk-cover gen" style="--bc:${colorOf(title)}" ${extra}><span class="t">${esc(title)}</span><span class="a">${esc(author || '')}</span></div>`;
}

// Abre o assistente com o PDF do livro anexado, para perguntar o que quiser sobre ele.
function askBook(f) {
  localStorage.setItem('codeniac.pendingChat', JSON.stringify({ title: `Sobre ${f.title}`.slice(0, 60), text: 'Me faz um resumo das ideias principais deste livro.', files: [{ file: `lib:${f.id}`, name: f.title, mime: 'application/pdf', size: f.size }] }));
  location.hash = '#/assistente';
}

let libFilter = '';
let libQuery = '';

async function draw(el) {
  const [books, libRes, log] = await Promise.all([coll('books').list(), api.get('/library'), coll('studyLog').list()]);
  const files = libRes.items;
  const cats = libRes.categories;
  const month = todayISO().slice(0, 7);
  const year = todayISO().slice(0, 4);
  const readLog = log.filter((l) => l.area === 'livros');
  const minutesMonth = readLog.filter((l) => (l.date || '').startsWith(month)).reduce((a, l) => a + l.minutes, 0);
  const daysMonth = new Set(readLog.filter((l) => (l.date || '').startsWith(month)).map((l) => l.date)).size;
  const readYear = books.filter((b) => b.status === 'lido' && (b.finishedAt || '').startsWith(year)).length;
  const rated = books.filter((b) => b.rating > 0);
  const avg = rated.length ? (rated.reduce((a, b) => a + b.rating, 0) / rated.length).toFixed(1).replace('.', ',') : '—';
  const totalRead = books.filter((b) => b.status === 'lido').length;
  const level = totalRead >= 10 ? 'Leitor voraz' : totalRead >= 3 ? 'Leitor em evolução' : 'Leitor iniciante';
  const shelf = [...books].sort((a, b) => ({ lendo: 0, quero: 1, lido: 2 }[a.status || 'quero'] - { lendo: 0, quero: 1, lido: 2 }[b.status || 'quero']) || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const reading = books.filter((b) => b.status === 'lendo').sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const saved = books.flatMap((b) => (b.quotes || []).map((q) => [q.text, b.author || b.title]));
  const [qText, qAuthor] = saved.length ? saved[new Date().getDate() % saved.length] : QUOTES[new Date().getDate() % QUOTES.length];
  const catCount = (c) => files.filter((f) => f.category === c).length + books.filter((b) => b.category === c).length;
  const topCats = ['Clássicos', 'Autoajuda & Produtividade', 'Finanças & Economia'];
  const goalMin = 15 * 60;
  const ring = Math.min(1, minutesMonth / goalMin);
  const shown = files.filter((f) => (!libFilter || f.category === libFilter) && (!libQuery || `${f.title} ${f.author}`.toLowerCase().includes(libQuery)));
  const heroImg = store.images?.booksHero;

  el.innerHTML = `
    <div class="bk-top">
      <section class="bk-hero ${heroImg ? 'has-img' : ''}">${heroImg ? `<div class="bk-hero-img" style="background-image:url('${esc(heroImg)}')"></div>` : `<div class="bk-art" aria-hidden="true"><span class="lamp"></span><span class="b b1"></span><span class="b b2"></span><span class="b b3"></span><span class="b b4"></span><span class="mug">${icon('book', 18)}</span></div>`}
        <div class="bk-hero-body"><div class="hero2-chips"><span class="chip yellow">${icon('book', 12)} ${level}</span><a class="round-btn sm" href="#/achievements" title="Conquistas">${icon('trophy', 14)}</a><button class="round-btn sm" id="toStats" title="Estatísticas">${icon('activity', 14)}</button></div>
          <h1>Conhecimento<br>é <em>poder.</em></h1><p class="q">“${esc(qText)}”</p><small>— ${esc(qAuthor)}</small>
          <button class="pill-btn" id="explore" style="margin-top:16px">${icon('book', 13)} Explorar biblioteca ${icon('chevRight', 12)}</button></div></section>
      <div class="bk-cats">${topCats.map((c) => `<button class="row-card" data-cat="${esc(c)}"><span class="th" style="--cc:var(--bg-input);color:var(--text)">${icon(CAT_ICON[c], 20)}</span><span class="tx">${esc(c)}<small>${esc(CAT_SUB[c])} · ${catCount(c)} livro(s)</small></span><span class="chev">${icon('chevRight', 16)}</span></button>`).join('')}</div>
    </div>
    <div class="bk-mid">
      <section><div class="section-head"><h3 style="font-size:17px">Meus livros</h3><button class="see-more" id="addBook" style="color:var(--accent)">${icon('plus', 12)} Adicionar</button></div>
        <div class="hscroll-wrap"><div class="hscroll" id="shelf">${shelf.map((b) => `<button class="bk-card" data-b="${b.id}">${cover(b.title, b.author, b.cover)}<b>${esc(b.title)}</b><small>${esc(b.author || '')}</small>
            <span class="bk-prog"><span class="progress"><span style="width:${pct(b)}%"></span></span><em>${pct(b)}%</em></span></button>`).join('')}
            <button class="bk-card new" id="addBook2">${icon('plus', 26)}<span>Adicionar livro à estante</span></button></div>
          ${shelf.length > 3 ? `<button class="hs-next" id="shelfNext" aria-label="Mais livros">${icon('chevRight', 18)}</button>` : ''}</div></section>
      <section class="stat-card bk-stats" id="stats"><div class="section-head"><h3 style="font-size:17px">Estatísticas</h3><button class="see-more" id="logRead" style="color:var(--accent)" title="Registrar tempo de leitura">${icon('plus', 12)} Leitura</button></div>
        <div class="bk-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="bg"/><circle cx="60" cy="60" r="52" class="fg" style="stroke-dashoffset:${(326.7 * (1 - ring)).toFixed(1)}"/></svg>
          <div class="in">${icon('book', 22)}<b>${hm(minutesMonth)}</b><small>lidas este mês</small></div></div>
        <div class="bk-kpis"><div>${icon('book', 18)}<b>${readYear}</b><small>Lidos em ${year}</small></div><div>${icon('calendar', 18)}<b>${daysMonth}</b><small>Dias no mês</small></div><div>${icon('star', 18)}<b>${avg}</b><small>Avaliação média</small></div></div></section>
    </div>
    <div class="bk-bot">
      <section class="card"><div class="section-head"><h3>${icon('clock', 15)} Últimas leituras</h3><button class="see-more" id="seeShelf" style="color:var(--accent)">Ver estante ${icon('chevRight', 12)}</button></div>
        ${reading.length ? reading.slice(0, 2).map((b) => `<div class="bk-reading" data-b="${b.id}">${cover(b.title, b.author, b.cover)}<div class="grow"><b>${esc(b.title)}</b><small>${esc(b.author || '')}</small>
            ${b.quotes?.length ? `<p>“${esc(b.quotes.at(-1).text.slice(0, 90))}”</p>` : ''}<span class="bk-prog"><span class="progress"><span style="width:${pct(b)}%"></span></span><em>${pct(b)}%</em></span></div>
            <span class="pill-live">Lendo agora</span><button class="round-btn go" data-page="${b.id}" title="Atualizar página">${icon('chevRight', 16)}</button></div>`).join('')
          : '<div class="empty-mini">Nenhum livro em andamento. Marque um livro da estante como “Lendo”.</div>'}</section>
      <section class="card"><div class="section-head"><h3>${icon('download', 15)} Downloads / Biblioteca</h3><button class="see-more" id="seeLib" style="color:var(--accent)">Ver todos ${icon('chevRight', 12)}</button></div>
        <div class="list">${files.slice(0, 3).map((f) => `<div class="bk-file"><span class="fmt ${f.format}">${f.format.toUpperCase()}</span><div class="grow"><b>${esc(f.title)}</b><small>${fmtSize(f.size)}${f.author ? ` · ${esc(f.author)}` : ''}</small></div><a class="round-btn sm" href="${dlHref(f)}" title="Baixar">${icon('download', 14)}</a></div>`).join('') || '<div class="empty-mini">Envie PDFs e EPUBs na biblioteca abaixo.</div>'}</div></section>
    </div>
    <section class="card bk-lib" id="lib"><div class="section-head"><h3 style="font-size:17px">${icon('layers', 16)} Biblioteca digital <small class="muted" style="font-weight:400">${files.length} arquivo(s)</small></h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><input class="input" id="lq" placeholder="Buscar título ou autor" value="${esc(libQuery)}" style="height:34px;max-width:220px"><button class="btn primary" id="upBtn">${icon('upload', 14)} Enviar PDF / EPUB</button></div></div>
      <div class="tag-row bk-filters"><button class="chip ${libFilter ? '' : 'yellow'}" data-f="">Todos</button>${cats.filter((c) => files.some((f) => f.category === c)).map((c) => `<button class="chip ${libFilter === c ? 'yellow' : ''}" data-f="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <div class="upload-zone bk-drop" id="drop" tabindex="0" role="button">${icon('upload', 20)}<div>Arraste arquivos <b>.pdf</b> ou <b>.epub</b> aqui, ou clique para escolher</div><small>Até ${libRes.maxMb} MB cada · ficam num banco separado, só neste computador</small><input type="file" id="fileIn" accept=".pdf,.epub,application/pdf,application/epub+zip" multiple hidden></div>
      <div id="upList"></div>
      <div class="bk-grid">${shown.map((f) => `<div class="bk-item" data-f="${f.id}"><a class="bk-dl" href="${dlHref(f)}" title="Baixar ${esc(f.title)}">${cover(f.title, f.author, f.cover)}<span class="fmt ${f.format}">${f.format.toUpperCase()}</span><span class="dl-ic">${icon('download', 18)}</span></a>
          <div class="bk-item-info"><div class="grow"><b>${esc(f.title)}</b><small>${esc(f.author || f.category)} · ${fmtSize(f.size)}</small></div>${f.format === 'pdf' ? `<button class="icon-btn sm ghost" data-ask="${f.id}" title="Perguntar à IA sobre este livro">${icon('bot', 13)}</button>` : ''}<button class="icon-btn sm ghost" data-edit="${f.id}" title="Editar nome e capa">${icon('edit', 13)}</button></div></div>`).join('')
        || `<div class="empty-mini" style="grid-column:1/-1">${files.length ? 'Nada com esse filtro.' : 'Sua biblioteca está vazia. Envie seu primeiro PDF ou EPUB.'}</div>`}</div></section>`;

  const reload = () => draw(el);
  const scrollTo = (sel) => el.querySelector(sel)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.querySelector('#explore').onclick = () => scrollTo('#lib');
  el.querySelector('#seeLib').onclick = () => scrollTo('#lib');
  el.querySelector('#seeShelf').onclick = () => scrollTo('#shelf');
  el.querySelector('#toStats').onclick = () => scrollTo('#stats');
  el.querySelector('#shelfNext')?.addEventListener('click', () => el.querySelector('#shelf').scrollBy({ left: 220, behavior: 'smooth' }));
  el.querySelectorAll('[data-cat]').forEach((b) => { b.onclick = () => { libFilter = b.dataset.cat; draw(el).then(() => scrollTo('#lib')); }; });
  el.querySelectorAll('[data-f]').forEach((b) => { if (b.tagName === 'BUTTON') b.onclick = () => { libFilter = b.dataset.f; reload(); }; });
  let t; el.querySelector('#lq').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { libQuery = e.target.value.trim().toLowerCase(); draw(el).then(() => { const i = el.querySelector('#lq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 300); };

  // estante
  const bookForm = (b = {}) => {
    let coverUrl = b.cover || '';
    return formModal({
      title: b.id ? b.title : 'Adicionar livro à estante', wide: true,
      fields: [
        { name: 'title', label: 'Título', value: b.title || '' }, { name: 'author', label: 'Autor', value: b.author || '' },
        { name: 'status', label: 'Status', type: 'select', value: b.status || 'quero', options: [['quero', 'Quero ler'], ['lendo', 'Lendo agora'], ['lido', 'Lido']] },
        { name: 'category', label: 'Categoria', type: 'select', value: b.category || 'Outros', options: cats.map((c) => [c, c]) },
        { name: 'pages', label: 'Total de páginas', value: b.pages ?? '', inputmode: 'numeric' }, { name: 'current', label: 'Página atual', value: b.current ?? '', inputmode: 'numeric' },
        { name: 'rating', label: 'Nota', type: 'select', value: b.rating || 0, options: [0, 1, 2, 3, 4, 5].map((n) => [n, n ? '★'.repeat(n) : 'Sem nota']) },
        { name: 'cover', label: 'Capa', type: 'text', value: coverUrl, placeholder: 'Use o botão abaixo para enviar', hint: 'Clique em “Enviar capa” depois de abrir; ou deixe em branco para a capa automática.' },
        { name: 'quotes', label: 'Citações (uma por linha)', type: 'textarea', rows: 3, full: true, value: (b.quotes || []).map((x) => x.text).join('\n') },
        { name: 'notes', label: 'Resumo / anotações', type: 'textarea', rows: 3, full: true, value: b.notes || '' },
      ],
      onSubmit: (d) => {
        d.quotes = d.quotes.split('\n').map((l) => l.trim()).filter(Boolean).map((text) => ({ text }));
        d.rating = Number(d.rating) || 0;
        d.cover = d.cover || '';
        if (d.status === 'lendo' && !b.startedAt) d.startedAt = todayISO();
        if (d.status === 'lido' && !b.finishedAt) d.finishedAt = todayISO();
        if (d.status === 'lido' && b.status !== 'lido') toast('Livro concluído! 📚', `${readYear + 1} de ${store.settings.readingYearGoal || 12} na meta do ano.`, 'success');
        return b.id ? coll('books').update(b.id, d) : coll('books').add(d);
      },
      onDelete: b.id ? () => coll('books').remove(b.id) : null,
    }).then(reload);
  };
  // botão de enviar capa dentro do formulário da estante
  const enhanceCover = () => {
    const input = document.querySelector('.modal input[name="cover"]');
    if (!input) return;
    input.readOnly = true;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'btn sm outline'; btn.style.marginTop = '6px'; btn.innerHTML = `${icon('image', 12)} Enviar capa`;
    btn.onclick = () => pickImage(async (file) => { if (!validateImage(file)) return; const r = await api.upload('/uploads', file); input.value = r.url; toast('Capa enviada', 'Clique em Salvar para aplicar.', 'success'); });
    input.after(btn);
  };
  const openBook = (b) => { bookForm(b); setTimeout(enhanceCover); };
  el.querySelector('#addBook').onclick = () => openBook();
  el.querySelector('#addBook2').onclick = () => openBook();
  el.querySelectorAll('.bk-card[data-b], .bk-reading[data-b] .bk-cover').forEach((c) => { c.onclick = () => openBook(books.find((x) => x.id === (c.dataset.b || c.closest('[data-b]').dataset.b))); });
  el.querySelectorAll('[data-page]').forEach((btn) => { btn.onclick = () => {
    const b = books.find((x) => x.id === btn.dataset.page);
    formModal({ title: `Onde você parou em “${b.title}”?`, fields: [{ name: 'current', label: `Página atual${b.pages ? ` (de ${b.pages})` : ''}`, value: b.current ?? '', inputmode: 'numeric' }, { name: 'minutes', label: 'Minutos lidos agora (opcional)', value: '', inputmode: 'numeric' }],
      onSubmit: async (d) => {
        const cur = Number(d.current) || 0;
        const patch = { current: cur };
        if (b.pages && cur >= b.pages) { patch.status = 'lido'; patch.finishedAt = todayISO(); toast('Livro concluído! 📚', b.title, 'success'); }
        await coll('books').update(b.id, patch);
        if (Number(d.minutes) > 0) await coll('studyLog').add({ area: 'livros', minutes: Number(d.minutes), date: todayISO(), note: b.title });
      } }).then(reload);
  }; });
  el.querySelector('#logRead').onclick = () => formModal({ title: 'Registrar leitura', fields: [{ name: 'minutes', label: 'Minutos lidos', value: '30', inputmode: 'numeric' }, { name: 'date', label: 'Data', type: 'date', value: todayISO() },
    { name: 'note', label: 'Livro', type: 'select', value: reading[0]?.title || '', options: [['', '—'], ...books.map((b) => [b.title, b.title])] }],
  onSubmit: (d) => coll('studyLog').add({ area: 'livros', minutes: Number(d.minutes) || 0, date: d.date, note: d.note }) }).then(reload);

  // biblioteca: envio com barra de progresso
  const upList = el.querySelector('#upList');
  const uploadFiles = async (list) => {
    const ok = [...list].filter((f) => /\.(pdf|epub)$/i.test(f.name));
    if (ok.length < list.length) toast('Alguns arquivos foram ignorados', 'Só .pdf e .epub são aceitos.', 'error');
    for (const file of ok) {
      if (file.size > libRes.maxMb * 1048576) { toast('Arquivo muito grande', `${file.name} passa de ${libRes.maxMb} MB.`, 'error'); continue; }
      const row = document.createElement('div');
      row.className = 'bk-up';
      row.innerHTML = `<span class="fmt">${esc(file.name.split('.').pop().toUpperCase())}</span><div class="grow"><b>${esc(file.name)}</b><span class="progress"><span style="width:0"></span></span></div><small>0%</small>`;
      upList.append(row);
      await new Promise((resolve) => {
        const fd = new FormData();
        fd.append('category', libFilter || 'Outros');
        fd.append('file', file);
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/library');
        xhr.setRequestHeader('Authorization', `Bearer ${auth.token}`);
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) { const p = Math.round((e.loaded / e.total) * 100); row.querySelector('.progress span').style.width = `${p}%`; row.querySelector('small').textContent = `${p}%`; } };
        xhr.onload = () => {
          if (xhr.status === 201) row.querySelector('small').textContent = 'pronto ✓';
          else { let msg = 'Falha no envio'; try { msg = JSON.parse(xhr.responseText).error || msg; } catch { /* ok */ } row.querySelector('small').textContent = msg; row.classList.add('err'); }
          resolve();
        };
        xhr.onerror = () => { row.querySelector('small').textContent = 'Falha na conexão'; row.classList.add('err'); resolve(); };
        xhr.send(fd);
      });
    }
    if (ok.length) { toast('Biblioteca atualizada', 'Clique no lápis de um livro para mudar nome e capa.', 'success'); setTimeout(reload, 600); }
  };
  const drop = el.querySelector('#drop');
  const fileIn = el.querySelector('#fileIn');
  drop.onclick = () => fileIn.click();
  drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } };
  el.querySelector('#upBtn').onclick = () => fileIn.click();
  fileIn.onchange = () => { uploadFiles(fileIn.files); fileIn.value = ''; };
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); uploadFiles(e.dataTransfer.files); };

  el.querySelectorAll('[data-ask]').forEach((b) => { b.onclick = () => askBook(files.find((x) => x.id === b.dataset.ask)); });
  // editar nome, autor, categoria e capa de um arquivo
  el.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => {
    const f = files.find((x) => x.id === b.dataset.edit);
    modal({
      title: 'Editar livro digital', wide: true,
      body: `<form class="form"><div class="bk-edit">${cover(f.title, f.author, f.cover, 'id="edCover"')}<div class="grow form">
          <div class="field"><label>Nome</label><input name="title" value="${esc(f.title)}" maxlength="160"></div>
          <div class="field"><label>Autor</label><input name="author" value="${esc(f.author || '')}" maxlength="120"></div>
          <div class="field"><label>Categoria</label><select name="category">${cats.map((c) => `<option ${c === f.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn sm outline" id="edUp">${icon('image', 12)} ${f.cover ? 'Trocar capa' : 'Enviar capa'}</button>${f.cover ? '<button type="button" class="btn sm outline" id="edRm">Usar capa automática</button>' : ''}
            <a class="btn sm outline" href="${dlHref(f)}">${icon('download', 12)} Baixar</a>${f.format === 'pdf' ? `<button type="button" class="btn sm primary" id="edAsk">${icon('bot', 12)} Perguntar à IA</button>` : ''}</div>
          <small class="muted">${f.format.toUpperCase()} · ${fmtSize(f.size)} · baixado ${f.downloads || 0} vez(es)<br>Arquivo original: ${esc(f.originalName || '')}</small></div></div>
        <div class="form-actions"><button type="button" class="btn danger" id="edDel" style="margin-right:auto">${icon('trash', 13)} Excluir</button><button type="button" class="btn outline" data-close>Cancelar</button><button class="btn primary">Salvar</button></div></form>`,
      onMount: (m, close) => {
        m.querySelector('#edUp').onclick = () => pickImage(async (file) => { if (!validateImage(file)) return; await api.upload(`/library/${f.id}/cover`, file); toast('Capa atualizada', '', 'success'); close(); reload(); });
        m.querySelector('#edRm')?.addEventListener('click', async () => { await api.del(`/library/${f.id}/cover`); close(); reload(); });
        m.querySelector('#edAsk')?.addEventListener('click', () => { close(); askBook(f); });
        m.querySelector('#edDel').onclick = async () => { if (!(await confirmDialog('Excluir livro digital', `"${f.title}" e o arquivo serão apagados.`))) return; await api.del(`/library/${f.id}`); close(); reload(); };
        m.querySelector('form').onsubmit = async (e) => { e.preventDefault(); const fm = e.target; await api.put(`/library/${f.id}`, { title: fm.title.value, author: fm.author.value, category: fm.category.value }); close(); toast('Livro atualizado', '', 'success'); reload(); };
      },
    });
  }; });
}

export default async function render(el) {
  await draw(el);
  return on('data-changed', () => draw(el));
}
