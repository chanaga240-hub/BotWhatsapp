const usuarioService = require('../services/usuarioService');
const { replyText } = require('../services/reply');
const { MessageMedia } = require('whatsapp-web.js');
const { generarImagenInventario } = require('../services/canvasService');

async function handleInventario(msg) {
  try {
    const whatsappId = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];
    
    // Obtenemos todos los datos (monedas, pokeballs y cosas del inventario)
    const inv = await usuarioService.obtenerInventarioCompleto(whatsappId);
    
    if (!inv) {
      return await replyText(msg, '❌ No estás registrado. Usa `#pokeregister` para comenzar.');
    }

    // Como necesitamos el nombre del usuario para el título, lo buscamos
    const usuario = await usuarioService.obtenerUsuario(whatsappId);
    const nombreEntrenador = usuario ? usuario.nombre_whatsapp : 'Entrenador';

    // Avisamos que estamos generando la imagen
    await replyText(msg, '⏳ Abriendo tu mochila...');

    try {
      // Generamos la imagen
      const imageBuffer = await generarImagenInventario(inv, nombreEntrenador);
      const media = new MessageMedia('image/png', imageBuffer.toString('base64'), 'inventario.png');
      
      // Enviamos la imagen con un pie de foto sencillo
      return await msg.reply(media, undefined, { caption: `🎒 Aquí tienes tu inventario actual.\n👉 _Usa #buy para adquirir más objetos._` });
    } catch (canvasErr) {
      console.error('Error dibujando el inventario:', canvasErr);
      return await replyText(msg, '⚠️ Hubo un problema dibujando tu inventario, intenta de nuevo.');
    }

  } catch (error) {
    console.error('Error en #inventario:', error);
    await replyText(msg, '⚠️ Hubo un error al consultar tu inventario en la base de datos.');
  }
}

module.exports = { handleInventario };