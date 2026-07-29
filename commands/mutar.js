const { consultarPokemon, getVariantesPokemon } = require('../services/pokeapi');
const pokemonService = require('../services/pokemonService');

// Función auxiliar para comparar las estadísticas (stats)
function sonStatsIguales(statsA, statsB) {
  if (!statsA || !statsB || statsA.length !== statsB.length) return false;
  for (let i = 0; i < statsA.length; i++) {
    if (statsA[i].base_stat !== statsB[i].base_stat) return false;
  }
  return true;
}

async function handleMutar(msg, texto) {
  const partes = texto.replace('#mutar', '').trim().split(' ');
  if (partes.length < 2) return await msg.reply('⚠️ *Uso:* #mutar [nombre_pokemon] [nombre_nueva_forma]');

  const nombrePokemon = partes[0];
  const nombreNuevaForma = partes.slice(1).join('-'); 

  const whatsappId = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];
  
  // Obtenemos los datos del Pokémon desde tu BD (esto incluye pokemon.punta_adn)
  const pokemon = await pokemonService.verificarYObtenerPokemon(whatsappId, nombrePokemon);

  if (!pokemon) return await msg.reply('❌ No tienes un Pokémon con ese nombre.');

  // 1. Obtener datos actuales de la API y todas sus variantes
  const data = await consultarPokemon(pokemon.pokemon_id);
  const todasLasVariantes = await getVariantesPokemon(data);

  // Verificamos qué tipo de variante es actualmente
  const nombreActualAPI = data.name.toLowerCase();
  const esMegaActual = nombreActualAPI.includes('mega');

  // Filtrado dinámico inteligente
  const variantesFiltradas = todasLasVariantes.filter(v => {
    const nombreV = v.toLowerCase();
    
    // Mantenemos bloqueado a los Primales a menos que ya sea uno
    if (nombreV.includes('primal') && !nombreActualAPI.includes('primal')) return false;

    const esMegaV = nombreV.includes('mega');

    // REGLA 1: No permitir mutar a Mega si el Pokémon base no es Mega actualmente
    if (esMegaV && !esMegaActual) return false;

    // Permitimos que filtre los gmax. La restricción de los Gmax poderosos se hará en la validación de stats.
    return true;
  });

  // 2. Búsqueda ultra flexible (ignora guiones y autocompleta el nombre base si falta)
  const formaEncontrada = variantesFiltradas.find(v => {
    const vNormalizado = v.toLowerCase().replace(/-/g, ' ');
    const inputNormalizado = nombreNuevaForma.toLowerCase().replace(/-/g, ' ');
    const pokemonBase = pokemon.nombre.toLowerCase().replace(/-/g, ' ');
    
    return vNormalizado === inputNormalizado || 
           vNormalizado === `${pokemonBase} ${inputNormalizado}`;
  });

  if (!formaEncontrada) {
    return await msg.reply(
        `❌ Variante inválida o no permitida para el estado actual de *${pokemon.nombre}*.\n` +
        `Opciones válidas: ${variantesFiltradas.map(v => v.replace(/-/g, ' ')).join(', ')}`
    );
  }

  // 3. Obtener los datos completos de la nueva forma seleccionada
  const dataNueva = await consultarPokemon(formaEncontrada);

  // 4. LÓGICA: Comparar stats y validar el desbloqueo permanente del ADN
  const statsSonIguales = sonStatsIguales(data.stats, dataNueva.stats);
  const tieneAdnActivado = pokemon.punta_adn === 1 || pokemon.punta_adn === true;

  // NUEVA REGLA PARA GMAX:
  // Si es un Gmax y las estadísticas cambian, es una Megaevolución técnica. Bloquear mutación.
  if (formaEncontrada.toLowerCase().includes('max') && !statsSonIguales) {
      return await msg.reply(`🛑 Esta forma Gigantamax (*${formaEncontrada.replace(/-/g, ' ')}*) altera enormemente el poder de combate. No es una simple mutación.\n\n👉 Para alcanzar esta forma necesitas usar el comando: *#use mega_energia ${pokemon.nombre}* y ser Nivel 10.`);
  }

  // Regla estándar: Si cambian las stats y el Pokémon NO tiene el ADN inyectado, bloqueamos
  if (!statsSonIguales && !tieneAdnActivado) {
    return await msg.reply(`🧬 La nueva variante altera las estadísticas de combate y tu Pokémon no tiene el ADN preparado.\n👉 Si tienes una Punta ADN en tu inventario, aplícasela primero usando: *#use punta_adn ${pokemon.nombre}*`);
  }

  // 5. Ejecutar cambio
  const exito = await pokemonService.cambiarVariantePokemon(pokemon.id, dataNueva.id, formaEncontrada);

  if (exito) {
    const tipoMutacion = statsSonIguales ? '(Mutación Estética)' : '(Mutación de Combate)';
    const nombreLimpio = formaEncontrada.replace(/-/g, ' ').toUpperCase();
    
    let mensajeExito = `✨ ¡Éxito! *${pokemon.nombre}* ha mutado a *${nombreLimpio}* ${tipoMutacion}.`;
    if (!statsSonIguales) {
      mensajeExito += `\n🧬 _El ADN adaptativo sigue activo en este Pokémon._`;
    }
    
    await msg.reply(mensajeExito);
  } else {
    await msg.reply('⚠️ Error al aplicar la mutación.');
  }
}

module.exports = { handleMutar };