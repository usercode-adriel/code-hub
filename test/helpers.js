// Mundo de teste: dados numa pasta temporária, sem IA e sem imagens, com relógio controlável.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const RealDate = Date;
let offset = 0;
class FakeDate extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + offset); }
  static now() { return RealDate.now() + offset; }
}

export async function bootWorld() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeniac-test-'));
  Object.assign(process.env, { DATA_DIR: dir, CODENIAC_NO_IMAGES: '1', GEMINI_API_KEY: '', ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '' });
  globalThis.Date = FakeDate;
  process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
  const { load, db } = await import('../server/db.js');
  const { migrate } = await import('../server/migrate.js');
  const { bootstrap } = await import('../server/seed.js');
  load(); migrate(); bootstrap();
  const W = await import('../server/world/index.js');
  const { world } = await import('../server/world/core.js');
  const user = db().users[0];
  for (let i = 0; i < 8 && !(world(user.id).core.schema >= 6); i++) await W.engineTick();
  const w = world(user.id);
  return {
    dir, user, w,
    ctx: () => ({ user, uid: user.id, w, live: false, at: new Date() }),
    // avança o relógio hora a hora, rodando o motor do mundo
    async advance(hours) { for (let h = 0; h < hours; h++) { offset += 3600 * 1000; await W.engineTick(); } },
    async cleanup() { (await import('../server/world/store.js')).flushWorld(); (await import('../server/db.js')).saveNow(); },
  };
}
