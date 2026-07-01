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

// Navegación de secciones
navItems.forEach((item) => {
  item.addEventListener('click', (e) => {
    const href = item.getAttribute('href');
    
    // Si el enlace NO empieza con "#" (ej. "/torneos.html"), permitimos que cambie de página
    if (!href.startsWith('#')) {
      return; 
    }

    e.preventDefault();
    navItems.forEach((n) => n.classList.remove('active'));
    item.classList.add('active');

    document.querySelectorAll('section').forEach((s) => s.classList.add('hidden'));
    const targetId = href.substring(1);
    const targetSection = document.getElementById(targetId);
    if (targetSection) targetSection.classList.remove('hidden');

    if (targetId === 'entrenadores') {
      loadTrainers();
    }
  });
});

connectWebSocket();

async function loadTrainers() {
  try {
    const res = await fetch('/api/entrenadores');
    if (!res.ok) throw new Error('Error al obtener entrenadores');
    const data = await res.json();
    const list = document.getElementById('trainerList');
    const count = document.getElementById('trainerCount');

    if (!data || data.length === 0) {
      list.innerHTML = '<div class="trainer-empty">No hay entrenadores registrados.</div>';
      count.textContent = '0';
      return;
    }

    count.textContent = data.length;
    list.innerHTML = data
      .map((t) => `
        <button class="trainer-card" type="button" data-trainer-id="${t.id}" data-trainer-name="${escapeAttribute(t.nombre_whatsapp)}">
          <div class="trainer-card-info">
            <strong>${escapeHtml(t.nombre_whatsapp)}</strong>
            <span>${t.cantidad_pokemon || 0} Pokémon</span>
          </div>
          <div class="trainer-card-meta">
            <span class="badge">${t.experiencia || 0} EXP</span>
            <span class="badge badge-soft">Nivel ${t.nivel || 1}</span>
          </div>
        </button>
      `)
      .join('');

    list.querySelectorAll('.trainer-card').forEach((button) => {
      button.addEventListener('click', () => {
        viewPokedex(button.dataset.trainerId, button.dataset.trainerName);
      });
    });
  } catch (error) {
    console.error(error);
  }
}

window.viewPokedex = async function(usuarioId, nombre) {
  const detailPanel = document.getElementById('trainerDetail');
  try {
    detailPanel.classList.remove('hidden');
    detailPanel.innerHTML = '<div class="detail-loading">Cargando Pokédex...</div>';

    const res = await fetch(`/api/pokedex/${usuarioId}`);
    if (!res.ok) throw new Error('No se pudo cargar la Pokédex');
    const data = await res.json();
    const usuario = data.usuario || {};
    const pokemonList = data.pokedex || [];

    if (!Array.isArray(pokemonList) || pokemonList.length === 0) {
      detailPanel.innerHTML = `
        <div class="detail-empty">
          <p><strong>${escapeHtml(usuario.nombre_whatsapp || nombre || 'Entrenador')}</strong> no tiene Pokémon registrados.</p>
        </div>
      `;
      return;
    }

    const statNames = {
      hp: 'HP',
      attack: 'Attack',
      defense: 'Defense',
      'special-attack': 'Sp. Atk',
      'special-defense': 'Sp. Def',
      speed: 'Speed',
    };

    detailPanel.innerHTML = `
      <div class="trainer-detail-head">
        <div>
          <span class="detail-tag">Entrenador</span>
          <h3>${escapeHtml(usuario.nombre_whatsapp || nombre || 'Entrenador')}</h3>
          <p>${pokemonList.length} Pokémon en la Pokédex</p>
        </div>
        <div class="trainer-detail-stats">
          <span class="badge">Nivel ${usuario.nivel || 1}</span>
          <span class="badge">${usuario.experiencia || 0} EXP</span>
          <span class="badge badge-soft">${usuario.pokeballs || 0} Pokéballs</span>
        </div>
      </div>
      <div class="pokedex-grid">
        ${pokemonList
          .map((poke) => `
            <article class="pokedex-card">
              <div class="pokedex-card-img">
                <img src="${poke.imagen || 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png'}" alt="${escapeHtml(poke.nombre)}" loading="lazy">
              </div>
              <div class="pokedex-card-body">
                <div class="pokedex-card-header">
                  <strong>${escapeHtml(poke.nombre)} - ${poke.pokemon_id}</strong>
                  <div class="pokedex-card-meta">
                    <span>Nivel ${poke.nivel || 1}</span>
                    <span>${poke.experiencia != null ? `${poke.experiencia} EXP` : '—'}</span>
                  </div>
                </div>
                <div class="pokedex-card-stats">
                  ${poke.stats
                    .slice(0, 6)
                    .map((stat) => `
                      <div class="stat-item">
                        <span class="stat-label">${escapeHtml(statNames[stat.name] || stat.name)}</span>
                        <span class="stat-value">${stat.value}</span>
                      </div>
                    `)
                    .join('')}
                </div>
                <div class="pokedex-card-types">
                  ${poke.tipos.map((type) => `<span class="type-pill type-${escapeHtml(type)}">${escapeHtml(type)}</span>`).join('')}
                </div>
              </div>
            </article>
          `)
          .join('')}
      </div>
    `;
  } catch (error) {
    console.error('Error al cargar Pokedex:', error);
    detailPanel.innerHTML = `
      <div class="detail-empty">
        <p>Error al obtener la Pokédex de <strong>${escapeHtml(nombre || 'Entrenador')}</strong>.</p>
      </div>
    `;
  }
};

function escapeHtml(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttribute(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

