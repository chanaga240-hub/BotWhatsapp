const db = require('./database');
const { obtenerPokemonBebeAleatorio } = require('./pokeapi');

/**
 * Registra la captura exitosa de un Pokémon, resta una pokébola y actualiza la fecha de captura.
 */
async function registrarCaptura(usuarioId, pokemonId, nombrePokemon, nivel = 1, experiencia = 0, esIncubadora = false) {
  const connection = await db.getConnection();
  try {
    // Iniciamos una transacción para que si algo falla, no se hagan cambios parciales
    await connection.beginTransaction();

    const [ownerRows] = await connection.execute(
      'SELECT usuario_id FROM pokemon_atrapados WHERE pokemon_id = ? LIMIT 1',
      [pokemonId]
    );

    const alreadyOwnedByAnother = ownerRows.some((row) => Number(row.usuario_id) !== Number(usuarioId));

    if (alreadyOwnedByAnother) {
      const successChance = 0.2;
      const shouldGrant = Math.random() < successChance;
      if (!shouldGrant) {
        await connection.rollback();
        return { success: false, duplicate: true };
      }
    }

    const [existingRows] = await connection.execute(
      'SELECT id FROM pokemon_atrapados WHERE usuario_id = ? AND pokemon_id = ?',
      [usuarioId, pokemonId]
    );

    if (existingRows.length > 0) {
      await connection.rollback();
      return { success: false, duplicate: true };
    }

    // 1. Guardar el Pokémon en el inventario
    const nivelFinal = (nivel === undefined || nivel === null) ? 1 : nivel;
    const experienciaFinal = (experiencia === undefined || experiencia === null) ? 0 : experiencia;

    await connection.execute(
      'INSERT INTO pokemon_atrapados (usuario_id, pokemon_id, nombre, nivel, experiencia) VALUES (?, ?, ?, ?, ?)',
      [usuarioId, pokemonId, nombrePokemon, nivelFinal, experienciaFinal]
    );

    // 2. Condición: Restar una pokébola SOLO si no viene de la incubadora
    if (!esIncubadora) {
        await connection.execute(
            'UPDATE usuarios SET pokeballs = pokeballs - 1, ultima_captura = NOW() WHERE id = ?',
            [usuarioId]
        );
    }

    await connection.commit();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    console.error('Error en la transacción de captura:', error);
    return { success: false, duplicate: false, error: true };
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
        `SELECT pa.nombre, pa.nivel, pa.experiencia, COUNT(*) as cantidad 
         FROM pokemon_atrapados pa
         JOIN usuarios u ON pa.usuario_id = u.id
         WHERE u.whatsapp_id = ?
         GROUP BY pa.nombre, pa.nivel, pa.experiencia
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
/**
 * Verifica si un usuario tiene un Pokémon específico por su nombre (flexible) o ID, y extrae sus datos
 */
async function verificarYObtenerPokemon(whatsappId, nombreOId) {
  try {
      const input = nombreOId.trim();

      // 1. Extraer nombre base y el índice si el usuario escribe ej: Pikachu_2
      let nombreBase = input;
      let offset = 0;
      const match = input.match(/^(.+)_(\d+)$/);
      
      if (match) {
          nombreBase = match[1].trim();
          const indice = parseInt(match[2], 10);
          offset = indice > 0 ? indice - 1 : 0;
      }

      // 2. Construir la cláusula LIMIT dinámicamente
      // Si no hay sufijo (_2), queda idéntico a tu código original
      const limitClause = offset > 0 ? `LIMIT 1 OFFSET ${offset}` : `LIMIT 1`;

      // 3. Intentar buscar por coincidencia EXACTA (ignorando mayúsculas)
      let [rows] = await db.execute(
          `SELECT pa.* FROM pokemon_atrapados pa
          JOIN usuarios u ON pa.usuario_id = u.id
          WHERE u.whatsapp_id = ? AND LOWER(pa.nombre) = LOWER(?)
          ORDER BY pa.id ASC
          ${limitClause}`,
          [whatsappId, nombreBase]
      );

      // 4. Si no se encontró y el input es un número, intentar buscar por ID
      if (rows.length === 0 && !isNaN(nombreBase)) {
          [rows] = await db.execute(
              `SELECT pa.* FROM pokemon_atrapados pa
              JOIN usuarios u ON pa.usuario_id = u.id
              WHERE u.whatsapp_id = ? AND pa.pokemon_id = ?
              ORDER BY pa.id ASC
              ${limitClause}`,
              [whatsappId, nombreBase]
          );
      }

      // 5. Búsqueda FLEXIBLE (coincidencia parcial con LIKE)
      if (rows.length === 0) {
          const inputFlexible = `%${nombreBase}%`;
          [rows] = await db.execute(
              `SELECT pa.* FROM pokemon_atrapados pa
              JOIN usuarios u ON pa.usuario_id = u.id
              WHERE u.whatsapp_id = ? AND LOWER(pa.nombre) LIKE LOWER(?)
              ORDER BY pa.id ASC
              ${limitClause}`,
              [whatsappId, inputFlexible]
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
      SELECT ep.jerarquia, ep.estado, pa.id AS atrapado_id, pa.pokemon_id, pa.nombre, pa.nivel, pa.fecha_ultimo_combate
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

async function cambiarEstadoEquipo(whatsappId, jerarquia, nuevoEstado) {
  try {
    await db.execute(`
      UPDATE equipo_pokemon ep
      JOIN usuarios u ON ep.usuario_id = u.id
      SET ep.estado = ?
      WHERE u.whatsapp_id = ? AND ep.jerarquia = ?
    `, [nuevoEstado, whatsappId, jerarquia]);
  } catch (error) {
    console.error('Error al cambiar estado en equipo:', error);
  }
}

async function reactivarEquipoCompleto(whatsappId) {
  try {
    await db.execute(`
      UPDATE equipo_pokemon ep
      JOIN usuarios u ON ep.usuario_id = u.id
      SET ep.estado = 'activo'
      WHERE u.whatsapp_id = ?
    `, [whatsappId]);
  } catch (error) {
    console.error('Error al reactivar equipo:', error);
  }
}

/**
 * Ejecuta la evolución de un Pokémon descontando rocas y actualizando sus datos.
 */
async function evolucionarPokemon(usuarioId, pokemonAtrapadoId, nuevoPokemonId, nuevoNombre, costoRocas) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Descontar las rocas del inventario
    await connection.execute(
      'UPDATE inventario SET rocas_evolutivas = rocas_evolutivas - ? WHERE usuario_id = ?',
      [costoRocas, usuarioId]
    );

    // 2. Actualizar el Pokémon (Solo cambia ID, Nombre e incrementa evoluciones)
    await connection.execute(
      'UPDATE pokemon_atrapados SET pokemon_id = ?, nombre = ?, evoluciones = evoluciones + 1 WHERE id = ?',
      [nuevoPokemonId, nuevoNombre, pokemonAtrapadoId]
    );

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    console.error('Error al evolucionar:', error);
    return false;
  } finally {
    connection.release();
  }
}

/**
 * Aplica la Punta ADN a un Pokémon, actualizando su estado y restando el ítem del inventario.
 */
async function aplicarPuntaAdn(whatsappId, pokemonAtrapadoId) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Restar 1 Punta ADN del inventario del usuario
    const [result] = await connection.execute(
      `UPDATE inventario i 
       JOIN usuarios u ON i.usuario_id = u.id 
       SET i.punta_adn = i.punta_adn - 1 
       WHERE u.whatsapp_id = ? AND i.punta_adn > 0`,
      [whatsappId]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return false; // No había ítem disponible
    }

    // 2. Actualizar el campo punta_adn del Pokémon específico a true
    await connection.execute(
      'UPDATE pokemon_atrapados SET punta_adn = true WHERE id = ?',
      [pokemonAtrapadoId]
    );

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    console.error('Error en aplicarPuntaAdn:', error);
    return false;
  } finally {
    connection.release();
  }
}

/**
 * Cambia la variante de un Pokémon si tiene el campo punta_adn en true.
 */
async function cambiarVariantePokemon(pokemonAtrapadoId, nuevoPokemonId, nuevoNombre) {
  try {
    // Actualizamos solo el ID y el nombre, conservando el resto de datos
    const [result] = await db.execute(
      'UPDATE pokemon_atrapados SET pokemon_id = ?, nombre = ? WHERE id = ?',
      [nuevoPokemonId, nuevoNombre, pokemonAtrapadoId]
    );
    return result.affectedRows > 0;
  } catch (error) {
    console.error('Error al cambiar variante en BD:', error);
    return false;
  }
}

// ==========================================
// FUNCIONES DE EXPEDICIÓN
// ==========================================

async function obtenerExpediciones(whatsappId) {
  try {
    const [rows] = await db.execute(`
      SELECT e.id as expedicion_id, e.fecha_inicio, e.duracion_dias,
             pa.id as pokemon_id, pa.nombre, pa.nivel, pa.experiencia,
             u.id as usuario_id
      FROM expedicion e
      JOIN pokemon_atrapados pa ON e.pokemon_id = pa.id
      JOIN usuarios u ON e.usuario_id = u.id
      WHERE u.whatsapp_id = ?
    `, [whatsappId]);
    return rows;
  } catch (error) {
    console.error('Error al obtener expediciones:', error);
    return [];
  }
}

async function enviarExpedicion(whatsappId, nombrePokemon, dias) {
  const pokemon = await verificarYObtenerPokemon(whatsappId, nombrePokemon);
  if (!pokemon) return { error: 'pokemon_no_encontrado' };

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Validar límite máximo de 3 expediciones
    const [expRows] = await connection.execute(
      'SELECT COUNT(*) as total FROM expedicion WHERE usuario_id = ?',
      [pokemon.usuario_id]
    );
    if (expRows[0].total >= 3) {
      await connection.rollback();
      return { error: 'limite_alcanzado' };
    }

    // 2. Validar que ESTE Pokémon no esté ya en una expedición
    const [pokeExp] = await connection.execute(
      'SELECT id FROM expedicion WHERE pokemon_id = ?',
      [pokemon.id]
    );
    if (pokeExp.length > 0) {
      await connection.rollback();
      return { error: 'ya_en_expedicion' };
    }

    // 3. Validar que el Pokémon NO esté en el equipo titular
    const [enEquipo] = await connection.execute(
      'SELECT jerarquia FROM equipo_pokemon WHERE pokemon_id = ?',
      [pokemon.id]
    );
    if (enEquipo.length > 0) {
      await connection.rollback();
      return { error: 'en_equipo', posicion: enEquipo[0].jerarquia };
    }

    // 4. Insertar la expedición
    await connection.execute(
      'INSERT INTO expedicion (usuario_id, pokemon_id, duracion_dias) VALUES (?, ?, ?)',
      [pokemon.usuario_id, pokemon.id, dias]
    );

    await connection.commit();
    return { success: true, pokemon: pokemon.nombre };
  } catch (error) {
    await connection.rollback();
    console.error('Error en enviarExpedicion:', error);
    return { error: 'db_error' };
  } finally {
    connection.release();
  }
}

async function reclamarExpedicion(expedicion) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Eliminar de la tabla expedición
    await connection.execute('DELETE FROM expedicion WHERE id = ?', [expedicion.expedicion_id]);

    // 2. Otorgar monedas (50 por cada día)
    const monedasGanadas = 50 * expedicion.duracion_dias;
    await connection.execute('UPDATE usuarios SET monedas = monedas + ? WHERE id = ?', [monedasGanadas, expedicion.usuario_id]);

    // 3. Otorgar 50 de XP plana y revisar si sube de nivel
    let nivelActual = expedicion.nivel || 1;
    let expActual = (expedicion.experiencia || 0) + (50 * expedicion.duracion_dias);
    let xpNecesaria = 100 + ((nivelActual - 1) * 25);
    let subioNivel = false;

    if (expActual >= xpNecesaria) {
        nivelActual++;
        expActual = expActual - xpNecesaria;
        subioNivel = true;
    }

    await connection.execute(
        'UPDATE pokemon_atrapados SET experiencia = ?, nivel = ? WHERE id = ?',
        [expActual, nivelActual, expedicion.pokemon_id]
    );

    await connection.commit();
    return { success: true, monedas: monedasGanadas, subioNivel, nuevoNivel: nivelActual };
  } catch (error) {
    await connection.rollback();
    console.error('Error al reclamar expedición:', error);
    return { error: 'db_error' };
  } finally {
    connection.release();
  }
}

// ==========================================
// FUNCIONES DE INCUBADORA
// ==========================================

async function usarHuevoIncubadora(whatsappId) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Obtener ID interno del usuario
    const [usuarios] = await connection.execute('SELECT id FROM usuarios WHERE whatsapp_id = ?', [whatsappId]);
    if (usuarios.length === 0) {
      await connection.rollback();
      return { error: 'usuario_no_encontrado' };
    }
    const usuarioId = usuarios[0].id;

    // 2. Verificar si tiene un huevo en el inventario
    const [inv] = await connection.execute(
      'SELECT egg FROM inventario WHERE usuario_id = ? FOR UPDATE',
      [usuarioId]
    );

    if (!inv[0] || inv[0].egg <= 0) {
      await connection.rollback();
      return { error: 'sin_objetos' };
    }

    // 3. Verificar si YA alcanzó el límite de 3 huevos en la incubadora
    const [incubando] = await connection.execute(
      'SELECT id FROM incubadora WHERE usuario_id = ?',
      [usuarioId]
    );
    
    // AQUÍ ESTÁ EL CAMBIO: Ahora permite hasta 3 huevos
    if (incubando.length >= 3) {
      await connection.rollback();
      return { error: 'limite_alcanzado' }; // Retornamos el error que espera use.js
    }

    // 4. Descontar el huevo del inventario
    await connection.execute(
      'UPDATE inventario SET egg = egg - 1 WHERE usuario_id = ?',
      [usuarioId]
    );

    // 5. Insertar en la tabla incubadora
    await connection.execute(
      'INSERT INTO incubadora (usuario_id) VALUES (?)',
      [usuarioId]
    );

    await connection.commit();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    console.error('Error al usar huevo en incubadora:', error);
    return { error: 'db_error' };
  } finally {
    connection.release();
  }
}

async function eliminarHuevoIncubadora(incubadoraId) {
  const connection = await db.getConnection();
  try {
    await connection.execute('DELETE FROM incubadora WHERE id = ?', [incubadoraId]);
    return { success: true };
  } catch (error) {
    console.error('Error al eliminar huevo de incubadora:', error);
    return { error: 'db_error' };
  } finally {
    connection.release();
  }
}

async function revisarIncubadora(whatsappId) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [usuarios] = await connection.execute('SELECT id FROM usuarios WHERE whatsapp_id = ?', [whatsappId]);
    if (usuarios.length === 0) {
      await connection.rollback();
      return { error: 'usuario_no_encontrado' };
    }
    const usuarioId = usuarios[0].id;

    // Obtener TODOS los huevos del usuario
    const [incubando] = await connection.execute(
      'SELECT id, fecha_inicio FROM incubadora WHERE usuario_id = ? FOR UPDATE',
      [usuarioId]
    );
    
    if (incubando.length === 0) {
      await connection.rollback();
      return { estado: 'vacio' };
    }

    const ahora = new Date();
    const tiempoRequeridoMs = 20 * 60 * 60 * 1000; 
    let huevosEclosionados = [];
    let huevosEnEspera = [];

    
    // Evaluar cada huevo individualmente
    for (const huevo of incubando) {
      const inicio = new Date(huevo.fecha_inicio);
      const tiempoPasadoMs = ahora - inicio;

      if (tiempoPasadoMs >= tiempoRequeridoMs) {
        // Se deja el huevo en la incubadora hasta que se complete el proceso de nacimiento.
        // Así, si falla la consulta o el registro, no se pierde el huevo.
        const idDinamico = await obtenerPokemonBebeAleatorio();
        huevosEclosionados.push({ incubadoraId: huevo.id, pokemonId: idDinamico });
      } else {
        // Aún le falta tiempo
        const restanteMs = tiempoRequeridoMs - tiempoPasadoMs;
        huevosEnEspera.push({
          horas: Math.floor(restanteMs / (1000 * 60 * 60)),
          minutos: Math.floor((restanteMs % (1000 * 60 * 60)) / (1000 * 60))
        });
      }
    }

    await connection.commit();

    // Retornamos el reporte completo
    return { 
      estado: huevosEclosionados.length > 0 ? 'eclosionados' : 'incubando', 
      nacimientos: huevosEclosionados,
      enEspera: huevosEnEspera,
      usuarioId: usuarioId 
    };

  } catch (error) {
    await connection.rollback();
    console.error('Error al revisar incubadora:', error);
    return { error: 'db_error' };
  } finally {
    connection.release();
  }
}

/**
 * Aplica la Mega Energía a un Pokémon, actualizando su forma y restando el ítem.
 */
async function aplicarMegaEvolucion(whatsappId, pokemonAtrapadoId, nuevoPokemonId, nuevoNombre) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Restar 1 Mega Energía del inventario del usuario
    const [result] = await connection.execute(
      `UPDATE inventario i 
       JOIN usuarios u ON i.usuario_id = u.id 
       SET i.mega_energia = i.mega_energia - 1 
       WHERE u.whatsapp_id = ? AND i.mega_energia > 0`,
      [whatsappId]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return false; // No tenía energía disponible
    }

    // 2. Actualizar el ID y el Nombre del Pokémon a su forma Mega
    await connection.execute(
      'UPDATE pokemon_atrapados SET pokemon_id = ?, nombre = ? WHERE id = ?',
      [nuevoPokemonId, nuevoNombre, pokemonAtrapadoId]
    );

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    console.error('Error en aplicarMegaEvolucion:', error);
    return false;
  } finally {
    connection.release();
  }
}

module.exports = {
  registrarCaptura,
  eliminarHuevoIncubadora,
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
  obtenerEquipoPokemon,
  cambiarEstadoEquipo,
  reactivarEquipoCompleto,
  evolucionarPokemon,
  aplicarPuntaAdn,
  cambiarVariantePokemon,
  reclamarExpedicion,
  enviarExpedicion,
  obtenerExpediciones,
  usarHuevoIncubadora,
  revisarIncubadora,
  aplicarMegaEvolucion
};