const db = require('./database'); // Asegúrate de importar tu conexión a BD

async function procesarCompra(usuarioId, codigo, cantidad) {
  const connection = await db.getConnection(); // Obtenemos conexión para transacción
  try {
    await connection.beginTransaction();

    // 1. Obtener monedas bloqueando la fila para evitar concurrencia
    const [rows] = await connection.execute(
      'SELECT monedas FROM usuarios WHERE id = ? FOR UPDATE', 
      [usuarioId]
    );
    
    if (rows.length === 0) {
      await connection.rollback();
      return { error: 'usuario_no_encontrado' };
    }
    
    const usuario = rows[0];
    let producto = null;

    // 2. Definir producto según código
    if (codigo === '001') {
      producto = {
        nombre: "Pokéball",
        precioUnitario: 25,
        tipo: 'simple'
      };
    } else if (codigo === '002') {
      producto = {
        nombre: "Poción_XP_Small",
        precioUnitario: 200,
        tipo: 'inventario'
      };
    }else if (codigo === '003') {
      producto = {
        nombre: "rocas_evolutivas",
        precioUnitario: 500,
        tipo: 'inventario'
      };
    } else {
      await connection.rollback();
      return { error: 'codigo_invalido' };
    }

    // 3. Validar fondos
    const costoTotal = producto.precioUnitario * cantidad;
    if (usuario.monedas < costoTotal) {
      await connection.rollback();
      return { error: 'fondos_insuficientes', saldo: usuario.monedas, costo: costoTotal };
    }

    // 4. Ejecutar actualizaciones según el tipo
    // Restamos monedas siempre
    await connection.execute('UPDATE usuarios SET monedas = monedas - ? WHERE id = ?', [costoTotal, usuarioId]);

    if (producto.tipo === 'simple') {
      // Caso Pokéball (tabla usuarios)
      await connection.execute('UPDATE usuarios SET pokeballs = pokeballs + ? WHERE id = ?', [cantidad, usuarioId]);
    } else {
      // Caso Poción (tabla inventario)
      // Usamos INSERT ... ON DUPLICATE KEY UPDATE por si el usuario aún no tiene registro en inventario
      await connection.execute(
        `INSERT INTO inventario (usuario_id, pocion_xp_small) VALUES (?, ?) 
         ON DUPLICATE KEY UPDATE pocion_xp_small = pocion_xp_small + ?`,
        [usuarioId, cantidad, cantidad]
      );
    }

    await connection.commit(); // Confirmamos todo
    return { exito: true, objeto: producto.nombre, cantidad: cantidad, costo: costoTotal };

  } catch (error) {
    await connection.rollback();
    console.error('Error en procesarCompra:', error);
    return { error: 'db_error' };
  } finally {
    connection.release(); // Liberamos la conexión
  }
}

module.exports = { procesarCompra };