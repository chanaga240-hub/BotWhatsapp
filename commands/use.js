const pokemonService = require('../services/pokemonService');
const usuarioService = require('../services/usuarioService');
const { consultarPokemon, getEvolucionesInmediatas, formatName } = require('../services/pokeapi');
const { replyText } = require('../services/reply');

async function handleUse(msg, texto) {
  const partes = texto.replace('#use', '').trim().split(' ');
  const item = partes[0]?.toLowerCase();

  if (!item || partes.length < 2) {
    return await replyText(msg, '❌ Formato: `#use [objeto] (nombre_pokemon)`\n👉 Ejemplo: `#use rocas_evolutivas Pikachu`');
  }

  const whatsappId = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];

  // ==========================================
  // LÓGICA: POCIÓN XP
  // ==========================================
  if (item === 'pocion_xp') {
    const nombrePokemon = partes.slice(1).join(' '); // Tomamos todo lo que sigue como el nombre
    const resultado = await pokemonService.usarPocionXp(whatsappId, nombrePokemon);
    
    if (resultado.error === 'sin_objetos') return await replyText(msg, '🧪 No tienes Pociones XP Small en tu inventario.');
    if (resultado.error === 'pokemon_no_encontrado') return await replyText(msg, '❌ No tienes un Pokémon con ese nombre.');
    
    return await replyText(msg, `✅ ¡Has usado una Poción XP en *${resultado.nombre}*! (+50 XP)`);
  }

  // ==========================================
  // LÓGICA: ROCAS EVOLUTIVAS
  // ==========================================
  if (item === 'rocas_evolutivas' || item === 'roca_evolutiva') {
    let nombrePokemon = partes.slice(1).join(' ');
    let evolucionDeseada = null;

    // 1. Intentar buscar el Pokémon asumiendo que el usuario NO escribió la evolución deseada (ej. "#use rocas_evolutivas Eevee")
    let pokemon = await pokemonService.verificarYObtenerPokemon(whatsappId, nombrePokemon);

    // 2. Si no lo encuentra, verificar si la última palabra era la evolución (ej. "#use rocas_evolutivas Eevee Vaporeon")
    if (!pokemon && partes.length > 2) {
      const posiblesNombres = partes.slice(1, -1).join(' '); // "Eevee"
      const posibleEvo = partes[partes.length - 1];          // "Vaporeon"
      
      pokemon = await pokemonService.verificarYObtenerPokemon(whatsappId, posiblesNombres);
      if (pokemon) {
        nombrePokemon = posiblesNombres;
        evolucionDeseada = posibleEvo.toLowerCase();
      }
    }

    if (!pokemon) {
      return await replyText(msg, '❌ No tienes un Pokémon con ese nombre o lo escribiste mal.');
    }

    // 3. Validar nivel mínimo (>= 5)
    if (pokemon.nivel < 5) {
      return await replyText(msg, `⚠️ Tu *${pokemon.nombre}* es nivel ${pokemon.nivel}.\nNecesita ser al menos nivel 5 para poder evolucionar.`);
    }

    // 4. Calcular cantidad de rocas y validar inventario
    const evolucionesRealizadas = pokemon.evoluciones || 0;
    const rocasNecesarias = evolucionesRealizadas + 1;

    const inventario = await usuarioService.obtenerInventarioCompleto(whatsappId);
    const rocasActuales = inventario ? inventario.rocas_evolutivas : 0;
    
    if (rocasActuales < rocasNecesarias) {
      return await replyText(msg, `💎 No tienes suficientes Rocas Evolutivas.\n\n🎒 Tienes: *${rocasActuales}*\n📈 Necesitas: *${rocasNecesarias}* para realizar la evolución #${rocasNecesarias}.`);
    }

    // 5. Consultar evoluciones en la PokeAPI
    let dataActual;
    try {
      dataActual = await consultarPokemon(pokemon.pokemon_id);
    } catch (e) {
      return await replyText(msg, '⚠️ Error al conectar con la PokéAPI para consultar a tu Pokémon.');
    }

    const evoluciones = await getEvolucionesInmediatas(dataActual);
    if (evoluciones.length === 0) {
      return await replyText(msg, `✨ *${pokemon.nombre}* ya ha alcanzado su forma final o no tiene evoluciones registradas.`);
    }

    let nombreNuevaEvo;

    // 6. MANEJO DE RAMAS EVOLUTIVAS MÚLTIPLES (Eevee, Tyrogue, Gloom, etc)
    if (evoluciones.length > 1) {
      // Si el usuario no especificó qué evolución quiere
      if (!evolucionDeseada) {
        const listaFormateada = evoluciones.map(e => formatName(e)).join(', ');
        return await replyText(msg, 
          `✨ Tu *${pokemon.nombre}* tiene varias rutas evolutivas posibles:\n👉 *${listaFormateada}*\n\n` +
          `Específica a cuál quieres evolucionar añadiendo el nombre al final del comando.\n` +
          `*Ejemplo:* \`#use rocas_evolutivas ${pokemon.nombre} ${formatName(evoluciones[0])}\``
        );
      }

      // Si el usuario especificó una, verificamos que sea una evolución válida para este Pokémon
      const evoMatch = evoluciones.find(e => e.toLowerCase() === evolucionDeseada);
      if (!evoMatch) {
        const listaFormateada = evoluciones.map(e => formatName(e)).join(', ');
        return await replyText(msg, `❌ *${formatName(evolucionDeseada)}* no es una evolución válida para *${pokemon.nombre}*.\nLas opciones son: *${listaFormateada}*`);
      }
      
      nombreNuevaEvo = evoMatch; // Asignamos la evolución elegida
    } else {
      // Si solo tiene una única ruta, ignoramos si escribió algo de más y tomamos la obligatoria.
      nombreNuevaEvo = evoluciones[0];
    }

    // 7. Consultar los datos del Pokémon destino
    let dataNuevaEvo;
    try {
      dataNuevaEvo = await consultarPokemon(nombreNuevaEvo);
    } catch (e) {
      return await replyText(msg, '⚠️ Error al obtener los datos de la nueva evolución en la PokéAPI.');
    }

    const nuevoNombreFormateado = formatName(dataNuevaEvo.name);

    // 8. Ejecutar Transacción SQL
    const exito = await pokemonService.evolucionarPokemon(
      pokemon.usuario_id, 
      pokemon.id, 
      dataNuevaEvo.id, 
      nuevoNombreFormateado, 
      rocasNecesarias
    );

    if (exito) {
      return await replyText(msg, `🎉 ¡Qué increíble!\n\n✨ Tu *${pokemon.nombre}* ha evolucionado a *${nuevoNombreFormateado}* ✨\n\n💎 Has gastado ${rocasNecesarias} Roca(s) Evolutiva(s).`);
    } else {
      return await replyText(msg, '⚠️ Hubo un error interno al guardar la evolución en tu base de datos.');
    }
  }

  return await replyText(msg, '❌ Ese objeto no se puede usar o no existe.\nIntenta con `pocion_xp` o `rocas_evolutivas`.');
}

module.exports = { handleUse };