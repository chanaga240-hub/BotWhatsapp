const db = require('./database');
const fs = require('fs');
const path = require('path');

function obtenerImagenMazmorraAleatoria() {
    const dir = 'C:\\Users\\USER\\Desktop\\BotWhatsapp\\assets\\Calabozos';
    try {
        const files = fs.readdirSync(dir).filter(f => f.match(/\.(png|jpg|jpeg)$/i));
        if (files.length === 0) return path.join(dir, 'Normal.png'); 
        
        const randomFile = files[Math.floor(Math.random() * files.length)];
        return path.join(dir, randomFile);
    } catch (e) {
        console.error("Error leyendo carpeta de mazmorras:", e);
        return 'C:\\Users\\USER\\Desktop\\BotWhatsapp\\assets\\Calabozos\\Normal.png';
    }
}

async function validarEIngresarMazmorra(whatsappId) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [usuarios] = await connection.execute('SELECT id, fecha_mazmorra FROM usuarios WHERE whatsapp_id = ? FOR UPDATE', [whatsappId]);
        if (usuarios.length === 0) return { error: 'usuario_no_encontrado' };
        
        const usuarioId = usuarios[0].id;
        const [inv] = await connection.execute('SELECT llave_mazmorra FROM inventario WHERE usuario_id = ? FOR UPDATE', [usuarioId]);

        if (!inv[0] || inv[0].llave_mazmorra <= 0) {
            await connection.rollback();
            return { error: 'sin_llave' };
        }

        const ultima = usuarios[0].fecha_mazmorra ? new Date(usuarios[0].fecha_mazmorra) : null;
        const ahora = new Date();
        const cooldownMs = 12 * 60 * 60 * 1000; 

        if (ultima && (ahora - ultima) < cooldownMs) {
            const restanteMs = cooldownMs - (ahora - ultima);
            await connection.rollback();
            return { error: 'cooldown', horas: Math.floor(restanteMs / 3600000), mins: Math.floor((restanteMs % 3600000) / 60000) };
        }

        await connection.execute('UPDATE inventario SET llave_mazmorra = llave_mazmorra - 1 WHERE usuario_id = ?', [usuarioId]);
        await connection.execute('UPDATE usuarios SET fecha_mazmorra = NOW() WHERE id = ?', [usuarioId]);

        await connection.commit();
        return { success: true, usuarioId };
    } catch (error) {
        await connection.rollback();
        console.error('Error al ingresar a mazmorra:', error);
        return { error: 'db_error' };
    } finally {
        connection.release();
    }
}

async function generarEquipoEnemigo(rondaActual = 1) {
    try {
        const [rows] = await db.execute('SELECT * FROM pokemon_personalizados');
        
        const poolPrimeraFase = rows.filter(p => p.fase_previa === null);
        const poolEvolucionados = rows.filter(p => p.fase_previa !== null);
        const poolUltimaFase = poolEvolucionados.filter(p => !rows.some(other => other.fase_previa === p.id));

        const segurosEvolucionados = poolEvolucionados.length >= 6 ? poolEvolucionados : rows;
        const segurosUltimaFase = poolUltimaFase.length >= 6 ? poolUltimaFase : segurosEvolucionados;
        const segurosPrimeraFase = poolPrimeraFase.length >= 6 ? poolPrimeraFase : rows;

        let equipoEnemigo = [];
        let seleccionados = new Set(); 
        let jerarquia = 1;

        while (equipoEnemigo.length < 6) {
            let poolSeleccionado;
            // RANGOS DE NIVEL SEGÚN LA SALA
            let minNivel = 5, maxNivel = 10;

            if (rondaActual === 1) {
                poolSeleccionado = (Math.random() * 100 <= 80) ? segurosPrimeraFase : segurosEvolucionados;
                minNivel = 5; maxNivel = 10;
            } else if (rondaActual === 2) {
                poolSeleccionado = (Math.random() * 100 <= 40) ? segurosPrimeraFase : segurosEvolucionados;
                minNivel = 10; maxNivel = 15;
            } else if (rondaActual === 3) {
                poolSeleccionado = segurosEvolucionados;
                minNivel = 15; maxNivel = 20;
            } else if (rondaActual === 4) {
                poolSeleccionado = segurosUltimaFase;
                minNivel = 20; maxNivel = 25;
            } else {
                poolSeleccionado = segurosUltimaFase;
                minNivel = 25; maxNivel = 30;
            }

            let disponibles = poolSeleccionado.filter(p => !seleccionados.has(p.id));
            if (disponibles.length === 0) {
                disponibles = rows.filter(p => !seleccionados.has(p.id));
            }

            const p = disponibles[Math.floor(Math.random() * disponibles.length)];
            seleccionados.add(p.id);

            // CÁLCULO DEL BUFF DE NIVEL
            const nivelAsignado = Math.floor(Math.random() * (maxNivel - minNivel + 1)) + minNivel;
            const multNivel = 1 + (nivelAsignado - 1) * 0.05;

            equipoEnemigo.push({
                id_personalizado: p.id,
                jerarquia: jerarquia,
                nombre: p.nombre,
                nivel: nivelAsignado,
                hp: Math.floor(p.hp * 2 * multNivel),       
                maxHp: Math.floor(p.hp * 2 * multNivel),    
                atk: Math.floor(p.ataque * multNivel),
                def: Math.floor(p.defensa * multNivel),
                spAtk: Math.floor(p.ataque_especial * multNivel),
                spDef: Math.floor(p.defensa_especial * multNivel),
                vel: Math.floor(p.velocidad), // La velocidad base no escala igual que las estadísticas ofensivas/defensivas
                tipos: p.type2 ? [p.type1, p.type2] : [p.type1],
                estado: 'activo',
                urlImagen: path.join(__dirname, '..', 'imagenes', `${p.cod_pokedex}.png`)
            });
            jerarquia++;
        }
        
        return equipoEnemigo;
    } catch (error) {
        console.error('Error generando equipo enemigo:', error);
        return [];
    }
}

async function generarRecompensaMazmorra(whatsappId) {
    const random = Math.random() * 100;
    let itemAsignado = '';
    let cantidad = 1;
    let columnaDb = '';

    if (random <= 30) { itemAsignado = 'Pokéballs'; columnaDb = 'pokeballs'; cantidad = 5; }
    else if (random <= 60) { itemAsignado = 'Monedas'; columnaDb = 'monedas'; cantidad = 50; }
    else if (random <= 80) { itemAsignado = 'Pociones XP'; columnaDb = 'pocion_xp_small'; cantidad = 2; }
    else if (random <= 93) { itemAsignado = 'Roca Evolutiva'; columnaDb = 'rocas_evolutivas'; cantidad = 1; }
    else if (random <= 98) { itemAsignado = 'Mega Energía'; columnaDb = 'mega_energia'; cantidad = 1; }
    else { itemAsignado = 'Punta ADN'; columnaDb = 'punta_adn'; cantidad = 1; }

    try {
        if (columnaDb === 'pokeballs' || columnaDb === 'monedas') {
            await db.execute(`UPDATE usuarios SET ${columnaDb} = ${columnaDb} + ? WHERE whatsapp_id = ?`, [cantidad, whatsappId]);
        } else {
            const [u] = await db.execute('SELECT id FROM usuarios WHERE whatsapp_id = ?', [whatsappId]);
            await db.execute(`UPDATE inventario SET ${columnaDb} = ${columnaDb} + ? WHERE usuario_id = ?`, [cantidad, u[0].id]);
        }
        return { item: itemAsignado, cantidad };
    } catch (error) {
        console.error('Error dando recompensa:', error);
        return null;
    }
}

module.exports = { validarEIngresarMazmorra, generarEquipoEnemigo, generarRecompensaMazmorra, obtenerImagenMazmorraAleatoria };