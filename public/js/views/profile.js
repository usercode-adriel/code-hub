// Perfil: foto, dados pessoais, senha e exportação dos dados.
import { api, auth } from '../api.js';
import { store, setUser } from '../store.js';
import { icon } from '../icons.js';
import { esc, avatar, toast, bindUploadZone, validateImage, formData } from '../ui.js';

export default async function render(el) {
  const draw = () => {
    const u = store.user;
    el.innerHTML = `<div class="page-head"><div><h1>Meu perfil</h1><p>Seus dados ficam só no seu computador.</p></div></div>
      <div class="two-col"><section class="card profile-side">${avatar(u, 'xl')}<h3>${esc(u.name)}</h3><p class="muted" style="margin:4px 0 16px;font-size:12px">${esc(u.title || 'Membro')} · ${u.role === 'admin' ? 'Administrador' : 'Usuário'}</p>
        <div class="upload-zone" id="zone" tabindex="0" role="button">${icon('upload', 20)}<div>Arraste uma foto ou clique</div><small>PNG, JPG, WEBP ou GIF até 8 MB</small><input type="file" accept="image/*" hidden id="file"></div>
        ${u.avatar ? '<button class="btn sm outline" id="rmAv" style="margin-top:10px">Remover foto</button>' : ''}</section>
      <div class="stack"><section class="card"><h3 class="title">${icon('user', 15)} Dados pessoais</h3><p class="sub">Como o hub e o assistente vão te chamar.</p>
        <form class="form" id="pf"><div class="form-row"><div class="field"><label>Nome</label><input name="name" value="${esc(u.name)}"></div><div class="field"><label>E-mail (login)</label><input name="email" type="email" value="${esc(u.email)}"></div></div>
          <div class="field"><label>Cargo / título</label><input name="title" value="${esc(u.title || '')}" placeholder="Ex.: Motorista e estudante de programação"></div><div class="field"><label>Bio</label><textarea name="bio" rows="3">${esc(u.bio || '')}</textarea></div>
          <div class="form-actions"><button class="btn primary">Salvar</button></div></form></section>
        <section class="card"><h3 class="title">${icon('shield', 15)} Senha</h3><p class="sub">${u.email === 'admin@codeniac.dev' ? '⚠️ Você ainda usa a conta de demonstração. Troque o e-mail e a senha.' : 'Use pelo menos 6 caracteres.'}</p>
          <form class="form" id="pw"><div class="form-row"><div class="field"><label>Senha atual</label><input type="password" name="current" autocomplete="current-password"></div><div class="field"><label>Nova senha</label><input type="password" name="next" autocomplete="new-password"></div></div><div class="form-actions"><button class="btn primary">Alterar senha</button></div></form></section>
        <section class="card"><h3 class="title">${icon('download', 15)} Meus dados</h3><p class="sub">Baixe tudo (tarefas, páginas, finanças, diário, cartões...) em um arquivo JSON.</p><button class="btn outline" id="exp">${icon('download', 14)} Exportar dados</button></section></div></div>`;
    bindUploadZone(el.querySelector('#zone'), el.querySelector('#file'), async (file) => {
      if (!validateImage(file)) return;
      const r = await api.upload('/profile/avatar', file);
      setUser(r.user); toast('Foto atualizada', '', 'success'); draw();
    });
    el.querySelector('#rmAv')?.addEventListener('click', async () => { const r = await api.del('/profile/avatar'); setUser(r.user); draw(); });
    el.querySelector('#pf').onsubmit = async (e) => { e.preventDefault(); try { const r = await api.put('/profile', formData(e.target)); setUser(r.user); toast('Perfil salvo', '', 'success'); draw(); } catch (err) { toast('Erro', err.message, 'error'); } };
    el.querySelector('#pw').onsubmit = async (e) => { e.preventDefault(); try { await api.put('/profile/password', formData(e.target)); toast('Senha alterada', '', 'success'); e.target.reset(); } catch (err) { toast('Erro', err.message, 'error'); } };
    el.querySelector('#exp').onclick = async () => {
      const res = await fetch('/api/export', { headers: { Authorization: `Bearer ${auth.token}` } });
      const blob = await res.blob();
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `codeniac-dados-${new Date().toISOString().slice(0, 10)}.json` });
      a.click(); URL.revokeObjectURL(a.href);
    };
  };
  draw();
}
