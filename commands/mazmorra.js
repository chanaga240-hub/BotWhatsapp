const { MessageMedia } = require('whatsapp-web.js');
const mazmorraService = require('../services/mazmorraService');
const pokemonService = require('../services/pokemonService');
const { consultarPokemon, getStat, getImagen } = require('../services/pokeapi');
const { ejecutarMatchupPvE } = require('../services/pveBattleService'); 

const activeDungeons = new Map();

async function prepararEquipoMazmorra(equipoBD) {
    const equipoPreparado = [];
    for (let p of equipoBD) {
        let dataApi;
        try { dataApi = await consultarPokemon(p.pokemon_id); } catch(e) { continue; }
        
        const multNivel = 1 + ((p.nivel || 1) - 1) * 0.05;
        equipoPreparado.push({
            ...p,
            hp: Math.floor(getStat(dataApi, 'hp') * 2 * multNivel),
            maxHp: Math.floor(getStat(dataApi, 'hp') * 2 * multNivel),
            atk: Math.floor(getStat(dataApi, 'attack') * multNivel),
            def: Math.floor(getStat(dataApi, 'defense') * multNivel),
            spAtk: Math.floor(getStat(dataApi, 'special-attack') * multNivel),
            spDef: Math.floor(getStat(dataApi, 'special-defense') * multNivel),
            vel: Math.floor(getStat(dataApi, 'speed')),
            tipos: dataApi.types.map(t => t.type.name),
            urlImagen: getImagen(dataApi)
        });
    }
    return equipoPreparado;
}

async function handleMazmorra(client, msg, args) {
    const whatsappId = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];
    const pushname = msg._data?.notifyName || msg.pushname || 'Explorador';

    // 1. COMANDO BASE: #mazmorra
    if (args.length === 0) {
        if (activeDungeons.has(whatsappId)) {
            return await msg.reply('❌ Ya te encuentras dentro de una mazmorra. Usa `#mazmorra puerta [1, 2 o 3] [tu_pokemon]` para avanzar.');
        }

        const equipoUsuarioBD = await pokemonService.obtenerEquipoPokemon(whatsappId);
        if (equipoUsuarioBD.length === 0) {
            return await msg.reply('❌ Debes configurar un equipo Pokémon usando *#poketeam join* antes de entrar a la mazmorra. ¡Tu llave está a salvo!');
        }

        const ingreso = await mazmorraService.validarEIngresarMazmorra(whatsappId);
        
        if (ingreso.error === 'sin_llave') return await msg.reply('❌ No tienes llaves de mazmorra en tu inventario.');
        if (ingreso.error === 'cooldown') return await msg.reply(`⏳ La mazmorra está sellada. Vuelve en ${ingreso.horas}h ${ingreso.mins}m.`);
        if (ingreso.error) return await msg.reply('⚠️ Error al intentar acceder a la mazmorra.');

        await msg.reply('⏳ Abriendo las grandes puertas... Preparando a tu equipo para la expedición.');
        const equipoListoParaBatalla = await prepararEquipoMazmorra(equipoUsuarioBD);

        activeDungeons.set(whatsappId, {
            rondaActual: 1,
            equipoUsuario: equipoListoParaBatalla, 
            nombre: pushname,
            batallaActiva: false,
            necesitaCambio: false,        
            jerarquiaActiva: 1,           
            jerarquiaIAActiva: 1,         
            equipoEnemigoActual: null,
            botin: {} 
        });

        const imagenCamino = mazmorraService.obtenerImagenMazmorraAleatoria();
        const textoEntrada = '💀 *HAS INGRESADO A UNA MAZMORRA DE BATALLA*\n\nFrente a ti hay 3 puertas oscuras. Elige la puerta y el Pokémon con el que iniciarás el combate.\n\n👉 Usa: `#mazmorra puerta [1, 2 o 3] [posicion_pokemon_1_al_6]`\nEjemplo: `#mazmorra puerta 2 1`';

        try {
            const media = MessageMedia.fromFilePath(imagenCamino);
            await msg.reply(media, undefined, { caption: textoEntrada });
        } catch (e) {
            await msg.reply(textoEntrada);
        }
        return;
    }

    // 2. SUB-COMANDO: #mazmorra puerta [puerta] [pokemon]
    if (args[0].toLowerCase() === 'puerta') {
        if (!activeDungeons.has(whatsappId)) return await msg.reply('❌ No estás en ninguna mazmorra. Usa `#mazmorra` para entrar.');
        
        const dungeonState = activeDungeons.get(whatsappId);
        if (dungeonState.batallaActiva) return await msg.reply('❌ ¡Ya abriste una puerta! Termina tu combate actual.');

        const opcionPuerta = parseInt(args[1]);
        const posicionPoke = parseInt(args[2]);

        if (isNaN(opcionPuerta) || opcionPuerta < 1 || opcionPuerta > 3) {
            return await msg.reply('❌ Elige una puerta válida (1, 2 o 3).');
        }
        if (isNaN(posicionPoke) || posicionPoke < 1 || posicionPoke > 6) {
            return await msg.reply('❌ Debes elegir qué Pokémon de tu equipo enviaras primero (1 al 6).\n👉 Ejemplo: `#mazmorra puerta 1 3`');
        }

        const pokeElegido = dungeonState.equipoUsuario.find(p => p.jerarquia === posicionPoke);
        if (!pokeElegido) return await msg.reply(`❌ No tienes un Pokémon asignado en la posición ${posicionPoke}.`);
        if (pokeElegido.hp <= 0) return await msg.reply(`❌ *${pokeElegido.nombre}* está debilitado. ¡Elige a otro!`);

        await msg.reply(`🚪 Abriendo la puerta ${opcionPuerta}... ¡Enemigos detectados! Tú envías a *${pokeElegido.nombre}*.`);
        
        // CORRECCIÓN AQUÍ: Pasamos la ronda actual para que el nivel y las fases escalen correctamente.
        const equipoEnemigo = await mazmorraService.generarEquipoEnemigo(dungeonState.rondaActual);
        
        dungeonState.batallaActiva = true;
        dungeonState.equipoEnemigoActual = equipoEnemigo; 
        dungeonState.jerarquiaActiva = pokeElegido.jerarquia; 
        dungeonState.jerarquiaIAActiva = 1;
        dungeonState.necesitaCambio = false;
        
        await ejecutarMatchupPvE(whatsappId, dungeonState, equipoEnemigo, msg);
        return;
    }

    // 3. SUB-COMANDO: #mazmorra switch [1-6]
    if (args[0].toLowerCase() === 'switch') {
        const dungeonState = activeDungeons.get(whatsappId);
        
        if (!dungeonState) return await msg.reply('❌ No estás en ninguna mazmorra.');
        if (!dungeonState.batallaActiva) return await msg.reply('❌ No hay ninguna batalla activa.');
        if (!dungeonState.necesitaCambio) return await msg.reply('⚠️ No es tu turno de cambiar. Tu Pokémon actual sigue en pie.');

        const jerarquia = parseInt(args[1]);
        if (isNaN(jerarquia) || jerarquia < 1 || jerarquia > 6) return await msg.reply('❌ Elige una posición válida de tu equipo (del 1 al 6).');

        const nuevoPoke = dungeonState.equipoUsuario.find(p => p.jerarquia === jerarquia);

        if (!nuevoPoke) return await msg.reply(`❌ No tienes un Pokémon asignado en la posición ${jerarquia}.`);
        if (nuevoPoke.hp <= 0) return await msg.reply(`❌ *${nuevoPoke.nombre}* está debilitado. ¡Elige a otro!`);

        dungeonState.jerarquiaActiva = nuevoPoke.jerarquia;
        dungeonState.necesitaCambio = false;

        await msg.reply(`🔄 Envías a *${nuevoPoke.nombre}* a la batalla.`);
        
        const equipoIA = dungeonState.equipoEnemigoActual; 
        await ejecutarMatchupPvE(whatsappId, dungeonState, equipoIA, msg);
        return;
    }
}

module.exports = { name: 'mazmorra', execute: handleMazmorra, activeDungeons };