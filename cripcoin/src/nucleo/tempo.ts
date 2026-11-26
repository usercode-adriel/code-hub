export const MIN_DIA = 1440;
export const diaDe = (m: number): number => Math.floor(m / MIN_DIA) + 1;
export const minutoDoDia = (m: number): number => ((m % MIN_DIA) + MIN_DIA) % MIN_DIA;
export const horaTexto = (m: number): string => { const t = Math.floor(minutoDoDia(m)); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
export const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
export const diaSemana = (m: number): string => DIAS_SEMANA[(diaDe(m) - 1) % 7];
export const ehFimDeSemana = (m: number): boolean => (diaDe(m) - 1) % 7 >= 5;
