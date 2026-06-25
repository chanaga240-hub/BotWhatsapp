const usuarioService = require('../services/usuarioService');

const { replyText } = require('../services/reply');

const AYUDA =
  `📋 *MENÚ GENERAL DE COMANDOS POKÉMON* 📋\r\n` +
  `───────────────────────\r\n\r\n` +
  
  `🆕 *GESTIÓN DE ENTRENADOR*\r\n` +
  `• *#pokeregister*\r\n` +
  `  Crea tu perfil inicial y recibe *10 Pokéballs* 🎒.\r\n` +
  `• *#pokedaily*\r\n` +
  `  Reclama tus *5 Pokéballs* gratuitas cada 24 horas 🎁.\r\n` +
  `• *#pokedex*\r\n` +
  `  Muestra tus Pokémon capturados (*Envío al privado* 📬).\r\n\r\n` +

  `🕵️ *EXPLORACIÓN Y CAPTURA*\r\n` +
  `• *#pokemon*\r\n` +
  `  Información detallada de un Pokémon aleatorio.\r\n` +
  `• *#pokemon [nombre]*\r\n` +
    `• *#pokerealease [nombre]*\r\n` +
    `  Libera un Pokémon de tu Pokédex y lo convierte en un Pokémon salvaje en los grupos permitidos.\r\n` +
  `  Busca un Pokémon por su nombre (ej: _#pokemon charizard_).\r\n` +
  `• *#capture*\r\n` +
  `  Intenta atrapar al Pokémon salvaje activo (20% éxito) 💥.\r\n\r\n` +

  `⚔️ *COMBATES POKÉMON*\r\n` +
  `• *#pokebatle @mencion [nombre]*\r\n` +
  `  Reta a un amigo usando un Pokémon de tu Pokédex.\r\n` +
  `  _(Ej: #pokebatle @Marco Gengar)_\r\n` +
  `• *#poketrain [nombre]*\r\n` +
  `  Entrena a un Pokémon y gana +5 de experiencia.\r\n` +
  `• *#pokestats*\r\n` +
  `  Muestra tus estadísticas de entrenador y el total de Pokémon capturados.\r\n` +
  `• *#pokestas @mención*\r\n` +
  `• *#pokeaccept [nombre]*\r\n` +
  `  Acepta un desafío activo defendiéndote con tu propio Pokémon.\r\n` +
  `  _(Ej: #pokeaccept Tyranitar)_\r\n\r\n` +

  `🔮 *EXTRAS Y UTILIDADES*\r\n` +
  `• *#poketeam*\r\n` +
  `  Genera un equipo aleatorio de 6 Pokémon con stickers.\r\n` +
  `• *#pokehelp*\r\n` +
  `  Muestra esta guía de comandos en el chat.\r\n\r\n` +

  `───────────────────────\r\n` +
  `👑 *COMANDOS ADMIN*\r\n` +
  `• *#pokesalvaje*\r\n` +
  `  Invoca un Pokémon salvaje con estadísticas en el grupo.\r\n\r\n` +
  `───────────────────────\r\n` +
  `🎒 _Nota: Los Pokémon de las alertas se envían en formato Sticker para no saturar tu almacenamiento._`;

async function handlePokehelp(msg) {
  await replyText(msg, AYUDA);
}

module.exports = { handlePokehelp };