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
let dynamicItems = [];

// =====================================
// ESTADOS GLOBALES DE LA WEB
// =====================================
window.giftCart = {}; 
window.currentPokedex = []; // Guarda la Pokédex cargada para filtrar rápidamente

async function loadDynamicItems() {
  try {
    const res = await fetch('/api/inventario-campos');
    if (res.ok) {
      dynamicItems = await res.json();
    }
  } catch (e) {
    console.error('Error cargando lista de objetos:', e);
  }
}

loadDynamicItems();

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

navItems.forEach((item) => {
  item.addEventListener('click', (e) => {
    const href = item.getAttribute('href');
    
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

// =====================================
// MANEJO DEL CARRITO DE REGALOS
// =====================================
window.addToGiftCart = function(usuarioId) {
  const item = document.getElementById(`giveItemSelect_${usuarioId}`).value;
  const amount = parseInt(document.getElementById(`giveItemAmount_${usuarioId}`).value);

  if (isNaN(amount) || amount <= 0) return;

  if (window.giftCart[item]) {
    window.giftCart[item] += amount;
  } else {
    window.giftCart[item] = amount;
  }

  renderGiftCart(usuarioId);
};

window.removeFromGiftCart = function(item, usuarioId) {
  delete window.giftCart[item];
  renderGiftCart(usuarioId);
};

window.renderGiftCart = function(usuarioId) {
  const container = document.getElementById(`giftCartContainer_${usuarioId}`);
  if(!container) return;
  
  const items = Object.keys(window.giftCart);

  if (items.length === 0) {
    container.innerHTML = '<em>El paquete está vacío...</em>';
    return;
  }

  container.innerHTML = items.map(item => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.25rem 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
      <span><strong style="color: var(--accent-cyan);">${window.giftCart[item]}x</strong> ${item.toUpperCase().replace(/_/g, ' ')}</span>
      <button onclick="removeFromGiftCart('${item}', ${usuarioId})" style="background: transparent; border: none; color: var(--red); cursor: pointer;">❌</button>
    </div>
  `).join('');
};

window.sendGiftPackage = async function(usuarioId, nombreEntrenador) {
  const items = Object.keys(window.giftCart);
  if (items.length === 0) {
    alert('Agrega al menos un objeto al paquete antes de enviar.');
    return;
  }

  if (!confirm(`¿Estás seguro de que quieres enviar este paquete a ${nombreEntrenador}? Se notificará al jugador por WhatsApp inmediatamente.`)) {
    return;
  }

  try {
    const payload = items.map(key => ({
      item: key,
      cantidad: window.giftCart[key]
    }));

    const res = await fetch('/api/give-package', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuarioId, paquete: payload })
    });
    
    const data = await res.json();
    
    if (data.success) {
      alert('¡Paquete enviado exitosamente y notificación de WhatsApp despachada!');
      window.giftCart = {}; 
      viewPokedex(usuarioId, nombreEntrenador);
      loadTrainers();
    } else {
      alert('Error del servidor: ' + data.error);
    }
  } catch (err) {
    alert('Error crítico de conexión al enviar el paquete.');
  }
};

// =====================================
// MANEJO DE VISTA DE POKEDEX (CON FILTROS)
// =====================================

window.renderPokedexGrid = function() {
  const container = document.getElementById('pokedexGridContainer');
  if (!container) return;

  const typeFilter = document.getElementById('filterType').value;
  const sortBy = document.getElementById('sortBy').value;

  // Clonamos el array original para no modificar los datos base
  let filteredList = [...window.currentPokedex];

  // 1. Filtrar por Tipo
  if (typeFilter !== 'all') {
    filteredList = filteredList.filter(p => p.tipos && p.tipos.includes(typeFilter));
  }

  // Helper para buscar stat rápido
  const getStat = (poke, statName) => {
    const s = poke.stats.find(st => st.name === statName);
    return s ? s.value : 0;
  };

  // 2. Aplicar el orden
  filteredList.sort((a, b) => {
    if (sortBy === 'team') {
      if (a.estaEnEquipo === b.estaEnEquipo) return (b.nivel || 1) - (a.nivel || 1);
      return a.estaEnEquipo ? -1 : 1;
    }
    if (sortBy === 'level') return (b.nivel || 1) - (a.nivel || 1);
    if (sortBy === 'hp') return getStat(b, 'hp') - getStat(a, 'hp');
    if (sortBy === 'attack') return getStat(b, 'attack') - getStat(a, 'attack');
    if (sortBy === 'defense') return getStat(b, 'defense') - getStat(a, 'defense');
    if (sortBy === 'special-attack') return getStat(b, 'special-attack') - getStat(a, 'special-attack');
    if (sortBy === 'special-defense') return getStat(b, 'special-defense') - getStat(a, 'special-defense');
    if (sortBy === 'speed') return getStat(b, 'speed') - getStat(a, 'speed');
    return 0;
  });

  const statNames = {
    hp: 'HP',
    attack: 'Attack',
    defense: 'Defense',
    'special-attack': 'Sp. Atk',
    'special-defense': 'Sp. Def',
    speed: 'Speed',
  };

  if (filteredList.length === 0) {
    container.innerHTML = `<div style="grid-column: 1 / -1; padding: 2rem; text-align: center; color: var(--text-muted);">No se encontraron Pokémon con esos filtros.</div>`;
    return;
  }

  // 3. Renderizar el HTML al contenedor
  container.innerHTML = filteredList.map(poke => `
    <article class="pokedex-card ${poke.estaEnEquipo ? 'pokedex-card-team' : ''}">
      <div class="pokedex-card-img">
        <img src="/imagenes/${poke.pokemon_id}.png" alt="${escapeHtml(poke.nombre)}" loading="lazy" onerror="this.onerror=null;this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png'">
      </div>
      <div class="pokedex-card-body">
        <div class="pokedex-card-header">
          <strong>${escapeHtml(poke.nombre)} - ${poke.pokemon_id}</strong>
          <div class="pokedex-card-meta">
            ${poke.estaEnEquipo ? `<span class="badge badge-success">Equipo #${poke.jerarquia || '-'}</span>` : ''}
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
  `).join('');
};

window.viewPokedex = async function(usuarioId, nombre) {
  const detailPanel = document.getElementById('trainerDetail');
  try {
    detailPanel.classList.remove('hidden');
    detailPanel.innerHTML = '<div class="detail-loading">Cargando Pokédex...</div>';
    
    // Limpiamos el carrito al abrir a un nuevo usuario
    window.giftCart = {};

    const res = await fetch(`/api/pokedex/${usuarioId}`);
    if (!res.ok) throw new Error('No se pudo cargar la Pokédex');
    const data = await res.json();
    const usuario = data.usuario || {};
    
    // Guardar los Pokémon en variable global para filtrar sin tener que consultar a la DB
    window.currentPokedex = data.pokedex || [];

    const optionsHtml = dynamicItems.map(c => `<option value="${c}">${c.toUpperCase().replace(/_/g, ' ')}</option>`).join('');

    const regalarHtml = `
      <div style="margin-top: 1rem; padding: 1rem; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid var(--border);">
        <h4 style="margin-bottom: 0.8rem; font-size: 0.95rem; color: var(--warn);">🎁 Crear Paquete de Regalo</h4>
        
        <div style="display: flex; gap: 0.5rem; align-items: center; margin-bottom: 1rem;">
          <select id="giveItemSelect_${usuario.id}" style="flex: 1; padding: 0.5rem; border-radius: 6px; background: #0f172a; color: white; border: 1px solid var(--border); outline: none;">
            ${optionsHtml}
          </select>
          <input type="number" id="giveItemAmount_${usuario.id}" min="1" value="1" style="width: 80px; padding: 0.5rem; border-radius: 6px; background: #0f172a; color: white; border: 1px solid var(--border); outline: none;">
          <button onclick="addToGiftCart(${usuario.id})" class="btn btn-secondary" style="padding: 0.5rem 1rem; font-size: 0.85rem;">➕ Agregar</button>
        </div>

        <div id="giftCartContainer_${usuario.id}" style="background: rgba(0,0,0,0.2); padding: 0.5rem; border-radius: 6px; margin-bottom: 1rem; min-height: 40px; font-size: 0.85rem; color: var(--text-muted);">
          <em>El paquete está vacío...</em>
        </div>

        <div style="text-align: right;">
          <button onclick="sendGiftPackage(${usuario.id}, '${escapeAttribute(usuario.nombre_whatsapp || nombre)}')" class="btn btn-primary" style="padding: 0.5rem 1.5rem; font-size: 0.85rem; width: 100%;">📦 Enviar Paquete por WhatsApp</button>
        </div>
      </div>
    `;

    if (!Array.isArray(window.currentPokedex) || window.currentPokedex.length === 0) {
      detailPanel.innerHTML = `
      <div class="trainer-detail-head">
        <div>
          <span class="detail-tag">Entrenador</span>
          <h3>${escapeHtml(usuario.nombre_whatsapp || nombre || 'Entrenador')}</h3>
          <p>0 Pokémon en la Pokédex</p>
        </div>
        <div class="trainer-detail-stats">
          <span class="badge">Nivel ${usuario.nivel || 1}</span>
          <span class="badge">${usuario.experiencia || 0} EXP</span>
          <span class="badge badge-soft">${usuario.pokeballs || 0} Pokéballs</span>
        </div>
      </div>
      
      ${regalarHtml}

        <div class="detail-empty">
          <p><strong>${escapeHtml(usuario.nombre_whatsapp || nombre || 'Entrenador')}</strong> no tiene Pokémon registrados.</p>
        </div>
      `;
      return;
    }

    // Cabecera principal
    detailPanel.innerHTML = `
      <div class="trainer-detail-head">
        <div>
          <span class="detail-tag">Entrenador</span>
          <h3>${escapeHtml(usuario.nombre_whatsapp || nombre || 'Entrenador')}</h3>
          <p>${window.currentPokedex.length} Pokémon en la Pokédex</p>
        </div>
        <div class="trainer-detail-stats">
          <span class="badge">Nivel ${usuario.nivel || 1}</span>
          <span class="badge">${usuario.experiencia || 0} EXP</span>
          <span class="badge badge-soft">${usuario.pokeballs || 0} Pokéballs</span>
        </div>
      </div>
      
      ${regalarHtml}

      <!-- PANEL DE FILTROS -->
      <div style="display: flex; gap: 0.8rem; margin: 1.5rem 0 1rem; flex-wrap: wrap;">
        <select id="filterType" onchange="renderPokedexGrid()" style="padding: 0.5rem; background: #0f172a; color: white; border: 1px solid var(--border); border-radius: 6px; outline: none;">
          <option value="all">🔘 Todos los Tipos</option>
          <option value="normal">Normal</option>
          <option value="fire">Fuego</option>
          <option value="water">Agua</option>
          <option value="grass">Planta</option>
          <option value="electric">Eléctrico</option>
          <option value="ice">Hielo</option>
          <option value="fighting">Lucha</option>
          <option value="poison">Veneno</option>
          <option value="ground">Tierra</option>
          <option value="flying">Volador</option>
          <option value="psychic">Psíquico</option>
          <option value="bug">Bicho</option>
          <option value="rock">Roca</option>
          <option value="ghost">Fantasma</option>
          <option value="dragon">Dragón</option>
          <option value="dark">Siniestro</option>
          <option value="steel">Acero</option>
          <option value="fairy">Hada</option>
        </select>
        
        <select id="sortBy" onchange="renderPokedexGrid()" style="padding: 0.5rem; background: #0f172a; color: white; border: 1px solid var(--border); border-radius: 6px; outline: none;">
          <option value="team">⭐ Orden: Equipo primero</option>
          <option value="level">⬆️ Mayor Nivel</option>
          <option value="hp">❤️ Mayor Vida (HP)</option>
          <option value="attack">⚔️ Mayor Ataque</option>
          <option value="defense">🛡️ Mayor Defensa</option>
          <option value="special-attack">💥 Mayor Atk. Esp.</option>
          <option value="special-defense">🔰 Mayor Def. Esp.</option>
          <option value="speed">⚡ Mayor Velocidad</option>
        </select>
      </div>

      <!-- CONTENEDOR DONDE SE PINTARÁ LA POKEDEX -->
      <div id="pokedexGridContainer" class="pokedex-grid"></div>
    `;

    // Ejecutamos la función por primera vez para pintar los datos
    renderPokedexGrid();

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

window.addEventListener('load', () => {
  setTimeout(() => {
    if (btnStart && !btnStart.disabled) {
      btnStart.click();
      console.log("Clic automático ejecutado en 'Iniciar bot'");
    }
  }, 3000); 
});