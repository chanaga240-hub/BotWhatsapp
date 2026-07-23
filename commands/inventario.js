const usuarioService = require('../services/usuarioService');
const { replyText } = require('../services/reply');

async function handleInventario(msg) {
  try {
    const whatsappId = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];
    
    const inv = await usuarioService.obtenerInventarioCompleto(whatsappId);
    
    if (!inv) {
      return await replyText(msg, '❌ No estás registrado. Usa `#pokeregister` para comenzar.');
    }

    let mensaje = `🎒 *TU INVENTARIO* 🎒\n`;
    mensaje += `──────────────────────\n`;
    mensaje += `💰 *Monedas:* ${inv.monedas}\n`;
    mensaje += `🔴 *Pokéballs:* ${inv.pokeballs}\n`;
    mensaje += `🧪 *Poción XP:* ${inv.pocion_xp_small}\n`;
    mensaje += `🪨 *Roca Evolutiva:* ${inv.rocas_evolutivas}\n`;
    mensaje += `🧬 *Punta ADN:* ${inv.punta_adn}\n`;
    mensaje += `🥚 *Huevo Pokémon:* ${inv.egg}\n`;
    mensaje += `🧿 *Mega Energía:* ${inv.mega_energia}\n`;
    mensaje += `🗝️ *Llave Mazmorra:* ${inv.llave_mazmorra}\n`;
    mensaje += `──────────────────────\n`;
    mensaje += `👉 _Usa #buy para adquirir más objetos._`;

    return await replyText(msg, mensaje);

  } catch (error) {
    console.error('Error en #inventario:', error);
    await replyText(msg, '⚠️ Hubo un error al consultar tu inventario.');
  }
}

module.exports = { handleInventario };