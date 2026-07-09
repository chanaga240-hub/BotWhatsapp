let state = {
  selected: new Set(),
  bracket: [],
  trainers: [],
  redemptionMatches: [],
  redemptionQueue: [],
  thirdPlaceMatch: null,
  tourneyType: 'eliminatoria',
  rrMatches: [],
  standings: [] 
};

// Referencias DOM
const trainerGrid = document.getElementById('trainerGrid');
const searchInput = document.getElementById('searchInput');
const selectedCount = document.getElementById('selectedCount');
const btnGenerate = document.getElementById('btnGenerate');
const phase1 = document.getElementById('phase1');
const phase2 = document.getElementById('phase2');
const bracketVisual = document.getElementById('bracketVisual');
const btnReset = document.getElementById('btnReset');
const tourneyTypeSelect = document.getElementById('tourneyType');

// ── SISTEMA DE GUARDADO (LOCALSTORAGE) ──
function saveTournament() {
  const dataToSave = {
    selected: Array.from(state.selected),
    bracket: state.bracket,
    redemptionMatches: state.redemptionMatches,
    redemptionQueue: state.redemptionQueue,
    thirdPlaceMatch: state.thirdPlaceMatch,
    tourneyType: state.tourneyType,
    rrMatches: state.rrMatches,
    standings: state.standings
  };
  localStorage.setItem('pokeTorneoState', JSON.stringify(dataToSave));
}

function loadTournament() {
  const saved = localStorage.getItem('pokeTorneoState');
  if (saved) {
    const data = JSON.parse(saved);
    state.selected = new Set(data.selected);
    state.bracket = data.bracket || [];
    state.redemptionMatches = data.redemptionMatches || [];
    state.redemptionQueue = data.redemptionQueue || [];
    state.thirdPlaceMatch = data.thirdPlaceMatch || null;
    state.tourneyType = data.tourneyType || 'eliminatoria';
    state.rrMatches = data.rrMatches || [];
    state.standings = data.standings || [];
    return true;
  }
  return false;
}

function clearTournament() {
  localStorage.removeItem('pokeTorneoState');
  state.selected.clear();
  state.bracket = [];
  state.redemptionMatches = [];
  state.redemptionQueue = [];
  state.thirdPlaceMatch = null;
  state.rrMatches = [];
  state.standings = [];
}

// Inicializar y obtener datos de la BD
async function loadTrainersFromDB() {
  try {
    trainerGrid.innerHTML = '<div style="padding: 1rem; color: var(--text-muted);">Cargando entrenadores de la base de datos...</div>';
    // MOCK PARA PRUEBAS: Reemplaza esto con tu fetch('/api/entrenadores') real si es necesario
    const res = await fetch('/api/entrenadores').catch(() => ({ 
      ok: true, 
      json: () => Promise.resolve([
        {id: 1, nombre_whatsapp: 'Ash', nivel: 10}, {id: 2, nombre_whatsapp: 'Misty', nivel: 9},
        {id: 3, nombre_whatsapp: 'Brock', nivel: 8}, {id: 4, nombre_whatsapp: 'Gary', nivel: 12}
      ]) 
    }));
    if (!res.ok) throw new Error('Error al obtener entrenadores');
    const data = await res.json();
    
    state.trainers = data.map(t => ({
      id: t.id.toString(),
      nombre: t.nombre_whatsapp || 'Desconocido',
      nivel: t.nivel || 1
    }));
    
    if (loadTournament() && (state.bracket.length > 0 || state.rrMatches.length > 0)) {
      updateUI();
      phase1.classList.remove('active');
      phase2.classList.add('active');
      if (state.tourneyType === 'eliminatoria') renderBracket();
      else renderRoundRobin();
    } else {
      renderTrainers();
    }
  } catch (err) {
    console.error('Error:', err);
    trainerGrid.innerHTML = '<div style="padding: 1rem; color: #f87171;">Error de conexión con el servidor.</div>';
  }
}

// Fase 1: Renderizado
function renderTrainers(filter = '') {
  trainerGrid.innerHTML = '';
  const filtered = state.trainers.filter(t => 
    t.nombre.toLowerCase().includes(filter.toLowerCase()) || 
    t.nivel.toString().includes(filter)
  );

  if (filtered.length === 0) {
    trainerGrid.innerHTML = '<div style="padding: 1rem; color: var(--text-muted);">No se encontraron entrenadores.</div>';
    return;
  }

  filtered.forEach(t => {
    const isSelected = state.selected.has(t.id);
    const card = document.createElement('div');
    card.className = `t-card ${isSelected ? 'selected' : ''}`;
    card.innerHTML = `
      <div class="t-info">
        <strong>${escapeHtml(t.nombre)}</strong>
        <span>Nivel ${t.nivel}</span>
      </div>
      <div class="t-checkbox"></div>
    `;
    
    card.addEventListener('click', () => {
      if (state.selected.has(t.id)) state.selected.delete(t.id);
      else state.selected.add(t.id);
      
      card.classList.toggle('selected');
      updateUI();
    });
    
    trainerGrid.appendChild(card);
  });
}

function updateUI() {
  selectedCount.textContent = state.selected.size;
  btnGenerate.disabled = state.selected.size < 3;
}

searchInput.addEventListener('input', (e) => renderTrainers(e.target.value));

btnGenerate.addEventListener('click', () => {
  state.tourneyType = tourneyTypeSelect ? tourneyTypeSelect.value : 'eliminatoria';
  
  if (state.tourneyType === 'eliminatoria') {
    generateBracketLogic();
  } else {
    generateRoundRobinLogic();
  }
  
  phase1.classList.remove('active');
  phase2.classList.add('active');
});

btnReset.addEventListener('click', () => {
  if (confirm('¿Estás seguro? Esto borrará el progreso del torneo actual.')) {
    clearTournament();
    updateUI();
    renderTrainers();
    phase2.classList.remove('active');
    phase1.classList.add('active');
  }
});

// ── LÓGICA TODOS CONTRA TODOS (LIGA) ──
function generateRoundRobinLogic() {
  state.rrMatches = [];
  state.standings = [];
  
  let players = Array.from(state.selected).map(id => state.trainers.find(t => t.id === id));
  
  players.forEach(p => {
    state.standings.push({ ...p, wins: 0, losses: 0, matchesPlayed: 0 });
  });

  if (players.length % 2 !== 0) {
    players.push({ id: 'bye', nombre: 'DESCANSO', nivel: 0 });
  }

  const numDays = players.length - 1;
  const halfSize = players.length / 2;
  let matchIdCounter = 1;

  for (let day = 0; day < numDays; day++) {
    let roundMatches = [];
    for (let i = 0; i < halfSize; i++) {
      const p1 = players[i];
      const p2 = players[players.length - 1 - i];

      if (p1.id !== 'bye' && p2.id !== 'bye') {
        roundMatches.push({
          id: `RR_${matchIdCounter++}`,
          p1: p1,
          p2: p2,
          winner: null
        });
      }
    }
    state.rrMatches.push(roundMatches);
    players.splice(1, 0, players.pop());
  }

  saveTournament();
  renderRoundRobin();
}

function renderRoundRobin() {
  bracketVisual.innerHTML = '';
  bracketVisual.className = '';
  bracketVisual.style.display = 'grid';
  bracketVisual.style.gridTemplateColumns = '1fr 350px'; 
  bracketVisual.style.gap = '2rem';

  const matchesSection = document.createElement('div');
  matchesSection.innerHTML = '<h3 style="color: var(--accent); margin-bottom: 1rem;">📅 Calendario de Combates</h3>';
  
  state.rrMatches.forEach((round, index) => {
    const roundDiv = document.createElement('div');
    roundDiv.style.marginBottom = '2rem';
    roundDiv.innerHTML = `<h4 style="color: var(--text-muted); margin-bottom: 0.5rem; text-transform: uppercase; font-size: 0.85rem;">Jornada ${index + 1}</h4>`;
    
    const matchesGrid = document.createElement('div');
    matchesGrid.style.display = 'grid';
    matchesGrid.style.gap = '1rem';
    
    round.forEach(match => {
      matchesGrid.appendChild(createMatchHTML(match, index, 'roundrobin'));
    });
    
    roundDiv.appendChild(matchesGrid);
    matchesSection.appendChild(roundDiv);
  });

  const standingsSection = document.createElement('div');
  standingsSection.innerHTML = '<h3 style="color: var(--accent); margin-bottom: 1rem;">📊 Clasificación</h3>';
  
  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.style.background = 'var(--bg-dark)';
  table.innerHTML = `
    <thead>
      <tr style="border-bottom: 1px solid var(--border); color: var(--text-muted); text-align: left;">
        <th style="padding: 0.5rem;">Pos</th>
        <th style="padding: 0.5rem;">Entrenador</th>
        <th style="padding: 0.5rem; text-align: center;">V</th>
        <th style="padding: 0.5rem; text-align: center;">D</th>
      </tr>
    </thead>
    <tbody>
      ${state.standings.map((p, i) => `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
          <td style="padding: 0.8rem 0.5rem; color: ${i === 0 ? 'var(--yellow)' : 'inherit'}; font-weight: ${i === 0 ? 'bold' : 'normal'};">#${i + 1}</td>
          <td style="padding: 0.8rem 0.5rem;">${escapeHtml(p.nombre)}</td>
          <td style="padding: 0.8rem 0.5rem; text-align: center; color: var(--success);">${p.wins}</td>
          <td style="padding: 0.8rem 0.5rem; text-align: center; color: var(--red);">${p.losses}</td>
        </tr>
      `).join('')}
    </tbody>
  `;
  
  standingsSection.appendChild(table);
  bracketVisual.appendChild(matchesSection);
  bracketVisual.appendChild(standingsSection);
}

function sortStandings() {
  state.standings.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    
    const headToHeadMatch = state.rrMatches.flat().find(m => 
      m.winner && 
      ((m.p1.id === a.id && m.p2.id === b.id) || (m.p1.id === b.id && m.p2.id === a.id))
    );

    if (headToHeadMatch) {
      return headToHeadMatch.winner.id === a.id ? -1 : 1;
    }
    return 0;
  });
}

// ── LÓGICA ELIMINATORIA ──
function generateBracketLogic() {
  state.redemptionMatches = [];
  state.redemptionQueue = [];
  state.thirdPlaceMatch = null;

  let players = Array.from(state.selected).map(id => state.trainers.find(t => t.id === id));
  for (let i = players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [players[i], players[j]] = [players[j], players[i]];
  }
  
  const N = players.length;
  const P = Math.pow(2, Math.floor(Math.log2(N))); 
  
  const playInCount = N - P; 
  const playInPlayers = players.slice(0, playInCount * 2);
  const byePlayers = players.slice(playInCount * 2);

  state.bracket = [];
  
  let currentRound = [];
  let nextRoundMatchesCount = P / 2;
  let round1 = [];
  let matchIdCounter = 1;

  for (let i = 0; i < playInCount; i++) {
    currentRound.push({
      id: matchIdCounter++, p1: playInPlayers[i * 2], p2: playInPlayers[i * 2 + 1], winner: null, nextMatchId: null
    });
  }
  if (currentRound.length > 0) state.bracket.push(currentRound);

  for (let i = 0; i < nextRoundMatchesCount; i++) {
    let p1 = null, p2 = null;
    if (byePlayers.length > 0) p1 = byePlayers.shift();
    if (byePlayers.length > 0) p2 = byePlayers.shift();

    round1.push({
      id: matchIdCounter++, p1: p1, p2: p2, winner: null, nextMatchId: null
    });
  }
  
  if (currentRound.length > 0) {
    let emptySlots = [];
    round1.forEach(m => {
      if (!m.p1) emptySlots.push({ match: m, slot: 'p1' });
      if (!m.p2) emptySlots.push({ match: m, slot: 'p2' });
    });
    currentRound.forEach((m, idx) => {
      m.nextMatchId = emptySlots[idx].match.id;
      m.nextMatchSlot = emptySlots[idx].slot;
    });
  }
  state.bracket.push(round1);

  let previousRound = round1;
  while (nextRoundMatchesCount > 1) {
    nextRoundMatchesCount /= 2;
    let newRound = [];
    for (let i = 0; i < nextRoundMatchesCount; i++) {
      newRound.push({ id: matchIdCounter++, p1: null, p2: null, winner: null, nextMatchId: null });
    }
    previousRound.forEach((prevMatch, idx) => {
      const nextMatchIndex = Math.floor(idx / 2);
      prevMatch.nextMatchId = newRound[nextMatchIndex].id;
      prevMatch.nextMatchSlot = idx % 2 === 0 ? 'p1' : 'p2';
    });
    state.bracket.push(newRound);
    previousRound = newRound;
  }

  saveTournament();
  renderBracket();
}

function setupThirdPlace(player) {
  if (!state.thirdPlaceMatch) {
    state.thirdPlaceMatch = { id: 'third_match', p1: player, p2: null, winner: null };
  } else {
    state.thirdPlaceMatch.p2 = player;
  }
}

function addToRedemption(player) {
  state.redemptionQueue.push(player);
  if (state.redemptionQueue.length >= 2) {
    const p1 = state.redemptionQueue.shift();
    const p2 = state.redemptionQueue.shift();
    state.redemptionMatches.push({
      id: 'R_' + Date.now() + '_' + Math.floor(Math.random() * 1000), p1: p1, p2: p2, winner: null
    });
  }
}

function renderBracket() {
  bracketVisual.innerHTML = '';
  bracketVisual.className = ''; 
  bracketVisual.style.display = 'flex';
  bracketVisual.style.flexDirection = 'column';
  bracketVisual.style.gap = '3rem'; 

  const mainSection = document.createElement('div');
  mainSection.innerHTML = '<h3 style="margin-bottom: 1rem; color: var(--blue);">🏆 Torneo Principal</h3>';
  
  const mainWrapper = document.createElement('div');
  mainWrapper.className = 'bracket-wrapper'; 
  
  state.bracket.forEach((round, roundIndex) => {
    const roundDiv = document.createElement('div');
    roundDiv.className = 'bracket-round';
    round.forEach(match => {
      const matchDiv = createMatchHTML(match, roundIndex, 'main');
      roundDiv.appendChild(matchDiv);
    });
    mainWrapper.appendChild(roundDiv);
  });
  
  mainSection.appendChild(mainWrapper);
  bracketVisual.appendChild(mainSection);

  const finalRound = state.bracket[state.bracket.length - 1];
  const finalMatch = finalRound ? finalRound[0] : null;
  if (finalMatch && finalMatch.winner) {
    const champDiv = document.createElement('div');
    champDiv.className = 'champion-banner';
    champDiv.innerHTML = `<h3>👑 CAMPEÓN DEL TORNEO: ${finalMatch.winner.nombre}</h3>`;
    bracketVisual.appendChild(champDiv);
  }

  if (state.thirdPlaceMatch) {
    const thirdSection = document.createElement('div');
    thirdSection.innerHTML = '<h3 style="margin-bottom: 1rem; color: var(--warn); padding-top: 1rem; border-top: 1px solid var(--border);">🥉 Duelo por el 3er Lugar</h3>';
    
    const thirdWrapper = document.createElement('div');
    thirdWrapper.className = 'bracket-round'; 
    thirdWrapper.appendChild(createMatchHTML(state.thirdPlaceMatch, 0, 'third'));
    
    thirdSection.appendChild(thirdWrapper);
    bracketVisual.appendChild(thirdSection);
  }

  if (state.redemptionMatches.length > 0 || state.redemptionQueue.length > 0) {
    const redSection = document.createElement('div');
    redSection.innerHTML = `
      <div style="border-top: 1px solid var(--border); padding-top: 2rem;">
        <h3 style="color: var(--red); margin-bottom: 0.5rem;">🔥 Arena de Redención</h3>
        <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1.5rem;">El ganador de cada duelo sobrevive y vuelve a la cola.</p>
      </div>
    `;
    
    const redemptionWrapper = document.createElement('div');
    redemptionWrapper.style.display = 'flex';
    redemptionWrapper.style.flexWrap = 'wrap';
    redemptionWrapper.style.gap = '2rem';

    state.redemptionMatches.forEach((match, index) => {
      const matchGroup = document.createElement('div');
      matchGroup.style.display = 'flex';
      matchGroup.style.flexDirection = 'column';
      matchGroup.style.alignItems = 'center';
      matchGroup.style.gap = '0.5rem';

      const label = document.createElement('span');
      label.style.fontSize = '0.8rem';
      label.style.color = 'var(--text-muted)';
      label.style.fontWeight = 'bold';
      label.style.textTransform = 'uppercase';
      label.innerText = `Duelo #${index + 1}`;

      matchGroup.appendChild(label);
      matchGroup.appendChild(createMatchHTML(match, 0, 'redemption'));
      redemptionWrapper.appendChild(matchGroup);
    });
    redSection.appendChild(redemptionWrapper);

    if (state.redemptionQueue.length > 0) {
      const queueDiv = document.createElement('div');
      queueDiv.style.marginTop = '1.5rem';
      queueDiv.style.padding = '0.8rem';
      queueDiv.style.background = 'rgba(255, 210, 63, 0.1)';
      queueDiv.style.border = '1px solid rgba(255, 210, 63, 0.3)';
      queueDiv.style.borderRadius = '8px';
      queueDiv.style.color = 'var(--yellow)';
      queueDiv.style.fontSize = '0.9rem';
      
      const waitingNames = state.redemptionQueue.map(p => p.nombre).join(', ');
      queueDiv.innerHTML = `⏳ <strong>En sala de espera:</strong> ${waitingNames} (Esperando rival)`;
      redSection.appendChild(queueDiv);
    }
    bracketVisual.appendChild(redSection);
  }
}

// ── UTILERÍA CONJUNTA ──
function createMatchHTML(match, roundIndex, matchType) {
  const matchDiv = document.createElement('div');
  matchDiv.className = 'match-box';
  
  const p1Class = match.winner && match.winner.id === (match.p1 && match.p1.id) ? 'winner' : (!match.p1 ? 'empty' : '');
  const p2Class = match.winner && match.winner.id === (match.p2 && match.p2.id) ? 'winner' : (!match.p2 ? 'empty' : '');

  const onclickP1 = match.p1 ? `onclick="setWinner(${roundIndex}, '${match.id}', 'p1', '${matchType}')"` : '';
  const onclickP2 = match.p2 ? `onclick="setWinner(${roundIndex}, '${match.id}', 'p2', '${matchType}')"` : '';

  matchDiv.innerHTML = `
    <div class="match-player ${p1Class}" ${onclickP1}>
      <span>${match.p1 ? escapeHtml(match.p1.nombre) : 'TBD'}</span>
      ${match.p1 ? `<small>Lvl ${match.p1.nivel}</small>` : ''}
    </div>
    <div class="match-player ${p2Class}" ${onclickP2}>
      <span>${match.p2 ? escapeHtml(match.p2.nombre) : 'TBD'}</span>
      ${match.p2 ? `<small>Lvl ${match.p2.nivel}</small>` : ''}
    </div>
  `;
  return matchDiv;
}

// Procesador central: Maneja asignar y DESMARCAR para todos los tipos de torneos
window.setWinner = function(roundIndex, matchId, playerSlot, matchType = 'main') {
  let match, winnerPlayer, loserPlayer;

  if (matchType === 'main') match = state.bracket[roundIndex].find(m => m.id.toString() === matchId.toString());
  else if (matchType === 'third') match = state.thirdPlaceMatch;
  else if (matchType === 'redemption') match = state.redemptionMatches.find(m => m.id.toString() === matchId.toString());
  else if (matchType === 'roundrobin') match = state.rrMatches[roundIndex].find(m => m.id.toString() === matchId.toString());

  if (!match) return;

  // ── LÓGICA DE DESMARCAR (UNDO) ──
  if (match.winner) {
    if (match.winner.id !== match[playerSlot].id) {
      alert("Para cambiar de ganador, primero haz clic sobre el ganador actual para desmarcarlo.");
      return;
    }

    if (matchType === 'roundrobin') {
      const pWinner = match.winner;
      const pLoser = match.winner.id === match.p1.id ? match.p2 : match.p1;
      
      const wStats = state.standings.find(p => p.id === pWinner.id);
      const lStats = state.standings.find(p => p.id === pLoser.id);
      
      if (wStats) { wStats.wins -= 1; wStats.matchesPlayed -= 1; }
      if (lStats) { lStats.losses -= 1; lStats.matchesPlayed -= 1; }
      
      match.winner = null;
      sortStandings();
      saveTournament();
      renderRoundRobin();
      return;
    }

    if (matchType === 'main') {
      const isSemifinal = (roundIndex === state.bracket.length - 2);
      loserPlayer = match[playerSlot === 'p1' ? 'p2' : 'p1'];

      if (match.nextMatchId !== null) {
        const nextRound = state.bracket[roundIndex + 1];
        const nextMatch = nextRound.find(m => m.id.toString() === match.nextMatchId.toString());
        if (nextMatch && nextMatch.winner) {
          alert("No puedes desmarcar aquí. El ganador ya peleó en la siguiente ronda. Desmarca esa ronda primero.");
          return;
        }
      }

      if (loserPlayer) {
        if (isSemifinal && state.thirdPlaceMatch && state.thirdPlaceMatch.winner) {
          alert("No puedes desmarcar. El perdedor de esta ronda ya peleó por el 3er lugar. Desmarca el 3er lugar primero.");
          return;
        } else if (!isSemifinal) {
          const redMatch = state.redemptionMatches.find(m => (m.p1 && m.p1.id === loserPlayer.id) || (m.p2 && m.p2.id === loserPlayer.id));
          if (redMatch && redMatch.winner) {
            alert("No puedes desmarcar. El perdedor de esta ronda ya peleó en la Arena de Redención. Desmarca ese duelo primero.");
            return;
          }
        }
      }

      match.winner = null;
      if (match.nextMatchId !== null) {
        const nextRound = state.bracket[roundIndex + 1];
        const nextMatch = nextRound.find(m => m.id.toString() === match.nextMatchId.toString());
        if (nextMatch) nextMatch[match.nextMatchSlot] = null;
      }
      
      if (loserPlayer) {
        if (isSemifinal) {
          if (state.thirdPlaceMatch.p1 && state.thirdPlaceMatch.p1.id === loserPlayer.id) state.thirdPlaceMatch.p1 = null;
          if (state.thirdPlaceMatch.p2 && state.thirdPlaceMatch.p2.id === loserPlayer.id) state.thirdPlaceMatch.p2 = null;
        } else {
          const qIndex = state.redemptionQueue.findIndex(p => p.id === loserPlayer.id);
          if (qIndex !== -1) {
            state.redemptionQueue.splice(qIndex, 1);
          } else {
            const mIndex = state.redemptionMatches.findIndex(m => (m.p1 && m.p1.id === loserPlayer.id) || (m.p2 && m.p2.id === loserPlayer.id));
            if (mIndex !== -1) {
              const rMatch = state.redemptionMatches[mIndex];
              const other = (rMatch.p1 && rMatch.p1.id === loserPlayer.id) ? rMatch.p2 : rMatch.p1;
              state.redemptionMatches.splice(mIndex, 1);
              if (other) state.redemptionQueue.unshift(other);
            }
          }
        }
      }
    } else if (matchType === 'third') {
      match.winner = null;
    } else if (matchType === 'redemption') {
      const pWinner = match.winner;
      const inQueueIdx = state.redemptionQueue.findIndex(p => p.id === pWinner.id);
      
      if (inQueueIdx === -1) {
        const inAnotherMatch = state.redemptionMatches.find(m => m.id !== match.id && ((m.p1 && m.p1.id === pWinner.id) || (m.p2 && m.p2.id === pWinner.id)));
        if (inAnotherMatch) {
          alert("No puedes desmarcar. Este ganador ya avanzó a otro duelo de redención posterior.");
          return;
        }
      } else {
        state.redemptionQueue.splice(inQueueIdx, 1);
      }
      match.winner = null;
    }

    saveTournament();
    renderBracket();
    return;
  }

  // ── LÓGICA DE MARCAR GANADOR ──
  winnerPlayer = match[playerSlot];
  loserPlayer = match[playerSlot === 'p1' ? 'p2' : 'p1'];
  match.winner = winnerPlayer;

  if (matchType === 'roundrobin') {
    const wStats = state.standings.find(p => p.id === winnerPlayer.id);
    const lStats = state.standings.find(p => p.id === loserPlayer.id);
    
    wStats.wins += 1;
    wStats.matchesPlayed += 1;
    lStats.losses += 1;
    lStats.matchesPlayed += 1;

    sortStandings();
    saveTournament();
    renderRoundRobin();
    return;
  }

  if (matchType === 'main') {
    if (match.nextMatchId !== null) {
      const nextRound = state.bracket[roundIndex + 1];
      const nextMatch = nextRound.find(m => m.id.toString() === match.nextMatchId.toString());
      if (nextMatch) nextMatch[match.nextMatchSlot] = winnerPlayer;
    }
    if (loserPlayer) {
      const isSemifinal = (roundIndex === state.bracket.length - 2);
      if (isSemifinal) setupThirdPlace(loserPlayer);
      else addToRedemption(loserPlayer);
    }
  } else if (matchType === 'redemption') {
    addToRedemption(winnerPlayer);
  }

  saveTournament();
  renderBracket();
}

function escapeHtml(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Iniciar aplicación
loadTrainersFromDB();