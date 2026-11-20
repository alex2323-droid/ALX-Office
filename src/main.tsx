import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { getClientConfigError } from './lib/configValidation';
import './index.css';

const rootEl = document.getElementById('root')!;
const configError = getClientConfigError();

if (configError) {
  rootEl.innerHTML = '';
  const container = document.createElement('div');
  container.className =
    'flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100';
  const card = document.createElement('div');
  card.className =
    'max-w-md rounded-2xl border border-rose-800/60 bg-slate-900 p-6 shadow-xl';
  const title = document.createElement('h1');
  title.className = 'text-lg font-bold text-rose-400';
  title.textContent = 'Error de configuración';
  const message = document.createElement('p');
  message.className = 'mt-2 text-sm text-slate-300';
  message.textContent = configError;
  card.append(title, message);
  container.append(card);
  rootEl.append(container);
} else {
  registerSW({ immediate: true });
  import('./App.tsx').then(({ default: App }) => {
    createRoot(rootEl).render(<App />);
  });
}
