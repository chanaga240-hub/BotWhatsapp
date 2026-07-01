const usuarioService = require('../services/usuarioService');
const { replyText } = require('../services/reply');

async function handlePokeJob(msg) {
  try {
    const whatsappId = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];
    
    // Obtenemos al usuario para saber su ID interno y nombre
    const usuario = await usuarioService.obtenerUsuario(whatsappId);
    if (!usuario) {
      return await replyText(msg, '🛑 *¡Alto ahí!* Necesitas estar registrado para trabajar. Usa *#pokeregister*.');
    }

    const resultado = await usuarioService.realizarTrabajo(usuario.id);

    // Manejo del Cooldown
    if (resultado.error === 'cooldown') {
      const minutos = Math.floor(resultado.remaining / (1000 * 60));
      const segundos = Math.floor((resultado.remaining % (1000 * 60)) / 1000);
      return await replyText(msg, `⏳ *¡Aún estás agotado de tu último trabajo!*\n\nDebes descansar y volver a intentar en *${minutos} minutos y ${segundos} segundos*.`);
    }

    // Error si la tabla está vacía
    if (resultado.error === 'no_jobs') {
      return await replyText(msg, '⚠️ No hay trabajos disponibles en la bolsa de empleo Pokémon en este momento.');
    }

    // Éxito: Enviar mensaje bien estructurado
    if (resultado.exito) {
      const { nombre, descripcion, ganancia } = resultado.trabajo;
      
      const mensajeTrabajo = 
        `💼 *¡ENCARGO POKÉMON COMPLETADO!* 💼\n` +
        `👤 *Entrenador:* ${usuario.nombre_whatsapp}\n` +
        `──────────────────────\n` +
        `🔨 *Labor:* _${nombre}_\n` +
        `📝 *Acción:* _${descripcion}_\n\n` +
        `💰 *Paga:* *${ganancia} monedas* `;

      return await replyText(msg, mensajeTrabajo);
    }

    return await replyText(msg, '⚠️ Hubo un error al procesar tu paga. Intenta más tarde.');

  } catch (error) {
    console.error('Error en #pokejob:', error);
    await replyText(msg, '⚠️ Hubo un error inesperado al ejecutar el comando.');
  }
}

module.exports = { handlePokeJob };