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

  module.exports = { obtenerUsuario, registrarUsuario, reclamarDaily, sumarExperiencia };

