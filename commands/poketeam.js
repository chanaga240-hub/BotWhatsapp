const usuarioService = require('../services/usuarioService');


const {
  consultarPokemon,
  getImagen,
  getNombreEspanol,
  getTiposEspanol,
  randomPokemonId,
} = require('../services/pokeapi');
const { replyWithLabeledStickers } = require('../services/reply');

async function handlePoketeam(msg) {
  try {
    console.log(`[${new Date().toLocaleTimeString()}] Generando escuadra de 6 Pokémon...`);

    const promesas = Array.from({ length: 6 }, () => {
      const randomId = randomPokemonId();
      return consultarPokemon(randomId);
    });

    const listaPokemon = await Promise.all(promesas);
    const detalles = await Promise.all(
      listaPokemon.map(async (data) => ({
        data,
        nombre: await getNombreEspanol(data),
        tipos: getTiposEspanol(data),
        urlImagen: getImagen(data),
      }))
    );

    let equipoMensaje =
      `🔥 *¡TU EQUIPO POKÉMON (6)!* 🔥\r\n` +
      `──────────────────────\r\n\r\n`;

    detalles.forEach((pokemon, index) => {
      equipoMensaje +=
        `*Slot #${index + 1}* 🛡️\r\n` +
        `• *Nombre:* ${pokemon.nombre}\r\n` +
        `• *Tipo:* [ _${pokemon.tipos}_ ]\r\n\r\n`;
    });

    equipoMensaje += `──────────────────────`;

    const labeledStickers = detalles.map((pokemon) => ({
      url: pokemon.urlImagen,
      stickerName: pokemon.nombre,
    }));

    await replyWithLabeledStickers(msg, equipoMensaje, labeledStickers, true);
    console.log('[Bot] Enviado: EQUIPO DE 6');
  } catch (error) {
    console.error('Error en #poketeam:', error);
  }
}

module.exports = { handlePoketeam };
