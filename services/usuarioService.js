const db = require('./database'); // Asegúrate de que esto importe tu configuración de pool/db

async function obtenerUsuario(whatsappId) {
  try {
    const [rows] = await db.execute('SELECT * FROM usuarios WHERE whatsapp_id = ?', [whatsappId]);
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    return null;
  }
}

async function registrarUsuario(whatsappId, nombre) {
  try {
    await db.execute(
      'INSERT INTO usuarios (whatsapp_id, nombre_whatsapp) VALUES (?, ?)',
      [whatsappId, nombre]
    );
    return true;
  } catch (error) {
    console.error('Error al registrar usuario:', error);
    return false;
  }
}

async function reclamarDaily(usuarioId) {
  try {
    const [rows] = await db.execute('SELECT ultima_reclamacion FROM usuarios WHERE id = ?', [usuarioId]);
    const usuario = rows[0];

    const ahora = new Date();
    const ultima = usuario.ultima_reclamacion ? new Date(usuario.ultima_reclamacion) : null;

    if (!ultima || (ahora - ultima) >= 86400000) {
      await db.execute(
        'UPDATE usuarios SET pokeballs = pokeballs + 5, ultima_reclamacion = ? WHERE id = ?',
        [ahora, usuarioId]
      );
      return { exito: true, nuevoTotal: 5 };
    }

    return { exito: false, tiempoRestante: ultima ? (86400000 - (ahora - ultima)) : 0 };
  } catch (error) {
    console.error('Error en reclamarDaily:', error);
    throw error;
  }
}

async function sumarExperiencia(usuarioId, puntos) {
  try {
    await db.execute(
      'UPDATE usuarios SET experiencia = experiencia + ? WHERE id = ?',
      [puntos, usuarioId]
    );
    return true;
  } catch (error) {
    console.error('Error al sumar experiencia:', error);
    return false;
  }
}

// NUEVA FUNCIÓN: Sumar Monedas
async function sumarMonedas(usuarioId, cantidad) {
  try {
    await db.execute(
      'UPDATE usuarios SET monedas = monedas + ? WHERE id = ?',
      [cantidad, usuarioId]
    );
    return true;
  } catch (error) {
    console.error('Error al sumar monedas:', error);
    return false;
  }
}

async function realizarTrabajo(usuarioId) {
  try {
    const [userRows] = await db.execute('SELECT fecha_trabajo FROM usuarios WHERE id = ?', [usuarioId]);
    if (userRows.length === 0) return { error: 'user_not_found' };

    const usuario = userRows[0];
    const ahora = new Date();
    const ultima = usuario.fecha_trabajo ? new Date(usuario.fecha_trabajo) : null;
    const cooldownMs = 10 * 60 * 1000; 

    if (ultima && (ahora - ultima) < cooldownMs) {
      const restanteMs = cooldownMs - (ahora - ultima);
      return { error: 'cooldown', remaining: restanteMs };
    }

    const [trabajos] = await db.execute('SELECT * FROM trabajos ORDER BY RAND() LIMIT 1');
    if (trabajos.length === 0) return { error: 'no_jobs' };
    const trabajo = trabajos[0];

    await db.execute(
      'UPDATE usuarios SET monedas = monedas + ?, fecha_trabajo = ? WHERE id = ?',
      [trabajo.ganancia, ahora, usuarioId]
    );

    return { exito: true, trabajo: trabajo };
  } catch (error) {
    console.error('Error en realizarTrabajo:', error);
    return { error: 'db_error' };
  }
}

async function comprarObjeto(usuarioId, codigo, cantidad) {
  try {
    const [rows] = await db.execute('SELECT monedas, pokeballs FROM usuarios WHERE id = ?', [usuarioId]);
    const usuario = rows[0];

    let precioUnitario = 0;
    if (codigo === '001') {
      precioUnitario = 50;
    } else {
      return { error: 'codigo_invalido' };
    }

    const costoTotal = precioUnitario * parseInt(cantidad);

    if (usuario.monedas < costoTotal) {
      return { error: 'fondos_insuficientes', saldo: usuario.monedas, costo: costoTotal };
    }

    if (codigo === '001') {
      await db.execute(
        'UPDATE usuarios SET monedas = monedas - ?, pokeballs = pokeballs + ? WHERE id = ?',
        [costoTotal, cantidad, usuarioId]
      );
      return { exito: true, objeto: 'Pokéball', cantidad: cantidad, costo: costoTotal };
    }

  } catch (error) {
    console.error('Error en comprarObjeto:', error);
    return { error: 'db_error' };
  }
}

async function transferirMonedas(remitenteId, destinatarioId, cantidad) {
  try {
    const [remitente] = await db.execute('SELECT id, monedas FROM usuarios WHERE whatsapp_id = ?', [remitenteId]);
    const [destinatario] = await db.execute('SELECT id FROM usuarios WHERE whatsapp_id = ?', [destinatarioId]);

    if (remitente.length === 0 || destinatario.length === 0) return { error: 'usuario_no_encontrado' };
    if (remitente[0].monedas < cantidad) return { error: 'fondos_insuficientes' };

    await db.execute('UPDATE usuarios SET monedas = monedas - ? WHERE id = ?', [cantidad, remitente[0].id]);
    await db.execute('UPDATE usuarios SET monedas = monedas + ? WHERE id = ?', [cantidad, destinatario[0].id]);

    return { exito: true };
  } catch (error) {
    console.error('Error en transferirMonedas:', error);
    return { error: 'db_error' };
  }
}

async function obtenerInventarioCompleto(whatsappId) {
  try {
    const query = `
      SELECT u.pokeballs, u.monedas, i.pocion_xp_small, i.rocas_evolutivas, i.punta_adn, i.egg, i.mega_energia, i.llave_mazmorra
      FROM usuarios u
      LEFT JOIN inventario i ON u.id = i.usuario_id
      WHERE u.whatsapp_id = ?
    `;
    const [rows] = await db.execute(query, [whatsappId]);
    
    if (rows.length === 0) return null;
    
    return {
      pokeballs: rows[0].pokeballs || 0,
      monedas: rows[0].monedas || 0,
      pocion_xp_small: rows[0].pocion_xp_small || 0,
      rocas_evolutivas: rows[0].rocas_evolutivas || 0,
      punta_adn: rows[0].punta_adn || 0,
      egg: rows[0].egg || 0,
      mega_energia: rows[0].mega_energia || 0,
      llave_mazmorra: rows[0].llave_mazmorra || 0
    };
  } catch (error) {
    console.error('Error al obtener inventario:', error);
    return null;
  }
}

// Asegúrate de exportar sumarMonedas aquí abajo
module.exports = { obtenerUsuario, registrarUsuario, reclamarDaily, sumarExperiencia, sumarMonedas, realizarTrabajo, comprarObjeto, transferirMonedas, obtenerInventarioCompleto };