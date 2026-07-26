const db = require('../services/database');
const usuarioService = require('../services/usuarioService');

function getNombreRemitente(msg) {
  return msg._data?.notifyName || msg.pushname || 'Entrenador';
}

async function handleGive(msg, textoCompleto) {
  try {
    const isGroup = msg.from.endsWith('@g.us');

    if (!isGroup) {
      return await msg.reply('❌ Este comando debe usarse dentro de un grupo y mencionando a otro entrenador.');
    }

    let mentionIds = msg.mentionedIds || [];
    // Respaldo para obtener menciones si el array base viene vacío[cite: 48]
    if (mentionIds.length === 0 && typeof msg.getMentions === 'function') {
      try {
        const mentions = await msg.getMentions();
        mentionIds = mentions
          .map((m) => (m.id && m.id._serialized ? m.id._serialized : ''))
          .filter(Boolean);
      } catch (e) {
        // Fallback
      }
    }

    if (mentionIds.length === 0) {
      return await msg.reply('❌ Debes mencionar a un entrenador con @ para darle un objeto.\n👉 Ejemplo: `#give @Marco 5 pokeballs`');
    }

    const destinatarioId = mentionIds[0].split('@')[0].split(':')[0];
    const remitenteId = (msg.author || msg.from).split('@')[0].split(':')[0];

    if (destinatarioId === remitenteId) {
      return await msg.reply('❌ No puedes darte objetos a ti mismo.');
    }

    const destinatario = await usuarioService.obtenerUsuario(destinatarioId);
    if (!destinatario) {
      return await msg.reply('❌ El entrenador mencionado no está registrado. Pídele que use *#pokeregister* primero.');
    }
    const remitente = await usuarioService.obtenerUsuario(remitenteId);
    if (!remitente) {
      return await msg.reply('❌ No estás registrado. Usa *#pokeregister* primero.');
    }

    // Limpiamos el texto eliminando el comando y la mención[cite: 48]
    let textoLimpio = textoCompleto.replace(/^#give/i, '').replace(/@\d+/g, '').trim();
    const args = textoLimpio.split(/\s+/);

    if (args.length < 2) {
      return await msg.reply('❌ Formato incorrecto.\n👉 Ejemplo: `#give @Marco 5 pokeballs` o `#give @Marco 1 pocion_xp_small`');
    }

    const cantidad = parseInt(args[0]);
    if (isNaN(cantidad) || cantidad <= 0) {
      return await msg.reply('❌ Debes especificar una cantidad válida mayor a 0.');
    }

    // Unimos el resto del texto con guiones bajos (ej: "pocion xp small" -> "pocion_xp_small")
    let item = args.slice(1).join('_').toLowerCase();

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // =====================================
      // LÓGICA PARA MONEDAS Y POKÉBALLS
      // =====================================
      if (item === 'monedas' || item === 'moneda' || item === 'pokeballs' || item === 'pokeball') {
        const dbItem = (item === 'pokeball' || item === 'pokeballs') ? 'pokeballs' : 'monedas';
        
        // Bloqueamos la fila del remitente para revisar que tenga fondos[cite: 51]
        const [senderRows] = await connection.execute(`SELECT ${dbItem} FROM usuarios WHERE id = ? FOR UPDATE`, [remitente.id]);
        
        if (senderRows[0][dbItem] < cantidad) {
          await connection.rollback();
          return await msg.reply(`❌ No tienes suficientes *${dbItem}*.\n🎒 Tienes: ${senderRows[0][dbItem]}`);
        }

        // Ejecutar transferencia
        await connection.execute(`UPDATE usuarios SET ${dbItem} = ${dbItem} - ? WHERE id = ?`, [cantidad, remitente.id]);
        await connection.execute(`UPDATE usuarios SET ${dbItem} = ${dbItem} + ? WHERE id = ?`, [cantidad, destinatario.id]);

      } 
      // =====================================
      // LÓGICA DINÁMICA PARA EL INVENTARIO
      // =====================================
      else {
        // Consultar estructura de tabla dinámicamente[cite: 51]
        const [columns] = await connection.execute("SHOW COLUMNS FROM inventario");
        const validFields = columns.map(col => col.Field).filter(f => f !== 'id' && f !== 'usuario_id');

        // Mapeo de términos comunes para mayor comodidad del usuario
        let mappedItem = item;
        if (item === 'roca_evolutiva' || item === 'rocas') mappedItem = 'rocas_evolutivas';
        if (item === 'huevo' || item === 'huevos') mappedItem = 'egg';
        if (item === 'pocion' || item === 'pocion_xp') mappedItem = 'pocion_xp_small';

        if (!validFields.includes(mappedItem)) {
          await connection.rollback();
          return await msg.reply(`❌ El objeto *${mappedItem.replace(/_/g, ' ')}* no existe en el sistema.`);
        }

        // Revisar inventario del remitente
        const [senderInv] = await connection.execute(`SELECT ${mappedItem} FROM inventario WHERE usuario_id = ? FOR UPDATE`, [remitente.id]);
        if (senderInv.length === 0 || senderInv[0][mappedItem] < cantidad) {
          await connection.rollback();
          const qty = senderInv.length > 0 ? senderInv[0][mappedItem] : 0;
          return await msg.reply(`❌ No tienes suficientes *${mappedItem.replace(/_/g, ' ')}*.\n🎒 Tienes: ${qty}`);
        }

        // Revisar inventario del destinatario
        const [receiverInv] = await connection.execute(`SELECT id FROM inventario WHERE usuario_id = ? FOR UPDATE`, [destinatario.id]);

        // Restar al remitente
        await connection.execute(`UPDATE inventario SET ${mappedItem} = ${mappedItem} - ? WHERE usuario_id = ?`, [cantidad, remitente.id]);

        // Sumar al destinatario (insertar fila si es su primer objeto)[cite: 51]
        if (receiverInv.length === 0) {
          await connection.execute(`INSERT INTO inventario (usuario_id, ${mappedItem}) VALUES (?, ?)`, [destinatario.id, cantidad]);
        } else {
          await connection.execute(`UPDATE inventario SET ${mappedItem} = ${mappedItem} + ? WHERE usuario_id = ?`, [cantidad, destinatario.id]);
        }
      }

      await connection.commit();
      
      const nombreDestinatario = destinatario.nombre_whatsapp || destinatarioId;
      return await msg.reply(
        `🎁 *¡TRANSFERENCIA EXITOSA!*\n\n` +
        `👤 *De:* ${getNombreRemitente(msg)}\n` +
        `👤 *Para:* ${nombreDestinatario}\n` +
        `🎒 *Entregado:* ${cantidad}x ${item.toUpperCase().replace(/_/g, ' ')}`
      );

    } catch (err) {
      await connection.rollback();
      console.error('Error en transferencia:', err);
      return await msg.reply('⚠️ Ocurrió un error interno durante la transferencia.');
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Error general en #give:', error);
    return await msg.reply('⚠️ Ocurrió un error al procesar el comando.');
  }
}

module.exports = { handleGive };