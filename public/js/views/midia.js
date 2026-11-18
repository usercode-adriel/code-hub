// 04 · WORLD MEDIA — notícias por categoria, TV e rádio (com locução), cinema, música e celebridades.
import { shell, face, num, bindEntities, CAT_ICON, CAT_COLOR, api, esc, timeAgo, icon, toast } from '../world/wui.js';

const TABS = [['noticias', 'Notícias', 'news'], ['tv', 'TV e rádio', 'play'], ['cinema', 'Cinema', 'star'], ['celebridades', 'Celebridades', 'sparkles']];

export default async function render(el, parts = [], query = new URLSearchParams()) {
  const tab = TABS.some(([k]) => k === parts[0]) ? parts[0] : 'noticias';
  const body = shell(el, 'midia', { title: 'World Media', sub: 'Tudo o que sai aqui nasceu de um acontecimento registrado na cidade.' });
  body.innerHTML = `<div class="w-tabs">${TABS.map(([k, l, ic]) => `<a href="#/midia/${k}" class="${k === tab ? 'on' : ''}">${icon(ic, 14)} ${l}</a>`).join('')}</div><div id="mBody"><div class="skeleton" style="height:200px"></div></div>`;
  const box = body.querySelector('#mBody');
  bindEntities(body);
  const d = await api.get(`/mundo/midia${query.get('cat') ? `?cat=${encodeURIComponent(query.get('cat'))}` : ''}`);
  if (tab === 'noticias') {
    const cat = query.get('cat') || '';
    box.innerHTML = `<div class="w-filters"><a class="w-chip ${!cat ? 'on' : ''}" href="#/midia/noticias">Todas</a>${Object.entries(d.cats).map(([k, l]) => `<a class="w-chip ${cat === k ? 'on' : ''}" href="#/midia/noticias?cat=${k}">${esc(l)}</a>`).join('')}</div>
      ${d.news.length ? `<div class="m-news">${d.news.map((n, i) => `<a class="m-n ${i === 0 ? 'lead' : ''}" href="#/internet/artigo/${esc(n.id)}" style="--c:${CAT_COLOR[n.cat] || '#64748b'}"><span class="m-n-ic">${icon(CAT_ICON[n.cat] || 'news', i === 0 ? 30 : 18)}</span><div><small>${esc(n.catLabel || '')} · ${esc(n.site?.name || '')}${n.author ? ` · por ${esc(n.author.name)}` : ''}${n.ai ? ' · texto da IA' : ''}</small><b>${esc(n.title)}</b>${i < 5 ? `<p>${esc(n.lead)}</p>` : ''}<small class="muted">${esc(timeAgo(n.at))}${'★'.repeat(Math.max(0, n.importance - 2))}</small></div></a>`).join('')}</div>`
        : `<div class="w-empty">${icon('news', 30)}<b>Nenhuma notícia nessa categoria</b><p>Os jornais publicam quando algo importante acontece na cidade.</p></div>`}`;
  }
  if (tab === 'tv') {
    let speaking = false;
    box.innerHTML = `<div class="m-channels">${d.channels.map((c) => `<button class="m-ch" data-ch="${esc(c.id)}" style="--c:${esc(c.color)}">${icon(c.kind === 'tv' ? 'play' : 'volume', 18)}<b>${esc(c.name)}</b><small>${esc(c.desc)}</small></button>`).join('')}</div><div id="mPlayer" class="w-panel m-player"><p class="muted">Escolha um canal. A programação é montada na hora com o que está acontecendo na cidade.</p></div>`;
    const player = box.querySelector('#mPlayer');
    const stop = () => { speechSynthesis?.cancel(); speaking = false; };
    box.querySelectorAll('[data-ch]').forEach((b) => { b.onclick = async () => {
      stop();
      box.querySelectorAll('[data-ch]').forEach((x) => x.classList.toggle('on', x === b));
      player.innerHTML = '<div class="skeleton" style="height:120px"></div>';
      try {
        const p = await api.get(`/mundo/midia/programa/${b.dataset.ch}`);
        player.innerHTML = `<div class="m-live" style="--c:${esc(p.channel.color)}"><span class="m-onair">● AO VIVO</span><b>${esc(p.channel.name)}</b><h3>${esc(p.title)}</h3><div class="w-faces">${p.people.map((x) => `<span data-person="${esc(x.id)}" title="${esc(x.name)}">${face(x, 34)}</span>`).join('')}</div>
          <button class="btn sm primary" id="mListen">${icon('volume', 13)} Ouvir</button></div>
          <div class="m-script">${p.lines.map((l, i) => `<p data-line="${i}"><b style="color:${esc(l.speaker?.color || 'inherit')}">${esc(l.speaker?.name || '')}:</b> ${esc(l.text)}</p>`).join('')}</div>`;
        player.querySelector('#mListen').onclick = () => {
          if (speaking) { stop(); return; }
          if (!('speechSynthesis' in window)) { toast('Sem voz', 'Este navegador não fala em voz alta.', 'info'); return; }
          speaking = true;
          const voices = speechSynthesis.getVoices().filter((v) => /pt/i.test(v.lang));
          const who = {};
          p.lines.forEach((l, i) => {
            const u = new SpeechSynthesisUtterance(l.text);
            u.lang = 'pt-BR'; const key = l.speaker?.id || 'x';
            who[key] ??= voices[Object.keys(who).length % Math.max(1, voices.length)] || null;
            if (who[key]) u.voice = who[key];
            u.pitch = 0.9 + (Object.keys(who).indexOf(key) % 3) * 0.15;
            u.onstart = () => player.querySelectorAll('[data-line]').forEach((x) => x.classList.toggle('on', Number(x.dataset.line) === i));
            if (i === p.lines.length - 1) u.onend = () => { speaking = false; };
            speechSynthesis.speak(u);
          });
        };
      } catch (err) { player.innerHTML = `<p class="down">${esc(err.message)}</p>`; }
    }; });
    if (parts[1]) box.querySelector(`[data-ch="${CSS.escape(parts[1])}"]`)?.click();
    return () => stop();
  }
  if (tab === 'cinema') {
    box.innerHTML = `${d.awards.length ? `<div class="w-panel m-award">🏆 Prêmio Nexus de Cinema: <b>${esc(d.awards[0].film || '')}</b> <small class="muted">${esc(timeAgo(d.awards[0].at))}</small></div>` : ''}
      <div class="m-films">${d.films.map((f) => `<article class="w-panel m-film"><div class="m-poster" style="--h:${(f.title.length * 37) % 360}"><b>${esc(f.title)}</b><small>${esc(f.genre)}</small></div><div><small class="muted">${esc(f.studio || '')} · ${f.released ? `estreou ${esc(timeAgo(f.releaseAt))}` : `estreia ${new Date(f.releaseAt).toLocaleDateString('pt-BR')}`}</small>
        <p>Direção: ${f.director ? `<a class="w-link" data-person="${esc(f.director.id)}">${esc(f.director.name)}</a>` : '—'}${f.cast.length ? ` · Elenco: ${f.cast.map((c) => `<a class="w-link" data-person="${esc(c.id)}">${esc(c.name)}</a>`).join(', ')}` : ''}</p>
        ${f.score != null ? `<p>Crítica: <b>${'★'.repeat(Math.round(f.score))}${'☆'.repeat(5 - Math.round(f.score))}</b> ${f.score.toLocaleString('pt-BR')} · Bilheteria: ${num(f.box)} NXC</p>` : ''}
        ${f.reviews.map((r) => `<blockquote>"${esc(r.text)}" — <a class="w-link" data-person="${esc(r.critic?.id)}">${esc(r.critic?.name || '')}</a> (${r.score})</blockquote>`).join('')}</div></article>`).join('') || '<p class="muted">Os estúdios da cidade ainda não lançaram filmes.</p>'}</div>
      <h3 class="w-h3">Músicas da cidade</h3>${d.songs.map((s) => `<div class="w-row"><span>🎵 <b>${esc(s.title)}</b> — <a class="w-link" data-person="${esc(s.artist?.id)}">${esc(s.artist?.name || '')}</a> <small class="muted">${esc(s.genre)} · ${esc(timeAgo(s.at))}</small></span><small>${s.plays} execuções na Neon FM</small></div>`).join('') || '<p class="muted">Nenhuma música lançada ainda.</p>'}`;
  }
  if (tab === 'celebridades') {
    box.innerHTML = `<div class="m-celebs">${d.celebrities.map((p, i) => `<button class="w-panel m-celeb" data-person="${esc(p.id)}"><span class="m-rank">${i + 1}</span>${face(p, 56)}<b>${esc(p.name)}</b><small>${esc(p.job || '')}</small><span class="w-chip">${num(p.followers)} seguidores</span><small class="muted">${p.mood?.emotion ? `sentindo-se ${esc(p.mood.emotion)}` : ''}</small></button>`).join('') || '<p class="muted">Ninguém famoso ainda.</p>'}</div>
      ${d.sponsorships.length ? `<h3 class="w-h3">Patrocínios recentes</h3>${d.sponsorships.map((s) => `<div class="w-row"><span><a class="w-link" data-person="${esc(s.persona?.id)}">${esc(s.persona?.name || '')}</a> × ${esc(s.company || '')}</span><small>${num(s.fee)} NXC · ${esc(timeAgo(s.at))}</small></div>`).join('')}` : ''}`;
  }
}
