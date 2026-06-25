const { EventEmitter } = require('events');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const { handleCommand } = require('../commands');
const { getPuppeteerOptions } = require('./browser');

// IMPORTAMOS LOS SERVICIOS
const usuarioService = require('./usuarioService'); 
const pokemonService = require('./pokemonService');
const configuracionService = require('./configuracionService'); // ✅ NUEVO SERVICIO IMPORTADO

global.pokemonSalvajeActivo = null;
const ADMIN_NUMBER = '64514737336383:66';

class BotManager extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.status = 'idle';
    this.qrDataUrl = null;
    this.logs = [];
    this.maxLogs = 100;
  }

  // ID del grupo
  GRUPOS_PERMITIDOS = ['120363410946887860@g.us'];

  iniciarCronSalvajes() {
    // ✅ Desactivado el envío automático cada 2 horas por petición del usuario.
    console.log("--- [INFO] El sistema de salvajes automático por tiempo fijo ha sido desactivado ---");
  }
  
  async lanzarSalvajeEnGrupos() {
    const { consultarPokemon, getImagen, getNombreEspanol, randomPokemonId } = require('./pokeapi');

    for (const groupId of this.GRUPOS_PERMITIDOS) {
      try {
        const data = await consultarPokemon(randomPokemonId());
        const nombre = await getNombreEspanol(data);
        const urlImagen = getImagen(data);

        global.pokemonSalvajeActivo = { id: data.id, nombre: nombre };

        const mensaje = `🕒 *¡ALERTA DE POKÉMON SALVAJE!* 🕒\n\n⚠️ Un *${nombre}* salvaje ha aparecido en el grupo.\n¡Atápalo antes de que escape con #capture!`;
        
        await this.client.sendMessage(groupId, mensaje);
        
        if (urlImagen) {
          const media = await MessageMedia.fromUrl(urlImagen, { unsafeMime: true });
          if (media) {
            await this.client.sendMessage(groupId, media, { 
              sendMediaAsSticker: true, 
              stickerName: nombre.substring(0, 30) 
            });
          }
        }
        
        this.log(`[Sistema] Pokémon ${nombre} enviado al grupo ${groupId}`, 'info');
      } catch (err) {
        this.log(`[Sistema] Error al lanzar salvaje en ${groupId}: ${err.message}`, 'error');
      }
    }
  }

  log(message, level = 'info') {
    const entry = {
      time: new Date().toLocaleTimeString('es-ES'),
      message,
      level,
    };
    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }
    this.emit('log', entry);
    console.log(`[${entry.time}] ${message}`);
  }

  setStatus(status) {
    this.status = status;
    this.emit('status', { status, qrDataUrl: this.qrDataUrl });
  }

  isRunning() {
    return ['initializing', 'qr', 'authenticated', 'ready'].includes(this.status);
  }

  getState() {
    return {
      status: this.status,
      qrDataUrl: this.qrDataUrl,
      logs: this.logs,
    };
  }

  async start() {
    if (this.isRunning()) {
      this.log('El bot ya está en ejecución.', 'warn');
      return;
    }

    this.qrDataUrl = null;
    this.setStatus('initializing');
    this.log('Iniciando bot Pokémon de WhatsApp...');

    const { options: puppeteerOptions, executablePath } = getPuppeteerOptions();

    if (executablePath) {
      this.log(`Navegador detectado: ${executablePath}`);
    } else {
      this.log(
        'No se encontró Chrome ni Edge. Instala Google Chrome o ejecuta: npx puppeteer browsers install chrome',
        'error'
      );
      this.setStatus('error');
      return;
    }

    this.client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: puppeteerOptions,
    });

    this.client.on('qr', async (qr) => {
      try {
        const QRCode = require('qrcode');
        this.qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, width: 280 });
        this.setStatus('qr');
        this.log('Código QR generado. Escanea con WhatsApp.');
      } catch (error) {
        this.log(`Error generando QR: ${error.message}`, 'error');
      }
    });

    this.client.on('authenticated', () => {
      this.qrDataUrl = null;
      this.setStatus('authenticated');
      this.log('Autenticación exitosa. Sesión guardada con LocalAuth.');
    });

    this.client.on('auth_failure', (msg) => {
      this.setStatus('error');
      this.log(`Error de autenticación: ${msg}`, 'error');
    });

    this.client.on('ready', () => {
      this.qrDataUrl = null;
      this.setStatus('ready');
      this.log('Bot listo y escuchando comandos 24/7.');
      this.log('Comandos: #pokeregister, #pokemon, #pokesalvaje, #capture, #poketeam, #pokebatle, #pokehelp');
      this.iniciarCronSalvajes();
    });

    this.client.on('message_create', async (msg) => {
      const isGroup = msg.from.endsWith('@g.us');
      if (msg.hasQuotedMsg) return;
      
      const texto = msg.body?.trim();
      if (!texto) return;

      const textoMinuscula = texto.toLowerCase();
      
      const esComando =
        textoMinuscula.startsWith('#pokeregister') ||
        textoMinuscula.startsWith('#pokesalvaje') || 
        textoMinuscula.startsWith('#capture') ||       
        textoMinuscula.startsWith('#pokedex') ||  
        textoMinuscula.startsWith('#pokemon') ||
        textoMinuscula === '#poketeam' ||
        textoMinuscula.startsWith('#pokebatle') || 
        textoMinuscula.startsWith('#pokeaccept') ||
        textoMinuscula === '#pokedaily' ||
        textoMinuscula === '#pokehelp';

      if (!esComando) return;

      try {
        const origen = msg.fromMe ? 'tú' : 'otro';
        const whatsappId = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];
        const chatName = msg.from; 

        this.log(`Comando recibido (${origen}) en "${chatName}": ${texto} [ID Real: ${whatsappId}]`, 'command');

        // ==========================================
        // COMANDO: #pokeregister
        // ==========================================
        if (textoMinuscula.startsWith('#pokeregister')) {
          const usuarioExiste = await usuarioService.obtenerUsuario(whatsappId);
          
          if (usuarioExiste) {
            return await msg.reply(`❌ Ya estás registrado como entrenador, *${usuarioExiste.nombre_whatsapp}*. ¡Sal a capturar!`);
          }

          const nombre = msg._data?.notifyName || msg.pushname || 'Entrenador';
          
          const registrado = await usuarioService.registrarUsuario(whatsappId, nombre);
          if (registrado) {
            return await msg.reply(`🎉 ¡Registro completado con éxito, *${nombre}*!\n\nTe hemos asignado un inventario inicial de *10 Pokéballs* 🎒.\n¡Ya puedes usar todos los comandos de Pokémon!`);
          } else {
            return await msg.reply('⚠️ Hubo un error al crear tu perfil en la base de datos. Inténtalo de nuevo.');
          }
        }

        const usuario = await usuarioService.obtenerUsuario(whatsappId);
        if (!usuario) {
          return await msg.reply(
            `🛑 *¡Alto ahí, Entrenador!* 🛑\n\nNo tienes un perfil creado en este servidor.\n\nPara poder capturar Pokémon, participar en duelos y ver tu inventario, primero debes registrarte ejecutando:\n👉 *#pokeregister*`
          );
        }

        // ==========================================
        // COMANDO: #pokesalvaje (PÚBLICO CON CONTROL DE TIEMPO POR BD)
        // ==========================================
        if (textoMinuscula.startsWith('#pokesalvaje')) {
          // 1. Validar el tiempo transcurrido desde la base de datos
          const config = await configuracionService.obtenerConfiguracion('Envio_Pokemon_Salvaje');
          
          if (config) {
            const minutosRequeridos = parseInt(config.valor) || 120; // 120 por defecto si falla
            const ultimaFecha = new Date(config.registro);
            const fechaActual = new Date();

            // Calcular la diferencia en minutos reales
            const diferenciaMs = fechaActual - ultimaFecha;
            const diferenciaMinutos = Math.floor(diferenciaMs / (1000 * 60));

            if (diferenciaMinutos < minutosRequeridos) {
              const minutosRestantes = minutosRequeridos - diferenciaMinutos;
              
              // Calcular horas y minutos restantes estéticos para el mensaje
              const hrsRestantes = Math.floor(minutosRestantes / 60);
              const minsRestantesFinales = minutosRestantes % 60;
              let tiempoTexto = hrsRestantes > 0 
                ? `*${hrsRestantes} hora(s) y ${minsRestantesFinales} minuto(s)*` 
                : `*${minsRestantesFinales} minuto(s)*`;

              return await msg.reply(`⏳ *¡El radar Pokémon está sobrecalentado!* ⏳\n\nCualquier entrenador puede usar este comando, pero deben pasar **${minutosRequeridos} minutos** entre invocaciones globales.\n\nFaltan ${tiempoTexto} para poder escanear el área nuevamente.`);
            }
          }

          // 2. Si pasó la validación, actualizamos inmediatamente el registro en la BD a NOW()
          await configuracionService.actualizarUltimoEnvio('Envio_Pokemon_Salvaje');

          // 3. Ejecutamos la lógica de generación del Pokémon salvaje
          const { consultarPokemon, getImagen, getNombreEspanol, getTiposEspanol, randomPokemonId } = require('./pokeapi');

          try {
            const randomId = randomPokemonId();
            const data = await consultarPokemon(randomId);

            const [nombre, tipos] = await Promise.all([
              getNombreEspanol(data),
              Promise.resolve(getTiposEspanol(data)),
            ]);

            global.pokemonSalvajeActivo = { id: data.id, nombre: nombre };

            const statsMap = {
              hp: '❤️ Vida', attack: '⚔️ Ataque', defense: '🛡️ Defensa', speed: '⚡ Velocidad',
            };

            const estadisticas = data.stats
              .filter((s) => statsMap[s.stat.name])
              .map((s) => `${statsMap[s.stat.name]}: *${s.base_stat}*`)
              .join('\r\n');

            const urlImagen = getImagen(data);

            const mensajeAlerta = 
              `⚠️ *¡UN POKÉMON SALVAJE HA SIDO DETECTADO!* ⚠️\r\n` +
              `📡 _Invocado por el entrenador: ${usuario.nombre_whatsapp}_\r\n` +
              `──────────────────────\r\n\r\n` +
              `👤 *Nombre:* _${nombre}_\r\n` +
              `🏷️ *Tipo:* [ *${tipos}* ]\r\n\r\n` +
              `⚔️ *ESTADÍSTICAS BASE FILTRADAS*\r\n` +
              `${estadisticas}\r\n\r\n` +
              `¡Intenten atraparlo antes de que escape usando:\r\n` +
              `👉 *#capture*`;

            // Enviar la alerta a todos los grupos permitidos
            for (const groupId of this.GRUPOS_PERMITIDOS) {
              await this.client.sendMessage(groupId, mensajeAlerta);
              if (urlImagen) {
                const media = await MessageMedia.fromUrl(urlImagen, { unsafeMime: true });
                if (media) {
                  await this.client.sendMessage(groupId, media, { sendMediaAsSticker: true, stickerName: nombre });
                }
              }
            }

            if (!isGroup) {
               await msg.reply(`✅ ¡Éxito! Has activado el evento global de Pokémon salvaje (${nombre}) en los grupos.`);
            }

            this.log(`[Bot] El usuario ${usuario.nombre_whatsapp} invocó satisfactoriamente a ${nombre} bajo la regla de los 120m.`, 'info');
            return; 

          } catch (err) {
            console.error('Error al invocar pokémon salvaje:', err);
            return await msg.reply('⚠️ Error al invocar el Pokémon desde la PokéAPI.');
          }
        }

        // ==========================================
        // COMANDO: #pokedaily
        // ==========================================
        if (textoMinuscula === '#pokedaily') {
          try {
            const resultado = await usuarioService.reclamarDaily(usuario.id);

            if (resultado.exito) {
              return await msg.reply(`🎁 *¡RECLAMO DIARIO!* 🎁\n\nHas recibido *5 Pokéballs* gratis.\n¡Úsalas con sabiduría para capturar nuevos Pokémon! 🎒`);
            } else {
              const msRestantes = resultado.tiempoRestante;
              const horas = Math.floor(msRestantes / (1000 * 60 * 60));
              const minutos = Math.floor((msRestantes % (1000 * 60 * 60)) / (1000 * 60));
              
              return await msg.reply(`⏳ *¡Ya reclamaste tu recompensa!* ⏳\n\nDebes esperar *${horas} horas y ${minutos} minutos* para poder volver a reclamar tus Pokéballs.`);
            }
          } catch (err) {
            this.log(`Error en #pokedaily: ${err.message}`, 'error');
            return await msg.reply('⚠️ Hubo un error al procesar tu regalo diario.');
          }
        }

        // ==========================================
        // COMANDO: #capture
        // ==========================================
        if (textoMinuscula.startsWith('#capture')) {
          if (!pokemonSalvajeActivo) {
            return await msg.reply('❌ No hay ningún Pokémon salvaje cerca en este momento. Espera a que aparezca uno.');
          }
          
          if (usuario.pokeballs <= 0) {
            return await msg.reply('🎒 *¡No te quedan Pokéballs!* Compra más en la tienda o espera tu regalo diario.');
          }

          const exito = Math.random() < 0.20; 

          if (exito) {
            const nombrePokemon = pokemonSalvajeActivo.nombre;
            const idPokemon = pokemonSalvajeActivo.id;

            const guardado = await pokemonService.registrarCaptura(usuario.id, idPokemon, nombrePokemon);

            if (guardado) {
              global.pokemonSalvajeActivo = null; 
              return await msg.reply(`🎉 ¡Impresionante! Has atrapado a **${nombrePokemon}** (Nº ${idPokemon}) 🌟.\n\nSe ha guardado en tu inventario y gastaste 1 Pokéball (Te quedan: ${usuario.pokeballs - 1}).`);
            } else {
              return await msg.reply('⚠️ Error al guardar tu captura. Inténtalo de nuevo.');
            }
          } else {
            await pokemonService.restarPokeball(usuario.id);
            return await msg.reply(`💨 El Pokémon se movió bruscamente y la Pokéball falló. ¡Sigue intentando! (Te quedan: ${usuario.pokeballs - 1})`);
          }
        }

        // ==========================================
        // COMANDO: #pokedex
        // ==========================================
        if (textoMinuscula.startsWith('#pokedex')) {
          try {
            const { consultarPokemon, getImagen } = require('./pokeapi');

            const listaPokemon = await pokemonService.obtenerPokedex(whatsappId);

            if (listaPokemon.length === 0) {
              return await msg.reply('🎒 Tu Pokédex está vacía. ¡Invoca un #pokesalvaje y empieza a capturar!');
            }

            let cuerpoPokedex = '';
            listaPokemon.forEach((p, index) => {
              const repetidos = p.cantidad > 1 ? ` x${p.cantidad}` : '';
              cuerpoPokedex += `${index + 1}. *${p.nombre}* (Nivel ${p.nivel})${repetidos}\n`;
            });

            const mensajePokedex = 
              `📱 *POKÉDEX DE ENTRENADOR* 📱\n` +
              `👤 *Entrenador:* ${usuario.nombre_whatsapp}\n` +
              `🔢 *Total especies:* ${listaPokemon.length}\n` +
              `──────────────────────\n\n` +
              cuerpoPokedex + `\n` +
              `🎒 _¡Abajo te dejo los stickers de tus Pokémon capturados!_`;

            let chatPrivadoId;
            if (msg.fromMe) {
              chatPrivadoId = this.client.info.wid._serialized;
            } else {
              chatPrivadoId = msg.author || msg.from;
            }

            await this.client.sendMessage(chatPrivadoId, mensajePokedex);

            if (isGroup) {
              await msg.reply('📬 *¡Pokédex enviada!* Revisa tu chat privado con el bot para ver la lista y tus stickers.');
            }

            this.log(`[Bot] Iniciando envío de ${listaPokemon.length} stickers para ${usuario.nombre_whatsapp}...`, 'info');

            let contador = 0;
            for (const p of listaPokemon) {
              contador++;
              try {
                let pokemonIdentificador = (p.pokemon_id && p.pokemon_id < 1500) ? p.pokemon_id : p.nombre.toLowerCase().trim();

                if (p.nombre.toLowerCase().includes('urshifu')) {
                  pokemonIdentificador = 'urshifu-single-strike';
                }
                
                let dataApi;
                try {
                    dataApi = await consultarPokemon(pokemonIdentificador);
                } catch (apiError) {
                    dataApi = await consultarPokemon(p.nombre.toLowerCase().trim());
                }
                
                if (!dataApi) continue;
                
                const urlImagen = getImagen(dataApi);
                if (!urlImagen) continue;

                let media = await MessageMedia.fromUrl(urlImagen);
                if (!media) continue;

                await this.client.sendMessage(chatPrivadoId, media, {
                  sendMediaAsSticker: true,
                  stickerName: p.nombre,
                  stickerAuthor: `Pokédex de ${usuario.nombre_whatsapp}`
                });

                await new Promise(resolve => setTimeout(resolve, 2000));

              } catch (stickerErr) {
                this.log(`[Bot] ❌ Error en ${p.nombre}: ${stickerErr.message}`, 'error');
              }
            }
            
            this.log(`[Bot] Proceso de Pokédex finalizado para ${usuario.nombre_whatsapp}`, 'info');
            return;
          } catch (err) {
            console.error('Error en el comando #pokedex:', err);
            return await msg.reply('⚠️ Hubo un error al procesar tu Pokédex.');
          }
        }

        // ==========================================
        // INTERCEPCIÓN DE BATALLAS POR POKEDEX
        // ==========================================
        if (textoMinuscula.startsWith('#pokebatle')) {
          const { handlePokebatle } = require('../commands/pokebatle');
          return await handlePokebatle(msg, texto);
        }

        if (textoMinuscula.startsWith('#pokeaccept')) {
          const { handlePokeaccept } = require('../commands/pokebatle');
          const argumento = texto.slice('#pokeaccept'.length).trim();
          return await handlePokeaccept(msg, argumento);
        }

        await handleCommand(msg);

      } catch (error) {
        this.log(`Error procesando comando: ${error.message}`, 'error');
      }
    });

    this.client.on('disconnected', (reason) => {
      this.setStatus('disconnected');
      this.log(`Cliente desconectado: ${reason}`, 'warn');
      this.client = null;
    });

    try {
      await this.client.initialize();
    } catch (error) {
      this.setStatus('error');
      this.log(`Error al iniciar: ${error.message}`, 'error');
      this.client = null;
    }
  }

  async stop() {
    if (!this.client) {
      this.setStatus('idle');
      this.qrDataUrl = null;
      this.log('El bot no estaba en ejecución.');
      return;
    }

    this.setStatus('stopping');
    this.log('Deteniendo bot...');

    try {
      await this.client.destroy();
    } catch (error) {
      this.log(`Error al detener: ${error.message}`, 'error');
    } finally {
      this.client = null;
      this.qrDataUrl = null;
      this.setStatus('idle');
      this.log('Bot detenido.');
    }
  }
}

module.exports = new BotManager();