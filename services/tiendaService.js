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
      producto = { nombre: "Pokéball", precioUnitario: 25, tipo: 'simple' };
    } else if (codigo === '002') {
      producto = { nombre: "Poción_XP_Small", precioUnitario: 200, tipo: 'inventario' };
    } else if (codigo === '003') {
      producto = { nombre: "rocas_evolutivas", precioUnitario: 500, tipo: 'inventario' };
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
      // --- CORRECCIÓN DE DUPLICADOS AQUÍ ---
      
      // 1. Verificamos explícitamente si el usuario YA tiene un inventario creado
      const [invRows] = await connection.execute(
        'SELECT id FROM inventario WHERE usuario_id = ? FOR UPDATE',
        [usuarioId]
      );

      // 2. Mapeamos el nombre del producto a la columna de la BD
      let columna = '';
      if (producto.nombre === 'Poción_XP_Small') columna = 'pocion_xp_small';
      else if (producto.nombre === 'rocas_evolutivas') columna = 'rocas_evolutivas';

      if (invRows.length === 0) {
        // Si NO tiene fila en inventario, la creamos y le asignamos la cantidad comprada de una vez
        const pocionInit = columna === 'pocion_xp_small' ? cantidad : 0;
        const rocasInit = columna === 'rocas_evolutivas' ? cantidad : 0;
        
        await connection.execute(
          'INSERT INTO inventario (usuario_id, pocion_xp_small, rare_candy, rocas_evolutivas) VALUES (?, ?, 0, ?)',
          [usuarioId, pocionInit, rocasInit]
        );
      } else {
        // Si YA existe, simplemente actualizamos la cantidad sumando a lo que ya tenía
        await connection.execute(
          `UPDATE inventario SET ${columna} = ${columna} + ? WHERE usuario_id = ?`,
          [cantidad, usuarioId]
        );
      }
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