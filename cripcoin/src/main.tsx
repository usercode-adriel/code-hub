import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Jogo } from './nucleo/jogo';
import { carregarArte } from './render/arte';
import type { Projeto } from './tipos';
import { Menu } from './ui/Menu';
import { TelaJogo } from './ui/TelaJogo';
import './ui/estilos.css';

function App() {
  const [pronto, setPronto] = useState(false); const [jogo, setJogo] = useState<Jogo | null>(null);
  useEffect(() => { void carregarArte().then(() => setPronto(true)); }, []);
  const abrir = (p: Projeto): void => { const j = new Jogo(p); j.iniciar(); setJogo(j); (window as unknown as { __jogo?: Jogo }).__jogo = j; };
  if (!pronto) return <div className="menu"><div className="logo">CRIPCOIN</div><div className="sub">Carregando arte...</div></div>;
  if (!jogo) return <Menu abrir={abrir} />;
  return <TelaJogo jogo={jogo} sair={() => { jogo.parar(); setJogo(null); }} />;
}
createRoot(document.getElementById('raiz')!).render(<StrictMode><App /></StrictMode>);
