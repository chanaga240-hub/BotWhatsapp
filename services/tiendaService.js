const db = require('./database'); // Asegúrate de importar tu conexión a BD

async function procesarCompra(usuarioId, codigo, cantidad) {
  try {
    // 1. Obtener datos del usuario
    const [rows] = await db.execute('SELECT monedas FROM usuarios WHERE id = ?', [usuarioId]);
    if (rows.length === 0) return { error: 'usuario_no_encontrado' };
    const usuario = rows[0];

    // 2. Definir la lógica de cada producto (Aquí puedes expandir a 002, 003, etc.)
    let producto = null;

    if (codigo === '001') {
      producto = {
        nombre: "Pokéball",
        precioUnitario: 25,
        query: 'UPDATE usuarios SET monedas = monedas - ?, pokeballs = pokeballs + ? WHERE id = ?'
      };
    } 
    // Ejemplo de cómo agregar otro código fácilmente:
    /*
    else if (codigo === '002') {
      producto = {
        nombre: "Super Poción",
        precioUnitario: 100,
        query: 'UPDATE usuarios SET monedas = monedas - ?, pociones = pociones + ? WHERE id = ?'
      };
    }
    */
    else {
      return { error: 'codigo_invalido' };
    }

    // 3. Validaciones
    const costoTotal = producto.precioUnitario * cantidad;
    if (usuario.monedas < costoTotal) {
      return { error: 'fondos_insuficientes', saldo: usuario.monedas, costo: costoTotal };
    }

    // 4. Ejecutar compra
    await db.execute(producto.query, [costoTotal, cantidad, usuarioId]);

    return { 
      exito: true, 
      objeto: producto.nombre, 
      cantidad: cantidad, 
      costo: costoTotal 
    };

  } catch (error) {
    console.error('Error en procesarCompra:', error);
    throw error;
  }
}

module.exports = { procesarCompra };