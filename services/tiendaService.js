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

    // 4. Ejecutar actualizaciones
    await connection.execute('UPDATE usuarios SET monedas = monedas - ? WHERE id = ?', [costoTotal, usuarioId]);

    if (producto.tipo === 'simple') {
      await connection.execute('UPDATE usuarios SET pokeballs = pokeballs + ? WHERE id = ?', [cantidad, usuarioId]);
    } else {
      // --- CORRECCIÓN AQUÍ ---
      
      // 1. Aseguramos que el usuario tenga una fila en la tabla inventario
      // IGNORE evita el error si el usuario ya existe
      await connection.execute(
        'INSERT IGNORE INTO inventario (usuario_id, pocion_xp_small, rare_candy, rocas_evolutivas) VALUES (?, 0, 0, 0)',
        [usuarioId]
      );

      // 2. Ahora hacemos el update dinámico según el nombre del producto
      // Usamos un switch para mapear el nombre del producto a la columna correcta
      let columna = '';
      if (producto.nombre === 'Poción_XP_Small') columna = 'pocion_xp_small';
      else if (producto.nombre === 'rocas_evolutivas') columna = 'rocas_evolutivas';
      // Puedes añadir más aquí según tus productos

      await connection.execute(
        `UPDATE inventario SET ${columna} = ${columna} + ? WHERE usuario_id = ?`,
        [cantidad, usuarioId]
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