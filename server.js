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
    // Consulta súper simple: solo usuarios. 
    // Si esto funciona, el error 500 desaparece.
    const [entrenadores] = await db.execute(`
      SELECT id, nombre_whatsapp, experiencia 
      FROM usuarios
    `);
    
    // Agregamos la cantidad de forma manual para evitar fallos en el JOIN
    // Esto es más lento pero es a prueba de errores de SQL
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
    // 1. Obtenemos los IDs de pokemon que tiene el usuario en la BD
    const [pokesBD] = await db.execute(
      'SELECT pokemon_id, nombre FROM pokemon_atrapados WHERE usuario_id = ?', 
      [usuarioId]
    );

    // 2. Por cada uno, consultamos la PokeAPI para obtener la imagen
    // Usamos Promise.all para que sea rápido
    const pokedexDetallada = await Promise.all(pokesBD.map(async (p) => {
      try {
        const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${p.pokemon_id}`);
        const data = await response.json();
        return {
          nombre: p.nombre,
          imagen: data.sprites.front_default
        };
      } catch (e) {
        return { nombre: p.nombre, imagen: null };
      }
    }));

    res.json(pokedexDetallada);
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar Pokédex' });
  }
});

module.exports = { startServer };
