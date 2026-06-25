const db = require('./database');

/**
 * Registra la captura exitosa de un Pokémon, resta una pokébola y actualiza la fecha de captura.
 */
async function registrarCaptura(usuarioId, pokemonId, nombrePokemon) {
  const connection = await db.getConnection();
  try {
    // Iniciamos una transacción para que si algo falla, no se hagan cambios parciales
    await connection.beginTransaction();

    // 1. Guardar el Pokémon en el inventario
    await connection.execute(
      'INSERT INTO pokemon_atrapados (usuario_id, pokemon_id, nombre) VALUES (?, ?, ?)',
      [usuarioId, pokemonId, nombrePokemon]
    );

    // 2. Restar una pokébola y actualizar la fecha de "ultima_captura"
    await connection.execute(
      'UPDATE usuarios SET pokeballs = pokeballs - 1, ultima_captura = NOW() WHERE id = ?',
      [usuarioId]
    );

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    console.error('Error en la transacción de captura:', error);
    return false;
  } finally {
    connection.release();
  }
}

/**
 * Resta una pokébola al usuario cuando falla la captura.
 */
async function restarPokeball(usuarioId) {
  try {
    await db.execute('UPDATE usuarios SET pokeballs = pokeballs - 1 WHERE id = ?', [usuarioId]);
    return true;
  } catch (error) {
    console.error('Error al restar pokébola:', error);
    return false;
  }
}

/**
 * Obtiene la lista de Pokémon atrapados por un usuario mediante su whatsappId.
 */
async function obtenerPokedex(whatsappId) {
    try {
      const [rows] = await db.execute(
        `SELECT pa.nombre, pa.nivel, COUNT(*) as cantidad 
         FROM pokemon_atrapados pa
         JOIN usuarios u ON pa.usuario_id = u.id
         WHERE u.whatsapp_id = ?
         GROUP BY pa.nombre, pa.nivel
         ORDER BY pa.nombre ASC`,
        [whatsappId]
      );
      return rows;
    } catch (error) {
      console.error('Error al obtener la Pokédex:', error);
      return [];
    }
  }

    /**
     * Verifica si un usuario tiene un Pokémon específico por su nombre y extrae sus datos
     */
    async function verificarYObtenerPokemon(whatsappId, nombrePokemon) {
        try {
      const [rows] = await db.execute(
        `SELECT pa.id, pa.nombre, pa.pokemon_id, pa.nivel, pa.experiencia, pa.fecha_entrenamiento,
        pa.fecha_ultimo_combate, pa.combates
        FROM pokemon_atrapados pa
        JOIN usuarios u ON pa.usuario_id = u.id
        WHERE u.whatsapp_id = ? AND LOWER(pa.nombre) = LOWER(?)
        LIMIT 1`,
        [whatsappId, nombrePokemon.trim()]
      );
        return rows.length > 0 ? rows[0] : null;
        } catch (error) {
        console.error('Error al verificar Pokémon de la Pokedex:', error);
        return null;
        }
    }

async function contarCapturas(whatsappId) {
  try {
    const [rows] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM pokemon_atrapados pa
       JOIN usuarios u ON pa.usuario_id = u.id
       WHERE u.whatsapp_id = ?`,
      [whatsappId]
    );
    return rows.length > 0 ? rows[0].total : 0;
  } catch (error) {
    console.error('Error al contar capturas:', error);
    return 0;
  }
}

async function entrenarPokemon(whatsappId, nombrePokemon) {
  const pokemon = await verificarYObtenerPokemon(whatsappId, nombrePokemon);
  if (!pokemon) {
    return { error: 'not_found' };
  }

  const ahora = new Date();
  const ultima = pokemon.fecha_entrenamiento ? new Date(pokemon.fecha_entrenamiento) : null;
  const cooldownMs = 30 * 60 * 1000;

  if (ultima && ahora - ultima < cooldownMs) {
    const restanteMs = cooldownMs - (ahora - ultima);
    const minutos = Math.floor(restanteMs / (1000 * 60));
    const segundos = Math.floor((restanteMs % (1000 * 60)) / 1000);
    return {
      error: 'cooldown',
      remaining: { minutos, segundos },
      pokemon: { nombre: pokemon.nombre }
    };
  }

  const experienciaAnterior = pokemon.experiencia || 0;
  const experienciaNueva = experienciaAnterior + 5;

  try {
    await db.execute(
      'UPDATE pokemon_atrapados SET experiencia = IFNULL(experiencia, 0) + 5, fecha_entrenamiento = NOW() WHERE id = ?',
      [pokemon.id]
    );

    return {
      success: true,
      pokemon: {
        nombre: pokemon.nombre,
        experienciaAnterior,
        experienciaNueva
      }
    };
  } catch (error) {
    console.error('Error al entrenar Pokémon:', error);
    return { error: 'db_error' };
  }
}

/**
 * Marca que un Pokémon ha participado en un combate: actualiza fecha_ultimo_combate y suma 1 a combates
 */
async function registrarCombate(pokemonAtrapadoId) {
  try {
    await db.execute(
      'UPDATE pokemon_atrapados SET fecha_ultimo_combate = NOW(), combates = IFNULL(combates, 0) + 1 WHERE id = ?',
      [pokemonAtrapadoId]
    );
    return true;
  } catch (error) {
    console.error('Error al registrar combate del Pokémon:', error);
    return false;
  }
}

module.exports = {
  registrarCaptura,
  restarPokeball,
  obtenerPokedex,
  verificarYObtenerPokemon,
  contarCapturas,
  entrenarPokemon,
  registrarCombate
};