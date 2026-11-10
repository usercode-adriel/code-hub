// Agendador interno (sem programas externos): roda a cada minuto enquanto o Codeniac está aberto.
import { db, localDate } from './db.js';
import { notify } from './notify.js';
import { briefing, prefs } from './briefing.js';
import { dailyReminders } from './routes/life.js';
import { backupIfDue } from './backup.js';

const hm = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function tick() {
  const today = localDate();
  const time = hm();
  for (const u of db().users) {
    const s = prefs(u.id);
    try {
      // briefing: no horário configurado ou na primeira vez que o app abrir depois dele
      if (s.briefingEnabled && time >= s.briefingTime) {
        const b = briefing(u.id);
        notify(u.id, { type: 'system', key: `briefing:${today}`, title: '☀️ Seu briefing de hoje', message: b.text.slice(0, 600), link: '#/hoje' });
      }
      if (time >= '08:00' || time >= s.briefingTime) dailyReminders(u.id);
      if (time >= s.dayCloseTime && !db().dayClose.some((x) => x.userId === u.id && x.date === today)) {
        notify(u.id, { type: 'system', key: `dayclose:${today}`, title: '🌙 Encerramento do dia', message: 'Que tal registrar como foi o dia? Leva 1 minuto.', link: '#/hoje' });
      }
    } catch (err) {
      console.error('[agendador]', err.message);
    }
  }
  backupIfDue();
}

export function startScheduler() {
  setTimeout(tick, 5000);
  setInterval(tick, 60 * 1000).unref();
}
