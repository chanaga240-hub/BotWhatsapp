const db = require('./database');

/**
 * Registra la captura exitosa de un Pokémon, resta una pokébola y actualiza la fecha de captura.
 */
async function registrarCaptura(usuarioId, pokemonId, nombrePokemon, nivel = 1, experiencia = 0) {
  const connection = await db.getConnection();
  try {
    // Iniciamos una transacción para que si algo falla, no se hagan cambios parciales
    await connection.beginTransaction();

    // 1. Guardar el Pokémon en el inventario
    // Insertando nivel y experiencia si se proporcionan (mantener compatibilidad con llamadas antiguas)
    // Aseguramos que los valores por defecto sean nivel=1 y experiencia=0 cuando no se envían
    const nivelFinal = (nivel === undefined || nivel === null) ? 1 : nivel;
    const experienciaFinal = (experiencia === undefined || experiencia === null) ? 0 : experiencia;

    await connection.execute(
      'INSERT INTO pokemon_atrapados (usuario_id, pokemon_id, nombre, nivel, experiencia) VALUES (?, ?, ?, ?, ?)',
      [usuarioId, pokemonId, nombrePokemon, nivelFinal, experienciaFinal]
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
 * Libera un Pokémon del usuario: devuelve sus datos y elimina la fila de la BD
 */
async function liberarPokemon(pokemonAtrapadoId) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      'SELECT id, usuario_id, pokemon_id, nombre, nivel, experiencia FROM pokemon_atrapados WHERE id = ?',
      [pokemonAtrapadoId]
    );
    if (!rows || rows.length === 0) {
      await connection.rollback();
      return null;
    }
    const datos = rows[0];
    await connection.execute('DELETE FROM pokemon_atrapados WHERE id = ?', [pokemonAtrapadoId]);
    await connection.commit();
    return datos;
  } catch (error) {
    await connection.rollback();
    console.error('Error al liberar Pokémon:', error);
    return null;
  } finally {
    connection.release();
  }
}

async function transferirPokemon(pokemonAtrapadoId, nuevoUsuarioId) {
  try {
    const [rows] = await db.execute(
      'SELECT id, usuario_id, pokemon_id, nombre, nivel, experiencia, fecha_entrenamiento, fecha_ultimo_combate, combates FROM pokemon_atrapados WHERE id = ?',
      [pokemonAtrapadoId]
    );
    if (!rows || rows.length === 0) {
      return null;
    }

    const pokemon = rows[0];
    const [result] = await db.execute(
      'UPDATE pokemon_atrapados SET usuario_id = ? WHERE id = ?',
      [nuevoUsuarioId, pokemonAtrapadoId]
    );

    if (result.affectedRows !== 1) {
      return null;
    }

    return pokemon;
  } catch (error) {
    console.error('Error al transferir Pokémon:', error);
    return null;
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
    async function verificarYObtenerPokemon(whatsappId, nombreOId) {
    try {
        const input = nombreOId.trim();

        // 1. Intentar buscar por nombre
        let [rows] = await db.execute(
            `SELECT pa.* FROM pokemon_atrapados pa
             JOIN usuarios u ON pa.usuario_id = u.id
             WHERE u.whatsapp_id = ? AND LOWER(pa.nombre) = LOWER(?)
             LIMIT 1`,
            [whatsappId, input]
        );

        // 2. Si no se encontró por nombre, intentar buscar por ID (pokemon_id)
        if (rows.length === 0) {
            [rows] = await db.execute(
                `SELECT pa.* FROM pokemon_atrapados pa
                 JOIN usuarios u ON pa.usuario_id = u.id
                 WHERE u.whatsapp_id = ? AND pa.pokemon_id = ?
                 LIMIT 1`,
                [whatsappId, input]
            );
        }

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
    if (!pokemon) return { error: 'not_found' };

    // --- COOLDOWN (30 minutos) ---
    const ahora = new Date();
    const ultima = pokemon.fecha_entrenamiento ? new Date(pokemon.fecha_entrenamiento) : null;
    const cooldownMs = 30 * 60 * 1000;

    if (ultima && ahora - ultima < cooldownMs) {
        const restanteMs = cooldownMs - (ahora - ultima);
        return { 
            error: 'cooldown', 
            remaining: { 
                minutos: Math.floor(restanteMs / 60000), 
                segundos: Math.floor((restanteMs % 60000) / 1000) 
            } 
        };
    }

    // --- LÓGICA DE NIVEL Y XP ---
    let nivelActual = pokemon.nivel || 1;
    let expActual = (pokemon.experiencia || 0) + 5;
    let subioNivel = false;
    
    // Fórmula: 100 + (25 * nivel)
    let xpNecesaria = 100 + ((nivelActual - 1) * 25);

    // Verificamos si alcanza para subir de nivel
    if (expActual >= xpNecesaria) {
        nivelActual++;
        expActual = expActual - xpNecesaria; 
        subioNivel = true;
    }

    try {
        // Actualizamos en la DB
        await db.execute(
            'UPDATE pokemon_atrapados SET experiencia = ?, nivel = ?, fecha_entrenamiento = NOW() WHERE id = ?',
            [expActual, nivelActual, pokemon.id]
        );

        return {
            success: true,
            subioNivel: subioNivel,
            pokemon: {
                nombre: pokemon.nombre,
                nivel: nivelActual,
                experiencia: expActual,
                xpNecesaria: 100 + (25 * nivelActual),
                experienciaAnterior: pokemon.experiencia, // Para mostrar la diferencia
                experienciaNueva: expActual
            }
        };
    } catch (error) {
        console.error('Error al entrenar Pokémon en DB:', error);
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

/**
 * Obtiene todos los Pokémon de un usuario con sus niveles y fechas de entrenamiento.
 */
async function obtenerPokemonParaEntrenamiento(whatsappId) {
  try {
    const [rows] = await db.execute(
      `SELECT pa.id, pa.nombre, pa.nivel, pa.fecha_entrenamiento
       FROM pokemon_atrapados pa
       JOIN usuarios u ON pa.usuario_id = u.id
       WHERE u.whatsapp_id = ?
       ORDER BY pa.fecha_entrenamiento ASC, pa.nombre ASC`,
      [whatsappId]
    );
    return rows;
  } catch (error) {
    console.error('Error al obtener Pokémon para entrenamiento:', error);
    return [];
  }
}

/**
 * Entrena a TODOS los Pokémon de un usuario que no estén en cooldown.
 */
async function entrenarTodosListos(whatsappId) {
  try {
    // Obtenemos todos los Pokémon del usuario
    const [rows] = await db.execute(
      `SELECT pa.* FROM pokemon_atrapados pa
       JOIN usuarios u ON pa.usuario_id = u.id
       WHERE u.whatsapp_id = ?`,
      [whatsappId]
    );

    const ahora = new Date();
    const cooldownMs = 30 * 60 * 1000; // 30 minutos
    let entrenados = 0;
    let subieron = [];

    // Recorremos los Pokémon para entrenar solo a los que ya descansaron
    for (const pokemon of rows) {
      const ultima = pokemon.fecha_entrenamiento ? new Date(pokemon.fecha_entrenamiento) : null;
      
      if (!ultima || (ahora - ultima >= cooldownMs)) {
        let nivelActual = pokemon.nivel || 1;
        let expActual = (pokemon.experiencia || 0) + 5;
        let subioNivel = false;
        let xpNecesaria = 100 + ((nivelActual - 1) * 25);

        // Subida de nivel
        if (expActual >= xpNecesaria) {
          nivelActual++;
          expActual = expActual - xpNecesaria;
          subioNivel = true;
          subieron.push({ nombre: pokemon.nombre, nivel: nivelActual });
        }

        // Actualizamos este Pokémon en la base de datos
        await db.execute(
          'UPDATE pokemon_atrapados SET experiencia = ?, nivel = ?, fecha_entrenamiento = NOW() WHERE id = ?',
          [expActual, nivelActual, pokemon.id]
        );
        entrenados++;
      }
    }

    return { error: null, entrenados, subieron };
  } catch (error) {
    console.error('Error en entrenarTodosListos:', error);
    return { error: 'db_error' };
  }
}

async function usarPocionXp(whatsappId, nombrePokemon) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Verificar inventario
    const [inv] = await connection.execute(
      'SELECT i.pocion_xp_small FROM inventario i JOIN usuarios u ON i.usuario_id = u.id WHERE u.whatsapp_id = ? FOR UPDATE',
      [whatsappId]
    );

    if (!inv[0] || inv[0].pocion_xp_small <= 0) {
      await connection.rollback();
      return { error: 'sin_objetos' };
    }

    // 2. Buscar al Pokémon
    const [poke] = await connection.execute(
      'SELECT pa.* FROM pokemon_atrapados pa JOIN usuarios u ON pa.usuario_id = u.id WHERE u.whatsapp_id = ? AND pa.nombre = ? LIMIT 1',
      [whatsappId, nombrePokemon]
    );

    if (poke.length === 0) {
      await connection.rollback();
      return { error: 'pokemon_no_encontrado' };
    }

    // 3. Aplicar efecto (+50 XP)
    const pokemon = poke[0];
    const nuevaXp = (pokemon.experiencia || 0) + 50;

    await connection.execute(
      'UPDATE pokemon_atrapados SET experiencia = ? WHERE id = ?',
      [nuevaXp, pokemon.id]
    );

    // 4. Restar 1 objeto
    await connection.execute(
      'UPDATE inventario i JOIN usuarios u ON i.usuario_id = u.id SET i.pocion_xp_small = i.pocion_xp_small - 1 WHERE u.whatsapp_id = ?',
      [whatsappId]
    );

    await connection.commit();
    return { success: true, nombre: pokemon.nombre, nuevaXp };
  } catch (error) {
    await connection.rollback();
    console.error('Error al usar poción:', error);
    return { error: 'db_error' };
  } finally {
    connection.release();
  }
}

// --- NUEVAS FUNCIONES PARA EL EQUIPO POKÉMON ---

async function asignarEquipoPokemon(whatsappId, jerarquia, nombrePokemon) {
  // Verificamos si el usuario tiene a este Pokémon
  const pokemon = await verificarYObtenerPokemon(whatsappId, nombrePokemon);
  if (!pokemon) return { error: 'pokemon_no_encontrado' };

  const usuarioId = pokemon.usuario_id;
  const pokemonAtrapadoId = pokemon.id;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Verificamos si este Pokémon EXACTO ya está en OTRA posición del equipo
    const [existente] = await connection.execute(
      'SELECT jerarquia FROM equipo_pokemon WHERE usuario_id = ? AND pokemon_id = ?',
      [usuarioId, pokemonAtrapadoId]
    );

    if (existente.length > 0) {
      const posicionActual = existente[0].jerarquia;
      if (posicionActual === jerarquia) {
        await connection.rollback();
        return { error: 'ya_en_esa_posicion' };
      }
      // Si estaba en otra posición, lo removemos de ahí primero (para evitar clones en el equipo)
      await connection.execute(
        'DELETE FROM equipo_pokemon WHERE usuario_id = ? AND pokemon_id = ?',
        [usuarioId, pokemonAtrapadoId]
      );
    }

    // Insertamos o reemplazamos el Pokémon en la jerarquía (El UNIQUE KEY maneja el reemplazo)
    await connection.execute(`
      INSERT INTO equipo_pokemon (usuario_id, pokemon_id, jerarquia)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE pokemon_id = VALUES(pokemon_id)
    `, [usuarioId, pokemonAtrapadoId, jerarquia]);

    await connection.commit();
    return { success: true, pokemon: pokemon.nombre, jerarquia };
  } catch (error) {
    await connection.rollback();
    console.error('Error al asignar equipo:', error);
    return { error: 'db_error' };
  } finally {
    connection.release();
  }
}

async function obtenerEquipoPokemon(whatsappId) {
  try {
    const query = `
      SELECT ep.jerarquia, ep.estado, pa.nombre, pa.nivel
      FROM equipo_pokemon ep
      JOIN usuarios u ON ep.usuario_id = u.id
      JOIN pokemon_atrapados pa ON ep.pokemon_id = pa.id
      WHERE u.whatsapp_id = ?
      ORDER BY ep.jerarquia ASC
    `;
    const [rows] = await db.execute(query, [whatsappId]);
    return rows;
  } catch (error) {
    console.error('Error al obtener equipo:', error);
    return [];
  }
}

module.exports = {
  registrarCaptura,
  restarPokeball,
  obtenerPokedex,
  verificarYObtenerPokemon,
  contarCapturas,
  entrenarPokemon,
  registrarCombate,
  liberarPokemon,
  transferirPokemon,
  obtenerPokemonParaEntrenamiento,
  entrenarTodosListos,
  usarPocionXp,
  asignarEquipoPokemon,
  obtenerEquipoPokemon
};