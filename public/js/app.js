const statusLabels = {
  idle: 'Desconectado',
  initializing: 'Iniciando...',
  qr: 'Esperando QR',
  authenticated: 'Autenticando...',
  ready: 'Conectado',
  stopping: 'Deteniendo...',
  disconnected: 'Desconectado',
  error: 'Error',
};

const sessionLabels = {
  idle: 'Sin vincular',
  initializing: 'Preparando sesión...',
  qr: 'Esperando escaneo',
  authenticated: 'Verificando...',
  ready: 'WhatsApp vinculado',
  stopping: 'Cerrando sesión...',
  disconnected: 'Sesión cerrada',
  error: 'Error de sesión',
};

const sidebarStatusLabels = {
  idle: 'Offline',
  initializing: 'Boot...',
  qr: 'QR',
  authenticated: 'Auth',
  ready: 'Online',
  stopping: 'Stop',
  disconnected: 'Offline',
  error: 'Error',
};

const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');
const sidebarStatus = document.getElementById('sidebarStatus');
const metricSession = document.getElementById('metricSession');
const statCommands = document.getElementById('statCommands');
const statEvents = document.getElementById('statEvents');
const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const idleState = document.getElementById('idleState');
const qrSection = document.getElementById('qrSection');
const qrImage = document.getElementById('qrImage');
const readySection = document.getElementById('readySection');
const connectionSteps = document.getElementById('connectionSteps');
const logList = document.getElementById('logList');
const btnClearLogs = document.getElementById('btnClearLogs');
const navItems = document.querySelectorAll('.nav-item');

let ws;
let localLogs = [];

function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onmessage = (event) => {
    const { event: type, data } = JSON.parse(event.data);

    if (type === 'init') {
      applyStatus(data.status, data.qrDataUrl);
      localLogs = data.logs || [];
      renderLogs();
    }

    if (type === 'status') {
      applyStatus(data.status, data.qrDataUrl);
    }

    if (type === 'log') {
      localLogs.unshift(data);
      if (localLogs.length > 100) localLogs.pop();
      renderLogs();
      updateStats();
    }
  };

  ws.onclose = () => {
    setTimeout(connectWebSocket, 2000);
  };
}

function updateConnectionSteps(status) {
  const steps = connectionSteps.querySelectorAll('.step');
  const lines = connectionSteps.querySelectorAll('.step-line');

  steps.forEach((step) => {
    step.classList.remove('active', 'done');
  });
  lines.forEach((line) => line.classList.remove('filled'));

  if (status === 'idle' || status === 'disconnected' || status === 'error') {
    return;
  }

  if (['initializing', 'qr', 'authenticated', 'ready', 'stopping'].includes(status)) {
    steps[0].classList.add('done');
    lines[0].classList.add('filled');
  }

  if (status === 'initializing') {
    steps[0].classList.add('active');
  }

  if (status === 'qr' || status === 'authenticated') {
    steps[1].classList.add('active');
    if (status === 'authenticated') {
      steps[1].classList.add('done');
      lines[1].classList.add('filled');
    }
  }

  if (status === 'ready') {
    steps.forEach((step) => step.classList.add('done'));
    lines.forEach((line) => line.classList.add('filled'));
    steps[2].classList.add('active');
  }
}

function applyStatus(status, qrDataUrl) {
  statusBadge.dataset.status = status;
  statusText.textContent = statusLabels[status] || status;
  sidebarStatus.textContent = sidebarStatusLabels[status] || status;
  metricSession.textContent = sessionLabels[status] || status;

  updateConnectionSteps(status);

  const running = ['initializing', 'qr', 'authenticated', 'ready', 'stopping'].includes(status);

  btnStart.disabled = running;
  btnStop.disabled = !running || status === 'stopping';

  idleState.classList.toggle('hidden', status !== 'idle' && status !== 'disconnected' && status !== 'error');

  if (status === 'qr' && qrDataUrl) {
    qrSection.classList.remove('hidden');
    readySection.classList.add('hidden');
    qrImage.src = qrDataUrl;
  } else if (status === 'ready') {
    qrSection.classList.add('hidden');
    readySection.classList.remove('hidden');
  } else if (status === 'initializing' || status === 'authenticated') {
    qrSection.classList.add('hidden');
    readySection.classList.add('hidden');
  } else if (!running) {
    qrSection.classList.add('hidden');
    readySection.classList.add('hidden');
  }
}

function updateStats() {
  const commands = localLogs.filter((l) => l.level === 'command').length;
  statCommands.textContent = commands;
  statEvents.textContent = localLogs.length;
}

function levelLabel(level) {
  const map = { info: 'info', warn: 'warn', error: 'error', command: 'cmd' };
  return map[level] || 'log';
}

function renderLogs() {
  updateStats();

  if (localLogs.length === 0) {
    logList.innerHTML = `
      <li class="log-empty">
        <span class="log-prefix">&gt;</span>
        Sin actividad aún. Pulsa "Iniciar bot" para comenzar.
      </li>`;
    return;
  }

  logList.innerHTML = localLogs
    .map(
      (entry) => `
    <li class="log-item" data-level="${entry.level}">
      <span class="log-prefix">&gt;</span>
      <span class="log-badge">${levelLabel(entry.level)}</span>
      <span class="log-msg"><span class="log-time">${entry.time}</span> · ${escapeHtml(entry.message)}</span>
    </li>`
    )
    .join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function apiPost(path) {
  const res = await fetch(path, { method: 'POST' });
  return res.json();
}

btnStart.addEventListener('click', async () => {
  btnStart.disabled = true;
  const result = await apiPost('/api/start');
  if (!result.ok) {
    alert(result.message);
    btnStart.disabled = false;
  }
});

btnStop.addEventListener('click', async () => {
  btnStop.disabled = true;
  await apiPost('/api/stop');
});

btnClearLogs.addEventListener('click', () => {
  localLogs = [];
  renderLogs();
});

// Busca y deja solo ESTA lógica para los clics
navItems.forEach((item) => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    navItems.forEach((n) => n.classList.remove('active'));
    item.classList.add('active');
    
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    const targetId = item.getAttribute('href').substring(1);
    const targetSection = document.getElementById(targetId);
    
    if (targetSection) targetSection.classList.remove('hidden');
    
    // Si el usuario hace clic en Entrenadores, cargamos los datos
    if (targetId === 'entrenadores') {
      loadTrainers();
    }
  });
});

connectWebSocket();

// Añade esta lógica en app.js
navItems.forEach((item) => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    navItems.forEach((n) => n.classList.remove('active'));
    item.classList.add('active');
    
    // Ocultar todos los paneles
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    // Mostrar el seleccionado
    const targetId = item.getAttribute('href').substring(1);
    document.getElementById(targetId).classList.remove('hidden');
  });
});

async function loadTrainers() {
  try {
    const res = await fetch('/api/entrenadores');
    if (!res.ok) throw new Error('Error al obtener entrenadores');
    const data = await res.json();
    const list = document.getElementById('trainerList');
    
    if (data.length === 0) {
      list.innerHTML = '<tr><td colspan="4">No hay entrenadores registrados.</td></tr>';
      return;
    }

    list.innerHTML = data.map(t => `
      <tr>
        <td>${t.nombre_whatsapp}</td>
        <td>${t.experiencia || 0} EXP</td>
        <td>${t.cantidad_pokemon || 0}</td>
        <td><button class="btn btn-ghost" onclick="viewPokedex('${t.id}')">Ver Pokédex</button></td>
      </tr>
    `).join('');
  } catch (error) {
    console.error(error);
  }
}

// NUEVO: Llamar a la función cuando el usuario haga clic en la pestaña "Entrenadores"
document.querySelector('a[href="#entrenadores"]').addEventListener('click', loadTrainers);

connectWebSocket();

// Función para abrir vista de Pokedex (puedes expandirla luego)
window.viewPokedex = function(usuarioId) {
  console.log("Consultando Pokedex del usuario:", usuarioId);
  alert("Próximamente: Verás el inventario del usuario " + usuarioId);
  // Aquí podrías hacer otro fetch a una ruta nueva, ej: /api/pokedex/${usuarioId}
};

// --- CORRECCIÓN DE LA FUNCIÓN ---
window.viewPokedex = async function(usuarioId) {
  try {
    const res = await fetch(`/api/pokedex/${usuarioId}`);
    if (!res.ok) throw new Error('No se pudo cargar la Pokédex');
    const pokemonList = await res.json();
    
    // Mostramos un alert simple por ahora para verificar que los datos llegan
    alert("Entrenador tiene " + pokemonList.length + " Pokémon registrados.");
    console.log("Pokédex:", pokemonList);
  } catch (error) {
    console.error("Error al cargar Pokedex:", error);
    alert("Error al obtener la Pokédex.");
  }
};