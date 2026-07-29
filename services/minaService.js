const db = require('./database');
const { consultarPokemon } = require('./pokeapi');

async function obtenerMinas(usuarioId) {
    let [rows] = await db.execute('SELECT * FROM minas WHERE usuario_id = ? ORDER BY slot ASC', [usuarioId]);
    if (rows.length === 0) {
        for (let i = 1; i <= 6; i++) {
            await db.execute('INSERT INTO minas (usuario_id, slot) VALUES (?, ?)', [usuarioId, i]);
        }
        [rows] = await db.execute('SELECT * FROM minas WHERE usuario_id = ? ORDER BY slot ASC', [usuarioId]);
    }
    return rows;
}

async function validarPokemonMina(connection, whatsappId, nombrePokemon, tipoRequerido) {
    const [pokeRows] = await connection.execute(`
        SELECT pa.*, u.id as uid 
        FROM pokemon_atrapados pa 
        JOIN usuarios u ON pa.usuario_id = u.id 
        WHERE u.whatsapp_id = ? AND LOWER(pa.nombre) = LOWER(?) LIMIT 1
    `, [whatsappId, nombrePokemon]);

    if (pokeRows.length === 0) return { error: 'pokemon_no_encontrado' };
    const poke = pokeRows[0];

    // Verificar cooldown de 2 HORAS para trabajos de mina
    if (poke.fecha_ultimo_trabajo) {
        const ultima = new Date(poke.fecha_ultimo_trabajo);
        const ahora = new Date();
        const diff = ahora - ultima;
        if (diff < (2 * 3600000)) { // 2 horas en ms
            const restanteMs = (2 * 3600000) - diff;
            const horas = Math.floor(restanteMs / 3600000);
            const mins = Math.floor((restanteMs % 3600000) / 60000);
            return { error: 'cooldown_pokemon', horas, mins };
        }
    }

    // Verificar que sea de tipo PURO y del tipo correcto
    const dataApi = await consultarPokemon(poke.pokemon_id);
    if (!dataApi || !dataApi.types) return { error: 'api_error' };
    if (dataApi.types.length > 1) return { error: 'tipos_multiples' };
    if (dataApi.types[0].type.name !== tipoRequerido) return { error: 'tipo_incorrecto', tipoReq: tipoRequerido };

    return { poke };
}

async function procesarAccionMina(whatsappId, slot, nombrePokemon, accion) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [userRows] = await connection.execute('SELECT id FROM usuarios WHERE whatsapp_id = ?', [whatsappId]);
        if (userRows.length === 0) {
            await connection.rollback(); return { error: 'no_registrado' };
        }
        const usuarioId = userRows[0].id;

        const [minaRows] = await connection.execute('SELECT * FROM minas WHERE usuario_id = ? AND slot = ? FOR UPDATE', [usuarioId, slot]);
        if (minaRows.length === 0) {
            await connection.rollback(); return { error: 'campo_invalido' };
        }
        const mina = minaRows[0];

        let tipoRequerido = '';
        if (accion === 'picar') tipoRequerido = 'fighting';
        if (accion === 'extraer') tipoRequerido = 'rock';
        if (accion === 'refinar') tipoRequerido = 'steel';

        const val = await validarPokemonMina(connection, whatsappId, nombrePokemon, tipoRequerido);
        if (val.error) {
            await connection.rollback(); return val;
        }
        const poke = val.poke;

        const ahoraMs = Date.now();
        const cincoHorasMs = 5 * 3600000;

        let recompensa = 0;

        // LÓGICA DE FASES
        if (accion === 'picar') {
            if (mina.estado !== 'vacio') { await connection.rollback(); return { error: 'estado_incorrecto' }; }
            await connection.execute('UPDATE minas SET estado = "picado", fecha_picado = NOW() WHERE id = ?', [mina.id]);
        
        } else if (accion === 'extraer') {
            if (mina.estado !== 'picado') { await connection.rollback(); return { error: 'estado_incorrecto' }; }
            
            const tiempoPicado = new Date(mina.fecha_picado).getTime();
            if (ahoraMs - tiempoPicado < cincoHorasMs) {
                await connection.rollback(); return { error: 'espera_fase' };
            }
            
            await connection.execute('UPDATE minas SET estado = "extraido", fecha_extraccion = NOW(), refinados_completados = 0 WHERE id = ?', [mina.id]);
        
        } else if (accion === 'refinar') {
            if (mina.estado !== 'extraido') { await connection.rollback(); return { error: 'estado_incorrecto' }; }
            
            const tiempoExtraccion = new Date(mina.fecha_extraccion).getTime();
            if (ahoraMs - tiempoExtraccion < cincoHorasMs) {
                await connection.rollback(); return { error: 'espera_fase' };
            }

            const nuevosRefinados = mina.refinados_completados + 1;

            if (nuevosRefinados >= 5) {
                // Termina el proceso, entregamos la recompensa y reseteamos
                recompensa =  1; 
                
                const [invCheck] = await connection.execute('SELECT id FROM inventario WHERE usuario_id = ?', [usuarioId]);
                if (invCheck.length === 0) {
                    await connection.execute('INSERT INTO inventario (usuario_id, herramientas) VALUES (?, ?)', [usuarioId, recompensa]);
                } else {
                    await connection.execute('UPDATE inventario SET herramientas = herramientas + ? WHERE usuario_id = ?', [recompensa, usuarioId]);
                }

                await connection.execute('UPDATE minas SET estado = "vacio", fecha_picado = NULL, fecha_extraccion = NULL, refinados_completados = 0 WHERE id = ?', [mina.id]);
            } else {
                await connection.execute('UPDATE minas SET refinados_completados = ? WHERE id = ?', [nuevosRefinados, mina.id]);
            }
        }

        // Cansar al Pokémon (Aplica el cooldown general, pero al validar pediremos 2h)
        await connection.execute('UPDATE pokemon_atrapados SET fecha_ultimo_trabajo = NOW() WHERE id = ?', [poke.id]);

        await connection.commit();
        
        return { 
            success: true, 
            accion: accion, 
            pokemon: poke.nombre, 
            refinadosTotales: mina.refinados_completados + 1,
            recompensa: recompensa
        };

    } catch (error) {
        await connection.rollback();
        console.error('Error procesando mina:', error);
        return { error: 'db_error' };
    } finally {
        connection.release();
    }
}

module.exports = { obtenerMinas, procesarAccionMina };