const pokemonService = require('../services/pokemonService');
const { consultarPokemon, getImagen, getStat, getTiposEspanol } = require('../services/pokeapi');
const { generarCollagePokemon } = require('../services/canvasService');
const { MessageMedia } = require('whatsapp-web.js');

async function handlePokedex(msg, texto, bot, usuario) {
  const whatsappId = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];
  const args = texto.trim().toLowerCase().split(/\s+/);
  const subComando = args[1]; // Detectar si escribió "cultivo" o "mina"

  // ==========================================
  // VALIDACIÓN DE ESCRITURA (SUB-COMANDOS)
  // ==========================================
  if (subComando && !['cultivo', 'mina'].includes(subComando)) {
    return await msg.reply(
      '❌ *Filtro incorrecto o mal escrito.*\n\n' +
      'Las opciones válidas para consultar tu Pokédex son:\n\n' +
      '🎒 *#pokedex* (Muestra todos tus Pokémon)\n' +
      '🌱 *#pokedex cultivo* (Filtra especialistas para la Granja)\n' +
      '⛏️ *#pokedex mina* (Filtra especialistas para la Mina)'
    );
  }

  try {
    const listaPokemon = await pokemonService.obtenerPokedex(whatsappId);
    if (!listaPokemon || listaPokemon.length === 0) {
      return await msg.reply('🎒 Tu Pokédex está vacía. ¡Invoca un #pokesalvaje!');
    }

    const chatPrivadoId = msg.fromMe ? bot.client.info.wid._serialized : (msg.author || msg.from);

    // ==========================================
    // CONFIGURACIÓN DE FILTROS PARA TRABAJOS
    // ==========================================
    let filtroActivo = null;
    let mensajeFiltro = '';
    
    if (subComando === 'cultivo') {
      filtroActivo = ['grass', 'water', 'ground']; // Planta, Agua, Tierra
      mensajeFiltro = '\n🌱 *[Filtro Activo: Especialistas de Cultivo]*';
    } else if (subComando === 'mina') {
      filtroActivo = ['fighting', 'rock', 'steel']; // Lucha, Roca, Acero
      mensajeFiltro = '\n⛏️ *[Filtro Activo: Especialistas de Mina]*';
    }

    await bot.client.sendMessage(chatPrivadoId, `📱 *POKÉDEX DE ${usuario.nombre_whatsapp.toUpperCase()}*${mensajeFiltro}\nRevisando datos y agrupando Pokémon...`);

    const pokedexProcesada = [];

    // Pre-procesamos y filtramos rápidamente usando la caché de tu Base de Datos
    for (const p of listaPokemon) {
      let nombreBase = p.nombre.toLowerCase().trim();
      if (nombreBase === 'oinkologne') nombreBase = p.genero === 'female' ? 'oinkologne-female' : 'oinkologne-male';
      if (nombreBase.includes('urshifu')) nombreBase = 'urshifu-single-strike';

      let dataApi = null;
      try { dataApi = await consultarPokemon(nombreBase); } catch (err) {}

      if (dataApi) {
        let pasaFiltro = true;
        let pureType = 'mixto';

        // Si hay un filtro de trabajo, REQUERIMOS que sea de un tipo PURO y válido
        if (filtroActivo) {
          if (dataApi.types.length !== 1) {
            pasaFiltro = false; // Descartamos tipos duales
          } else {
            pureType = dataApi.types[0].type.name;
            if (!filtroActivo.includes(pureType)) {
              pasaFiltro = false; // Descartamos tipos que no sirven para el trabajo
            }
          }
        }

        if (pasaFiltro) {
          const nivelActual = p.nivel || 1;
          const multNivel = 1 + (nivelActual - 1) * 0.05;

          pokedexProcesada.push({
            nombre: p.nombre,
            nivel: nivelActual,
            experiencia: p.experiencia || 0,
            tipos: getTiposEspanol(dataApi),
            pureType: pureType, // Clave para agrupar por tipo después
            hp: Math.floor((getStat(dataApi, 'hp') || 0) * 2 * multNivel),
            atk: Math.floor((getStat(dataApi, 'attack') || 0) * multNivel),
            def: Math.floor((getStat(dataApi, 'defense') || 0) * multNivel),
            spAtk: Math.floor((getStat(dataApi, 'special-attack') || 0) * multNivel),
            spDef: Math.floor((getStat(dataApi, 'special-defense') || 0) * multNivel),
            vel: Math.floor((getStat(dataApi, 'speed') || 0)),
            spriteUrl: getImagen(dataApi)
          });
        }
      }
    }

    // Validamos si quedó algún Pokémon tras aplicar el filtro
    if (pokedexProcesada.length === 0) {
        if (filtroActivo) {
            return await bot.client.sendMessage(chatPrivadoId, `⚠️ Tu caja está vacía para este trabajo.\nRecuerda que para esta labor requieres Pokémon de tipo *PURO* y específicos de la tarea.`);
        }
    }

    // Si se usó un filtro, ordenamos el array: Primero por Tipo y luego por Nivel (Mayor a Menor)
    if (filtroActivo) {
        pokedexProcesada.sort((a, b) => a.pureType.localeCompare(b.pureType) || b.nivel - a.nivel);
    }

    // ==========================================
    // RENDERIZADO Y ENVÍO EN BLOQUES DE 10
    // ==========================================
    const bloques = [];
    for (let i = 0; i < pokedexProcesada.length; i += 10) {
      bloques.push(pokedexProcesada.slice(i, i + 10));
    }

    for (const [index, bloque] of bloques.entries()) {
      const imageBuffer = await generarCollagePokemon(bloque);
      const media = new MessageMedia('image/png', imageBuffer.toString('base64'), `pokedex_${index}.png`);

      await bot.client.sendMessage(chatPrivadoId, media, {
        caption: `📦 *Hoja de Pokédex ${index + 1}/${bloques.length}*`
      });
      
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    bot.log(`[Bot] Pokédex enviada a ${usuario.nombre_whatsapp}`, 'info');

  } catch (err) {
    console.error('Error en #pokedex:', err);
    await msg.reply('⚠️ Hubo un error procesando tu Pokédex.');
  }
}

module.exports = { handlePokedex };