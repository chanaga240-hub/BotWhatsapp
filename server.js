const db = require('./services/database');

const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const bot = require('./services/bot');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const clients = new Set();

function broadcast(event, data) {
  const payload = JSON.stringify({ event, data });
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(payload);
    }
  }
}

bot.on('status', (data) => broadcast('status', data));
bot.on('log', (entry) => broadcast('log', entry));

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ event: 'init', data: bot.getState() }));

  ws.on('close', () => clients.delete(ws));
});

app.get('/api/status', (_req, res) => {
  res.json(bot.getState());
});

app.post('/api/start', async (_req, res) => {
  if (bot.isRunning()) {
    return res.status(409).json({ ok: false, message: 'El bot ya está en ejecución.' });
  }

  bot.start().catch((err) => {
    bot.log(`Error inesperado: ${err.message}`, 'error');
  });

  res.json({ ok: true, message: 'Bot iniciando...' });
});

app.post('/api/stop', async (_req, res) => {
  await bot.stop();
  res.json({ ok: true, message: 'Bot detenido.' });
});

function startServer() {
  server.listen(PORT, () => {
    console.log(`\n🌐 Panel web: http://localhost:${PORT}`);
    console.log('   Abre esa URL en el navegador para controlar el bot.\n');
  });
}

process.on('SIGINT', async () => {
  console.log('\nCerrando servidor...');
  await bot.stop();
  server.close(() => process.exit(0));
});

app.get('/api/entrenadores', async (req, res) => {
  try {
    const [entrenadores] = await db.execute(`
      SELECT id, nombre_whatsapp, experiencia, nivel, pokeballs
      FROM usuarios
    `);

    for (let u of entrenadores) {
      const [pokes] = await db.execute('SELECT COUNT(*) as total FROM pokemon_atrapados WHERE usuario_id = ?', [u.id]);
      u.cantidad_pokemon = pokes[0].total;
    }

    res.json(entrenadores);
  } catch (err) {
    console.error('ERROR EN SQL:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/pokedex/:usuarioId', async (req, res) => {
  const { usuarioId } = req.params;
  try {
    const [usuarioRows] = await db.execute(
      'SELECT id, nombre_whatsapp, experiencia, nivel, pokeballs FROM usuarios WHERE id = ?',
      [usuarioId]
    );

    if (!usuarioRows.length) {
      return res.status(404).json({ error: 'Entrenador no encontrado' });
    }

    const usuario = usuarioRows[0];
    const [pokesBD] = await db.execute(
      'SELECT pokemon_id, nombre, nivel, experiencia FROM pokemon_atrapados WHERE usuario_id = ?',
      [usuarioId]
    );

    const pokedexDetallada = await Promise.all(pokesBD.map(async (p) => {
      try {
        const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${p.pokemon_id}`);
        const data = await response.json();

        return {
          nombre: p.nombre,
          imagen: data.sprites?.front_default || data.sprites?.other?.['official-artwork']?.front_default || null,
          nivel: p.nivel || 1,
          pokemon_id: p.pokemon_id,
          experiencia: p.experiencia || 0,
          stats: data.stats.map((stat) => ({
            name: stat.stat.name,
            value: stat.base_stat
          })),
          tipos: data.types.map((typeSlot) => typeSlot.type.name)
        };
      } catch (e) {
        return {
          nombre: p.nombre,
          imagen: null,
          nivel: p.nivel || 1,
          experiencia: p.experiencia || 0,
          stats: [],
          tipos: []
        };
      }
    }));

    res.json({ usuario, pokedex: pokedexDetallada });
  } catch (err) {
    console.error('ERROR EN POKEDEX:', err);
    res.status(500).json({ error: 'Error al consultar Pokédex' });
  }
});

module.exports = { startServer };
