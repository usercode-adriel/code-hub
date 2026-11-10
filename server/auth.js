import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { db, save } from './db.js';

function secret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const d = db();
  if (!d.meta.jwtSecret) {
    d.meta.jwtSecret = crypto.randomBytes(48).toString('hex');
    save();
  }
  return d.meta.jwtSecret;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64);
  const ref = Buffer.from(hash, 'hex');
  return ref.length === test.length && crypto.timingSafeEqual(ref, test);
}

export function signToken(user) {
  return jwt.sign({ sub: user.id }, secret(), { expiresIn: '30d' });
}

export function publicUser(u) {
  if (!u) return null;
  const { password, ...rest } = u;
  return rest;
}

// Aceita "Authorization: Bearer <token>" ou ?token= (necessário para EventSource).
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (!token) return res.status(401).json({ error: 'Não autenticado' });
  try {
    const payload = jwt.verify(token, secret());
    const user = db().users.find((u) => u.id === payload.sub);
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Sessão expirada, faça login novamente' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores' });
  next();
}
