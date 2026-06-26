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
    mensaje += `🔴 *Pokéballs:* ${inv.pokeballs}\n`;
    mensaje += `🧪 *pocion_xp:* ${inv.pocion_xp_small}\n`;
    mensaje += `──────────────────────\n`;
    mensaje += `👉 _Usa #buy para adquirir más objetos._`;

    return await replyText(msg, mensaje);

  } catch (error) {
    console.error('Error en #inventario:', error);
    await replyText(msg, '⚠️ Hubo un error al consultar tu inventario.');
  }
}

module.exports = { handleInventario };