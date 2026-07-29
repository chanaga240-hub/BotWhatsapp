const db = require('./services/database');
const { consultarPokemon, getImagen } = require('./services/pokeapi');

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
app.use('/imagenes', express.static(path.join(__dirname, 'imagenes')));

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
      `SELECT pa.pokemon_id, pa.nombre, pa.nivel, pa.experiencia, ep.jerarquia
       FROM pokemon_atrapados pa
       LEFT JOIN equipo_pokemon ep ON ep.pokemon_id = pa.id AND ep.usuario_id = ?
       WHERE pa.usuario_id = ?`,
      [usuarioId, usuarioId]
    );

    const pokedexDetallada = await Promise.all(pokesBD.map(async (p) => {
      try {
        const data = await consultarPokemon(p.pokemon_id);
        const imagen = getImagen(data);
        
        const nivelActual = p.nivel || 1;
        const multNivel = 1 + (nivelActual - 1) * 0.05;

        const stats = Array.isArray(data.stats)
          ? data.stats.map((stat) => {
              const statName = stat?.stat?.name || 'unknown';
              const baseValue = stat?.base_stat || 0;
              let finalValue = baseValue;

              if (statName === 'hp') {
                finalValue = Math.floor(baseValue * 2 * multNivel);
              } else if (statName === 'speed') {
                finalValue = Math.floor(baseValue);
              } else {
                finalValue = Math.floor(baseValue * multNivel);
              }

              return {
                name: statName,
                value: finalValue
              };
            })
          : [];

        const tipos = Array.isArray(data.types)
          ? data.types.map((typeSlot) => typeSlot?.type?.name || 'unknown')
          : [];

        return {
          nombre: p.nombre,
          imagen: imagen || null,
          nivel: p.nivel || 1,
          pokemon_id: p.pokemon_id,
          experiencia: p.experiencia || 0,
          stats,
          tipos,
          estaEnEquipo: !!p.jerarquia,
          jerarquia: p.jerarquia || null
        };
      } catch (e) {
        return {
          nombre: p.nombre,
          imagen: null,
          nivel: p.nivel || 1,
          pokemon_id: p.pokemon_id,
          experiencia: p.experiencia || 0,
          stats: [],
          tipos: [],
          estaEnEquipo: !!p.jerarquia,
          jerarquia: p.jerarquia || null
        };
      }
    }));

    res.json({ usuario, pokedex: pokedexDetallada });
  } catch (err) {
    console.error('ERROR EN POKEDEX:', err);
    res.status(500).json({ error: 'Error al consultar Pokédex' });
  }
});

app.get('/api/inventario-campos', async (req, res) => {
  try {
    const [columns] = await db.execute("SHOW COLUMNS FROM inventario");
    const inventarioCampos = columns
      .map(col => col.Field)
      .filter(field => field !== 'id' && field !== 'usuario_id');

    const todosLosCampos = ['monedas', 'pokeballs', ...inventarioCampos];
    res.json(todosLosCampos);
  } catch (err) {
    console.error('Error al obtener columnas de inventario:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================================
// NUEVO: ENVIAR PAQUETE MULTIPLE CON AVISO POR WHATSAPP
// ==========================================================
app.post('/api/give-package', async (req, res) => {
  const { usuarioId, paquete } = req.body;

  if (!usuarioId || !Array.isArray(paquete) || paquete.length === 0) {
    return res.status(400).json({ error: 'Parámetros de entrega inválidos' });
  }

  const connection = await db.getConnection();
  let whatsappId = null;

  try {
    await connection.beginTransaction();

    // 1. Obtener whatsapp_id del usuario
    const [userRows] = await connection.execute('SELECT whatsapp_id FROM usuarios WHERE id = ?', [usuarioId]);
    if (userRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    whatsappId = userRows[0].whatsapp_id;

    const [columns] = await connection.execute("SHOW COLUMNS FROM inventario");
    const validFields = columns.map(col => col.Field);

    const [invRows] = await connection.execute('SELECT id FROM inventario WHERE usuario_id = ? FOR UPDATE', [usuarioId]);
    const necesitaInsertInventario = invRows.length === 0;

    let insertFields = ['usuario_id'];
    let insertValues = [usuarioId];
    let insertPlaceholders = ['?'];
    const updatesInventario = [];

    // Procesamos el carrito
    for (const reqItem of paquete) {
      const item = reqItem.item;
      const cantNum = parseInt(reqItem.cantidad);

      if (isNaN(cantNum) || cantNum <= 0) continue;

      if (item === 'monedas' || item === 'pokeballs') {
        await connection.execute(`UPDATE usuarios SET ${item} = ${item} + ? WHERE id = ?`, [cantNum, usuarioId]);
      } else if (validFields.includes(item)) {
        if (necesitaInsertInventario) {
          insertFields.push(item);
          insertValues.push(cantNum);
          insertPlaceholders.push('?');
        } else {
          updatesInventario.push({ field: item, value: cantNum });
        }
      } else {
        throw new Error(`Objeto inválido detectado: ${item}`);
      }
    }

    if (necesitaInsertInventario && insertFields.length > 1) {
      const query = `INSERT INTO inventario (${insertFields.join(', ')}) VALUES (${insertPlaceholders.join(', ')})`;
      await connection.execute(query, insertValues);
    } else if (!necesitaInsertInventario && updatesInventario.length > 0) {
      for (const up of updatesInventario) {
         await connection.execute(`UPDATE inventario SET ${up.field} = ${up.field} + ? WHERE usuario_id = ?`, [up.value, usuarioId]);
      }
    }

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    console.error('Error entregando paquete por panel:', err);
    return res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }

  // =====================================
  // ENVIAR MENSAJE DE WHATSAPP AL USUARIO (CORREGIDO)
  // =====================================
  try {
    if (bot && bot.client && whatsappId) {
      let mensajeWpp = `🎁 *¡HAS RECIBIDO UN PAQUETE DE REGALO!* 🎁\n\nLos administradores te han enviado un paquete especial. Contiene:\n\n`;
      
      paquete.forEach(p => {
         const nombreBonito = p.item.toUpperCase().replace(/_/g, ' ');
         mensajeWpp += `• *${p.cantidad}x* ${nombreBonito}\n`;
      });
      
      mensajeWpp += `\n_Tus objetos ya han sido guardados en tu inventario. ¡Disfrútalos!_`;

      // ----------------------------------------------------
      // SOLUCIÓN: Limpiamos el ID multi-dispositivo (Los ":" )
      // ----------------------------------------------------
      const cleanId = whatsappId.split(':')[0];
      const chatId = cleanId.includes('@') ? cleanId : `${cleanId}@c.us`;

      console.log(`\n[Panel] Intentando notificar regalo a WhatsApp: ${chatId}`);
      await bot.client.sendMessage(chatId, mensajeWpp);
      console.log(`[Panel] Notificación enviada con éxito a ${chatId}`);
      bot.log(`Se entregó un paquete de regalo y se notificó a ${cleanId}`, 'info');
      
    } else {
      console.warn(`[Panel] No se pudo enviar WhatsApp. Cliente listo? ${!!(bot && bot.client)} | ID: ${whatsappId}`);
    }
  } catch (errMsg) {
    console.error('[Panel] Error enviando mensaje de WhatsApp tras regalo:', errMsg);
  }

  res.json({ success: true });
});


// ==========================================================
// NUEVO: CONSULTAR EFECTIVIDAD DIRECTAMENTE DESDE LA BASE DE DATOS
// ==========================================================
app.get('/api/efectividad', async (req, res) => {
  const tiposStr = req.query.tipos;
  if (!tiposStr) return res.json({ ofensivo: {}, defensivo: {}, inmunidades: {} });
  const tipos = tiposStr.split(',');

  try {
    // 1. DEFENSIVO & INMUNIDADES (Recibidas)
    const [todosLosTipos] = await db.execute('SELECT DISTINCT atacante_nombre as nombre FROM tipos_relaciones WHERE atacante_nombre IS NOT NULL');
    const multiplicadoresDef = {};
    for(let t of todosLosTipos) {
        multiplicadoresDef[t.nombre] = 1;
    }

    const placeholders = tipos.map(() => '?').join(',');
    const [relacionesDef] = await db.execute(`
      SELECT atacante_nombre as atacante, multiplicador 
      FROM tipos_relaciones 
      WHERE defensor_nombre IN (${placeholders})
    `, tipos);

    // Multiplicamos cruzado según los tipos que defienden
    relacionesDef.forEach(rel => {
      if (multiplicadoresDef[rel.atacante] !== undefined) {
         multiplicadoresDef[rel.atacante] *= parseFloat(rel.multiplicador);
      }
    });

    // Corrección neutral
    Object.keys(multiplicadoresDef).forEach(k => {
       if (Math.abs(multiplicadoresDef[k] - 0.9375) < 0.001) multiplicadoresDef[k] = 1;
    });

    const defensivo = { weak4x: [], weak2x: [], resist2x: [], resist4x: [] };
    const no_me_hacen_dano = [];

    Object.entries(multiplicadoresDef).forEach(([type, mult]) => {
        if (mult >= 1.5) defensivo.weak4x.push(type);
        else if (mult === 1.25) defensivo.weak2x.push(type);
        else if (mult === 0.75) defensivo.resist2x.push(type);
        else if (mult > 0 && mult <= 0.6) defensivo.resist4x.push(type);
        else if (mult === 0) no_me_hacen_dano.push(type);
    });

    // 2. OFENSIVO & INMUNIDADES (Causadas)
    const ofensivo = {};
    const no_hago_dano = [];

    // Evaluamos los ataques por CADA TIPO que tiene el Pokémon
    for (const miTipo of tipos) {
       ofensivo[miTipo] = { fuerte: [], debil: [] };
       
       const [relacionesOf] = await db.execute(`
         SELECT defensor_nombre as defensor, multiplicador 
         FROM tipos_relaciones 
         WHERE atacante_nombre = ?
       `, [miTipo]);

       relacionesOf.forEach(rel => {
          const mult = parseFloat(rel.multiplicador);
          if (mult === 1.25) ofensivo[miTipo].fuerte.push(rel.defensor);
          else if (mult === 0.75) ofensivo[miTipo].debil.push(rel.defensor);
          else if (mult === 0) no_hago_dano.push({ mi_tipo: miTipo, defensor: rel.defensor });
       });
    }

    res.json({
       defensivo,
       ofensivo,
       inmunidades: {
          no_me_hacen_dano,
          no_hago_dano
       }
    });
  } catch (err) {
    console.error('Error en api/efectividad:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = { startServer };