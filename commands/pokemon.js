const usuarioService = require('../services/usuarioService');
const db = require('../services/database'); // Importamos la conexión a BD

const {
  consultarPokemon,
  getImagen,
  getNombreEspanol,
  getHabilidadesEspanol,
  getTiposEspanol,
  randomPokemonId,
} = require('../services/pokeapi');

const { replyText, replyWithImage } = require('../services/reply');

async function handlePokemon(msg, busqueda = null) {
  try {
    let data;

    if (busqueda) {
      console.log(`[${new Date().toLocaleTimeString()}] Buscando Pokémon por nombre: ${busqueda}...`);
      try {
        // 1. Intentamos buscar en la PokéAPI Oficial
        data = await consultarPokemon(busqueda);
      } catch {
        // 2. Si falla, buscamos en los registros personalizados de la Base de Datos
        const [customRows] = await db.execute(
            'SELECT * FROM pokemon_personalizados WHERE LOWER(nombre) = LOWER(?) OR id = ? LIMIT 1', 
            [busqueda, busqueda]
        );

        if (customRows.length > 0) {
            const p = customRows[0];
            // Construimos un objeto que imite la estructura de la PokéAPI
            data = {
                id: p.cod_pokedex || p.id,
                name: p.nombre,
                height: 15,  // Valores genéricos (la BD personalizada no suele tener peso/altura)
                weight: 500,
                abilities: [], // Dejamos vacío para que el bot asigne "Desconocida"
                types: [{ type: { name: p.type1 } }],
                stats: [
                    { base_stat: p.hp, stat: { name: 'hp' } },
                    { base_stat: p.ataque, stat: { name: 'attack' } },
                    { base_stat: p.defensa, stat: { name: 'defense' } },
                    { base_stat: p.ataque_especial, stat: { name: 'special-attack' } },
                    { base_stat: p.defensa_especial, stat: { name: 'special-defense' } },
                    { base_stat: p.velocidad, stat: { name: 'speed' } }
                ]
            };
            
            // Si tiene segundo tipo, lo agregamos
            if (p.type2) {
                data.types.push({ type: { name: p.type2 } });
            }
            
            console.log(`[Bot] Pokémon personalizado "${p.nombre}" encontrado con éxito.`);
        } else {
            // Si tampoco está en la BD local, lanzamos el mensaje de error final
            await replyText(
              msg,
              `❌ *Error:* No logré encontrar a un Pokémon llamado _"${busqueda}"_ ni en la Pokédex oficial ni en los registros personalizados.`
            );
            return;
        }
      }
    } else {
      // Si no se pasó argumento, buscamos uno aleatorio oficial
      const randomId = randomPokemonId();
      data = await consultarPokemon(randomId);
    }

    // Obtenemos los textos en español
    const [nombre, habilidades, tipos] = await Promise.all([
      getNombreEspanol(data),
      getHabilidadesEspanol(data),
      Promise.resolve(getTiposEspanol(data)),
    ]);

    const idFormateado = String(data.id).padStart(3, '0');
    const altura = (data.height / 10).toFixed(1);
    const peso = (data.weight / 10).toFixed(1);

    const statsMap = {
      hp: '❤️ Vida',
      attack: '⚔️ Ataque',
      defense: '🛡️ Defensa',
      'special-attack': '💥 Atk. Especial',
      'special-defense': '🔰 Def. Especial',
      speed: '⚡ Velocidad',
    };

    const estadisticas = data.stats
      .filter((s) => statsMap[s.stat.name])
      .map((s) => `${statsMap[s.stat.name]}: *${s.base_stat}*`)
      .join('\r\n');

    const velocidadStat = data.stats.find(s => s.stat.name === 'speed');
    const velocidadBase = velocidadStat ? velocidadStat.base_stat : 0;
    
    let probEsquive = velocidadBase / 20;
    if (probEsquive > 30) probEsquive = 30;

    const urlImagen = getImagen(data);

    // Ajustamos la variable "habilidades" por si el Pokémon es personalizado y el array está vacío
    const textoHabilidades = habilidades ? habilidades : 'Desconocida (Mutación)';

    const mensaje =
      `✨ *¡POKÉMON AVISTADO!* ✨\r\n` +
      `──────────────────────\r\n\r\n` +
      `🆔 *Nº Pokédex:* #${idFormateado}\r\n\r\n` +
      `👤 *Nombre:* _${nombre}_\r\n\r\n` +
      `🏷️ *Tipo:* [ *${tipos}* ]\r\n\r\n` +
      `📊 *DATOS FÍSICOS*\r\n` +
      `• *Altura:* ${altura} m\r\n` +
      `• *Peso:* ${peso} kg\r\n` +
      `• *Habilidades:* _${textoHabilidades}_\r\n\r\n` +
      `⚔️ *ESTADÍSTICAS BASE*\r\n` +
      `${estadisticas}\r\n` +
      `💨 *Prob. Esquivar:* ${probEsquive.toFixed(1)}%`;

    await replyWithImage(msg, urlImagen, mensaje);
    console.log(`[Bot] Datos e imagen de ${nombre} enviados correctamente.`);

  } catch (error) {
    console.error('Error general en #pokemon:', error);
  }
}

module.exports = { handlePokemon };