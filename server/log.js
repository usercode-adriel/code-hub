// LOGS ESTRUTURADOS (Pino): uma linha JSON por evento, com nível e horário.
// O nível vem de LOG_LEVEL (padrão: info). Os logs vão para a saída padrão, que o lançador do Windows grava em codeniac.log.
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { app: 'codeniac' },
  timestamp: pino.stdTimeFunctions.isoTime,
});
