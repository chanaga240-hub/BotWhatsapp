const usuarioService = require('../services/usuarioService');

async function handleSell(msg, texto) {
    const whatsappId = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];
    const args = texto.trim().split(/\s+/);

    if (args.length < 3) {
        return await msg.reply('❌ Formato incorrecto. Usa: *#sell [objeto] [cantidad]*\n👉 Ejemplo: *#sell cultivos 1*');
    }

    const objeto = args[1].toLowerCase();
    const cantidad = parseInt(args[2]);

    if (isNaN(cantidad) || cantidad <= 0) {
        return await msg.reply('❌ Debes especificar una cantidad válida mayor a 0.\n👉 Ejemplo: *#sell cultivos 1*');
    }

    // Diccionario de objetos que se pueden vender
    // En el futuro puedes agregar más cosas aquí
    const mercado = {
        'cultivos': { columna: 'cultivos', precio: 125, nombreTexto: 'Cultivos 🌾' },
        'cultivo': { columna: 'cultivos', precio: 125, nombreTexto: 'Cultivos 🌾' } // Alias en singular
    };

    const infoVenta = mercado[objeto];

    if (!infoVenta) {
        return await msg.reply('❌ Ese objeto no se puede vender en el mercado o no existe.\n👉 Actualmente puedes vender: *cultivos*');
    }

    // Ejecutamos la venta en la Base de Datos
    const resultado = await usuarioService.venderObjeto(whatsappId, infoVenta.columna, cantidad, infoVenta.precio);

    if (resultado.error === 'usuario_no_encontrado') {
        return await msg.reply('❌ No estás registrado en el sistema.');
    } else if (resultado.error === 'cantidad_insuficiente') {
        return await msg.reply(`❌ No tienes suficientes *${infoVenta.nombreTexto}* para vender.\n📦 Actualmente tienes: *${resultado.actual}* en tu inventario.`);
    } else if (resultado.error === 'db_error') {
        return await msg.reply('⚠️ Hubo un error de conexión con el mercado. Inténtalo de nuevo.');
    } else if (resultado.success) {
        return await msg.reply(`💰 *VENTA EXITOSA* 💰\n\nHas vendido *${cantidad}x ${infoVenta.nombreTexto}* en el mercado.\nGanancia obtenida: *+${resultado.ganancia} Monedas* 🪙.`);
    }
}

module.exports = { handleSell };