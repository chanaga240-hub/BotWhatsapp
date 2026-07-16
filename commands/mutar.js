const { consultarPokemon, getVariantesPokemon, getNombreEspanol } = require('../services/pokeapi');
const pokemonService = require('../services/pokemonService');
const usuarioService = require('../services/usuarioService');

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

  // 1. Obtener datos y variantes del Pokémon actual
  const data = await consultarPokemon(pokemon.pokemon_id);
  const todasLasVariantes = await getVariantesPokemon(data);

  // Filtramos formas Mega y Primal
  const variantesFiltradas = todasLasVariantes.filter(v => {
    const nombre = v.toLowerCase();
    return !nombre.includes('-mega') && !nombre.includes('-primal');
  });

  // 2. Búsqueda flexible
  const formaEncontrada = variantesFiltradas.find(v => {
    const vNormalizado = v.toLowerCase().replace(/-/g, ' ');
    const inputNormalizado = nombreNuevaForma.toLowerCase().replace(/-/g, ' ');
    return vNormalizado === inputNormalizado;
  });

  if (!formaEncontrada) {
    return await msg.reply(
        `❌ Variante no encontrada para ${pokemon.nombre}.\n` +
        `Opciones válidas: ${variantesFiltradas.map(v => v.replace(/-/g, ' ')).join(', ')}`
    );
  }

  // 3. Obtener los datos completos de la nueva forma seleccionada
  const dataNueva = await consultarPokemon(formaEncontrada);

  // 4. LÓGICA: Comparar stats y validar el desbloqueo permanente del ADN
  const statsSonIguales = sonStatsIguales(data.stats, dataNueva.stats);
  
  // Verificamos en la tabla pokemon_atrapados si este ejemplar ya tiene el ADN activado
  const tieneAdnActivado = pokemon.punta_adn === 1 || pokemon.punta_adn === true;

  // Si cambian las stats y el Pokémon NO tiene el ADN inyectado, bloqueamos
  if (!statsSonIguales && !tieneAdnActivado) {
    return await msg.reply(`🧬 La nueva variante altera las estadísticas de combate y tu Pokémon no tiene el ADN preparado.\n👉 Si tienes una Punta ADN en tu inventario, aplícasela primero usando: \`#use punta_adn ${pokemon.nombre}\``);
  }

  // 5. Ejecutar cambio (El ADN permanece activado en la BD para futuros cambios)
  const exito = await pokemonService.cambiarVariantePokemon(pokemon.id, dataNueva.id, formaEncontrada);

  if (exito) {
    const tipoMutacion = statsSonIguales ? '(Mutación Estética)' : '(Mutación de Combate)';
    
    let mensajeExito = `✨ ¡Éxito! *${pokemon.nombre}* ha mutado a *${formaEncontrada}* ${tipoMutacion}.`;
    if (!statsSonIguales) {
      mensajeExito += `\n🧬 _El ADN adaptativo sigue activo en este Pokémon._`;
    }
    
    await msg.reply(mensajeExito);
  } else {
    await msg.reply('⚠️ Error al aplicar la mutación.');
  }
}

module.exports = { handleMutar };