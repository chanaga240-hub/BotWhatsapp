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

// CORREGIDO: Ahora usa 'db' en lugar de 'connection' y exporta la función
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

async function realizarTrabajo(usuarioId) {
  try {
    // 1. Verificamos el cooldown (10 minutos)
    const [userRows] = await db.execute('SELECT fecha_trabajo FROM usuarios WHERE id = ?', [usuarioId]);
    if (userRows.length === 0) return { error: 'user_not_found' };

    const usuario = userRows[0];
    const ahora = new Date();
    const ultima = usuario.fecha_trabajo ? new Date(usuario.fecha_trabajo) : null;
    const cooldownMs = 10 * 60 * 1000; // 10 minutos en milisegundos

    if (ultima && (ahora - ultima) < cooldownMs) {
      const restanteMs = cooldownMs - (ahora - ultima);
      return { error: 'cooldown', remaining: restanteMs };
    }

    // 2. Buscamos un trabajo aleatorio de la tabla
    const [trabajos] = await db.execute('SELECT * FROM trabajos ORDER BY RAND() LIMIT 1');
    if (trabajos.length === 0) return { error: 'no_jobs' };
    const trabajo = trabajos[0];

    // 3. Pagamos al usuario y actualizamos la fecha del trabajo
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
    // 1. Obtener usuario y saldo actual
    const [rows] = await db.execute('SELECT monedas, pokeballs FROM usuarios WHERE id = ?', [usuarioId]);
    const usuario = rows[0];

    // 2. Definir lógica según código (puedes ampliar esto con más códigos después)
    let precioUnitario = 0;
    if (codigo === '001') {
      precioUnitario = 50;
    } else {
      return { error: 'codigo_invalido' };
    }

    const costoTotal = precioUnitario * parseInt(cantidad);

    // 3. Validar si alcanza
    if (usuario.monedas < costoTotal) {
      return { error: 'fondos_insuficientes', saldo: usuario.monedas, costo: costoTotal };
    }

    // 4. Realizar la compra en BD
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
    // Iniciamos transacción (esto es conceptual, ajusta según tu pool de BD)
    const [remitente] = await db.execute('SELECT id, monedas FROM usuarios WHERE whatsapp_id = ?', [remitenteId]);
    const [destinatario] = await db.execute('SELECT id FROM usuarios WHERE whatsapp_id = ?', [destinatarioId]);

    if (remitente.length === 0 || destinatario.length === 0) return { error: 'usuario_no_encontrado' };
    if (remitente[0].monedas < cantidad) return { error: 'fondos_insuficientes' };

    // Restamos al remitente y sumamos al destinatario
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
      SELECT u.pokeballs, i.pocion_xp_small
      FROM usuarios u
      LEFT JOIN inventario i ON u.id = i.usuario_id
      WHERE u.whatsapp_id = ?
    `;
    const [rows] = await db.execute(query, [whatsappId]);
    
    if (rows.length === 0) return null;
    
    // Si el usuario no tiene fila en inventario, devolvemos 0 pociones
    return {
      pokeballs: rows[0].pokeballs || 0,
      pocion_xp_small: rows[0].pocion_xp_small || 0
    };
  } catch (error) {
    console.error('Error al obtener inventario:', error);
    return null;
  }
}

module.exports = { obtenerUsuario, registrarUsuario, reclamarDaily, sumarExperiencia, realizarTrabajo, comprarObjeto, transferirMonedas, obtenerInventarioCompleto };
