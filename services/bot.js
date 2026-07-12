const { EventEmitter } = require('events');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const { handleCommand } = require('../commands');
const { getPuppeteerOptions } = require('./browser');

// IMPORTAMOS LOS SERVICIOS
const usuarioService = require('./usuarioService'); 
const pokemonService = require('./pokemonService');
const configuracionService = require('./configuracionService'); 
const { generarTarjetaPokemon } = require('../services/canvasService');
const { consultarPokemon, getImagen, getStat } = require('./pokeapi');
const { getMediaFromUrlWithCache } = require('./reply');

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
    console.log("--- [INFO] El sistema de salvajes automático por tiempo fijo ha sido desactivado ---");
  }
  
  async lanzarSalvajeEnGrupos() {
    const { consultarPokemon, getImagen, getNombreEspanol, randomPokemonId, getCaptureRate, calcularProbabilidadCaptura } = require('./pokeapi');

    for (const groupId of this.GRUPOS_PERMITIDOS) {
      try {
        const data = await consultarPokemon(randomPokemonId());
        const nombre = data.name;
        const urlImagen = getImagen(data);
        const captureRate = await getCaptureRate(data);
        const probabilidadExito = calcularProbabilidadCaptura(captureRate);

        global.pokemonSalvajeActivo = { id: data.id, nombre: nombre };

        const mensaje = `🕒 *¡ALERTA DE POKÉMON SALVAJE!* 🕒\n\n⚠️ Un *${nombre}* salvaje ha aparecido en el grupo.\n📊 *Dificultad de captura:* ${Math.round(probabilidadExito)}%\n\n¡Atápalo antes de que escape con #capture!`;
        
        await this.client.sendMessage(groupId, mensaje);
        
        if (urlImagen) {
          const media = MessageMedia.fromFilePath(urlImagen);
          if (media) {
            try {
              await this.client.sendMessage(groupId, media, { 
                sendMediaAsSticker: true, 
                stickerName: nombre.substring(0, 30) 
              });
            } catch (stickerErr) {
              this.log(`[Sticker Automático] Error de conversión para ${nombre}, enviando imagen normal: ${stickerErr.message}`, 'warn');
              await this.client.sendMessage(groupId, media);
            }
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
      this.log('Comandos: #pokeregister, #pokemon, #pokesalvaje, #pokegive, #capture, #poketeam, #battle, #accept, #train, #stats, #help');
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
        textoMinuscula.startsWith('#pokerealease') ||
        textoMinuscula.startsWith('#pokegive') ||
        textoMinuscula.startsWith('#capture') ||       
        textoMinuscula.startsWith('#pokedex') ||  
        textoMinuscula.startsWith('#pokemon') ||
        textoMinuscula.startsWith('#poketeam') ||
        textoMinuscula.startsWith('#battle') || 
        textoMinuscula.startsWith('#teambattle') ||
        textoMinuscula.startsWith('#accept') ||
        textoMinuscula.startsWith('#train') ||
        textoMinuscula === '#daily' ||
        textoMinuscula === '#job' ||
        textoMinuscula.startsWith('#stats') ||
        textoMinuscula.startsWith('#pokemonstats') ||
        textoMinuscula === '#shop' ||
        textoMinuscula.startsWith('#buy') ||
        textoMinuscula.startsWith('#pay') ||
        textoMinuscula.startsWith('#inventario') ||
        textoMinuscula.startsWith('#use') ||
        textoMinuscula.startsWith('#pokeevolucion') ||
        textoMinuscula.startsWith('#challenge') ||
        textoMinuscula.startsWith('#pokevariantes') ||
        textoMinuscula.startsWith('#ranking') ||
        textoMinuscula.startsWith('#mutar') ||
        textoMinuscula.startsWith('#expedicion') ||
        textoMinuscula.startsWith('#trivia') ||
        textoMinuscula === '#incubadora' ||
        textoMinuscula.startsWith('#campo') ||
        textoMinuscula === '#help';

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
        // COMANDO: #job
        // ==========================================
        if (textoMinuscula === '#job') {
          const { handlePokeJob } = require('../commands/job');
          return await handlePokeJob(msg);
        }

        // ==========================================
        // COMANDO: #expedicion
        // ==========================================
        if (textoMinuscula.startsWith('#expedicion')) {
            const { handleExpedicion } = require('../commands/expedicion');
            return await handleExpedicion(msg, texto);
        }

        // ==========================================
        // COMANDO: #trivia
        // ==========================================
        if (textoMinuscula === '#trivia') {
          const { handleTrivia } = require('../commands/trivia');
          return await handleTrivia(msg, this.client);
        }

        // ==========================================
        // COMANDO: #incubadora
        // ==========================================
        if (textoMinuscula === '#incubadora') {
          const { handleIncubadora } = require('../commands/incubadora');
          return await handleIncubadora(msg);
        }

        // ==========================================
        // COMANDO: #pokeevolucion
        // ==========================================
        if (textoMinuscula.startsWith('#pokeevolucion')) {
          const { handlePokeEvolucion } = require('../commands/pokeevolucion');
          return await handlePokeEvolucion(msg, textoMinuscula);
        }

        // ==========================================
        // COMANDO: #pokevariantes
        // ==========================================
        if (textoMinuscula.startsWith('#pokevariantes')) {
          const { handlePokeVariantes } = require('../commands/pokevariantes'); 
          return await handlePokeVariantes(msg, textoMinuscula);
        }

        // ==========================================
        // COMANDO: #teambattle
        // ==========================================
        if (textoMinuscula.startsWith('#teambattle')) {
          const { handlePoketeamBattle } = require('../commands/teambattle');
          return await handlePoketeamBattle(msg, texto);
        }

        // ==========================================
        // COMANDO: #buy
        // ==========================================
        if (textoMinuscula.startsWith('#buy')) {
          const { handleBuy } = require('../commands/buy');
          return await handleBuy(msg, textoMinuscula);
        }

        // ==========================================
        // COMANDO: #mutar
        // ==========================================
        if (textoMinuscula.startsWith('#mutar')) {
          const { handleMutar } = require('../commands/mutar'); 
          return await handleMutar(msg, textoMinuscula);
        }

        // ==========================================
        // COMANDO: #inventario
        // ==========================================
        if (textoMinuscula.startsWith('#inventario')) {
          const { handleInventario } = require('../commands/inventario');
          return await handleInventario(msg);
        }

        // ==========================================
        // COMANDO: #pay
        // ==========================================
        if (textoMinuscula.startsWith('#pay')) {
          const { handlePay } = require('../commands/pay');
          return await handlePay(msg, textoMinuscula);
        }

        // ==========================================
        // COMANDO: #ranking
        // ==========================================
        if (textoMinuscula.startsWith('#ranking')) {
          const { handleRanking} = require('../commands/ranking');
          return await handleRanking(msg, textoMinuscula);
        }
        
        // ==========================================
        // COMANDO: #challenge (PvE)
        // ==========================================
        if (textoMinuscula.startsWith('#challenge')) {
          const { handlePokechallenge } = require('../commands/challenge');
          return await handlePokechallenge(msg, texto);
        }

        // ==========================================
        // COMANDO: Campo y Captura de Campo
        // ==========================================
        if (textoMinuscula.startsWith('#campocapture')) {
            const { handleCampoCapture } = require('../commands/campo');
            return await handleCampoCapture(msg);
        } 
        else if (textoMinuscula.startsWith('#campo')) {
            const { handleCampo } = require('../commands/campo');
            // PASAMOS EL MENSAJE Y EL TEXTO COMPLETO
            return await handleCampo(msg, texto || '');
        }

        // ==========================================
        // COMANDO: #pokesalvaje (PÚBLICO CON CONTROL DE TIEMPO POR BD)
        // ==========================================
        if (textoMinuscula.startsWith('#pokesalvaje')) {
          const config = await configuracionService.obtenerConfiguracion('Envio_Pokemon_Salvaje');
          
          if (config) {
            const minutosRequeridos = parseInt(config.valor) || 120; 
            const ultimaFecha = new Date(config.registro);
            const fechaActual = new Date();

            const diferenciaMs = fechaActual - ultimaFecha;
            const diferenciaMinutos = Math.floor(diferenciaMs / (1000 * 60));

            if (diferenciaMinutos < minutosRequeridos) {
              const minutosRestantes = minutosRequeridos - diferenciaMinutos;
              
              const hrsRestantes = Math.floor(minutosRestantes / 60);
              const minsRestantesFinales = minutosRestantes % 60; 
              let tiempoTexto = hrsRestantes > 0 
                ? `*${hrsRestantes} hora(s) y ${minsRestantesFinales} minuto(s)*` 
                : `*${minsRestantesFinales} minuto(s)*`;

              return await msg.reply(`⏳ *¡El radar Pokémon está sobrecalentado!* ⏳\n\nCualquier entrenador puede usar este comando, pero deben pasar **${minutosRequeridos} minutos** entre invocaciones globales.\n\nFaltan ${tiempoTexto} para poder escanear el área nuevamente.`);
            }
          }

          await configuracionService.actualizarUltimoEnvio('Envio_Pokemon_Salvaje');

          const { consultarPokemon, getImagen, getTiposEspanol, randomPokemonId, getCaptureRate, calcularProbabilidadCaptura } = require('./pokeapi');

          try {
            const randomId = randomPokemonId();
            const data = await consultarPokemon(randomId);

            const nombre = data.name; 
            const tipos = getTiposEspanol(data);
            
            const captureRate = await getCaptureRate(data);
            const probabilidadExito = calcularProbabilidadCaptura(captureRate);

            const statsMap = {
              hp: '❤️ Vida', attack: '⚔️ Ataque', defense: '🛡️ Defensa', speed: '⚡ Velocidad',
            };

            const statsEntries = Array.isArray(data.stats) ? data.stats : [];
            const estadisticas = statsEntries
              .filter((s) => s && s.stat && statsMap[s.stat.name])
              .map((s) => `${statsMap[s.stat.name]}: *${s.base_stat || 0}*`)
              .join('\r\n');

            const urlImagen = getImagen(data);

            const mensajeAlerta = 
              `⚠️ *¡UN POKÉMON SALVAJE HA SIDO DETECTADO!* ⚠️\r\n` +
              `📡 _Invocado por el entrenador: ${usuario.nombre_whatsapp}_\r\n` +
              `──────────────────────\r\n\r\n` +
              `👤 *Nombre:* _${nombre}_\r\n` +
              `🏷️ *Tipo:* [ *${tipos}* ]\r\n` +
              `📊 *Dificultad de captura:* ${Math.round(probabilidadExito)}%\r\n\r\n` +
              `⚔️ *ESTADÍSTICAS BASE FILTRADAS*\r\n` +
              `${estadisticas}\r\n\r\n` +
              `⏳ *El Pokémon se está materializando... ¡Preparen sus Pokéballs!*`;

            for (const groupId of this.GRUPOS_PERMITIDOS) {
              await this.client.sendMessage(groupId, mensajeAlerta);
              if (urlImagen) {
                const media = MessageMedia.fromFilePath(urlImagen);
                if (media) {
                  try {
                    await this.client.sendMessage(groupId, media, { sendMediaAsSticker: true, stickerName: nombre });
                  } catch (stickerError) {
                    this.log(`[Sticker] Falló conversión en #pokesalvaje para ${nombre}, enviando imagen: ${stickerError.message}`, 'warn');
                    await this.client.sendMessage(groupId, media, { caption: `¡Aquí está el sprite de ${nombre}! ✨` });
                  }
                }
              }
            }

            if (!isGroup) {
              await msg.reply(`✅ ¡Éxito! Has iniciado la aparición de ${nombre}. Iniciando conteo de 15 segundos en los grupos...`);
            }

            for (let i = 15; i >= 0; i -= 3) {
              for (const groupId of this.GRUPOS_PERMITIDOS) {
                if (i === 0) {
                  await this.client.sendMessage(groupId, `🌟 *¡CONTEO TERMINADO!* 🌟\n\n¡${nombre} ya es vulnerable! Intenten atraparlo ahora mismo usando:\n👉 *#capture*`);
                } else {
                  await this.client.sendMessage(groupId, `⏳ *Materializándose en ${i} segundos...*`);
                }
              }
              if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, 3000));
              }
            }

            global.pokemonSalvajeActivo = { id: data.id, nombre: nombre };

            this.log(`[Bot] El usuario ${usuario.nombre_whatsapp} invocó satisfactoriamente a ${nombre}. Evento de captura desbloqueado tras conteo de 15s.`, 'info');
            return; 

          } catch (err) {
            console.error('Error al invocar pokémon salvaje:', err);
            return await msg.reply('⚠️ Error al invocar el Pokémon desde la PokéAPI.');
          }
        }

        // ==========================================
        // COMANDO: #shop
        // ==========================================
        if (textoMinuscula === '#shop') {
          const { handleShop } = require('../commands/shop');
          return await handleShop(msg);
        }

        // ==========================================
        // COMANDO: #use
        // ==========================================
        if (textoMinuscula.startsWith('#use')) {
          const { handleUse } = require('../commands/use');
          return await handleUse(msg, texto);
        }

        // ==========================================
        // COMANDO: #pokerealease [nombre]
        // ==========================================
        if (textoMinuscula.startsWith('#pokerealease')) {
          const { handlePokerelease } = require('../commands/pokerelease'); 
          return await handlePokerelease(msg, texto, this, usuario);
        }

        // ==========================================
        // COMANDO: #pokemonstats [nombre_pokemon]
        // ==========================================
        if (textoMinuscula.startsWith('#pokemonstats')) {
          const { handlePokemonStats } = require('../commands/pokemonStats'); 
          return await handlePokemonStats(msg);
        }

        // ==========================================
        // COMANDO: #daily
        // ==========================================
        if (textoMinuscula === '#daily') {
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
            this.log(`Error en #daily: ${err.message}`, 'error');
            return await msg.reply('⚠️ Hubo un error al procesar tu regalo diario.');
          }
        }

        // ==========================================
        // COMANDO: #capture
        // ==========================================
        if (textoMinuscula.startsWith('#capture')) {   
          const cooldownMs = 5 * 60 * 60 * 1000;
          if (usuario.ultima_captura) {
            const ultimaCaptura = new Date(usuario.ultima_captura);
            const ahora = new Date();
            const diff = ahora - ultimaCaptura;
            if (diff < cooldownMs) {
              const restanteMs = cooldownMs - diff;
              const horas = Math.floor(restanteMs / (1000 * 60 * 60));
              const minutos = Math.floor((restanteMs % (1000 * 60 * 60)) / (1000 * 60));
              const segundos = Math.floor((restanteMs % (1000 * 60)) / 1000);
              return await msg.reply(
                `⏳ *Cooldown de captura activo* ⏳\n\n` +
                `Ya has capturado un Pokémon recientemente. Debes esperar *${horas}h ${minutos}m ${segundos}s* antes de intentar capturar otro.`
              );
            }
          }

          if (!pokemonSalvajeActivo) {
            return await msg.reply('❌ No hay ningún Pokémon salvaje cerca en este momento. Espera a que aparezca uno.');
          }
          
          if (usuario.pokeballs <= 0) {
            return await msg.reply('🎒 *¡No te quedan Pokéballs!* Compra más en la tienda o espera tu regalo diario.');
          }

          try {
            const { consultarPokemon: pokeConsulta, getCaptureRate, calcularProbabilidadCaptura } = require('./pokeapi');
            let dataPokemon = null;
            let captureRate = 45; 
            
            try {
              dataPokemon = await pokeConsulta(pokemonSalvajeActivo.id);
              captureRate = await getCaptureRate(dataPokemon);
            } catch (err) {
              this.log(`[Bot] Advertencia: No se pudo obtener capture_rate de ${pokemonSalvajeActivo.nombre}, usando default.`, 'warn');
            }

            const probabilidadExito = calcularProbabilidadCaptura(captureRate) / 100;
            const exito = Math.random() < probabilidadExito;

            if (exito) {
              const nombrePokemon = pokemonSalvajeActivo.nombre;
              const idPokemon = pokemonSalvajeActivo.id;

              const nivelProp = pokemonSalvajeActivo.nivel || null;
              const expProp = pokemonSalvajeActivo.experiencia || null;
              const guardado = await pokemonService.registrarCaptura(usuario.id, idPokemon, nombrePokemon, nivelProp, expProp);

              if (guardado?.success) {
                global.pokemonSalvajeActivo = null;
                const porcentajeExito = Math.round(probabilidadExito * 100);
                return await msg.reply(`🎉 ¡Impresionante! Has atrapado a **${nombrePokemon}** (Nº ${idPokemon}) 🌟.\n\nTenía un ratio de captura de ${porcentajeExito}%. ¡Tuviste suerte!\n\nSe ha guardado en tu inventario y gastaste 1 Pokéball (Te quedan: ${usuario.pokeballs - 1}).`);
              }

              if (guardado?.duplicate) {
                await pokemonService.restarPokeball(usuario.id);
                const porcentajeExito = Math.round(probabilidadExito * 100);
                return await msg.reply(`💨 El Pokémon **${nombrePokemon}** ya estaba siendo cuidado por otro entrenador, así que se escapó de tu alcance. (Ratio: ${porcentajeExito}%)\n\nTu Pokéball falló y se ha consumido.`);
              }

              return await msg.reply('⚠️ Error al guardar tu captura. Inténtalo de nuevo.');
            } else {
              await pokemonService.restarPokeball(usuario.id);
              const porcentajeExito = Math.round(probabilidadExito * 100);
              return await msg.reply(`💨 El Pokémon se movio bruscamente y la Pokéball falló. (Ratio: ${porcentajeExito}%) ¡Sigue intentando! (Te quedan: ${usuario.pokeballs - 1})`);
            }
          } catch (err) {
            this.log(`Error en #capture: ${err.message}`, 'error');
            return await msg.reply('⚠️ Ocurrió un error al procesar la captura. Inténtalo de nuevo.');
          }
        }

        // ==========================================
        // COMANDO: #pokedex (BLINDADO CONTRA ERRORES DE ID/NOMBRE)
        // ==========================================
        if (textoMinuscula.startsWith('#pokedex')) {
          try {
            const { consultarPokemon, getImagen, getStat } = require('./pokeapi');
            const { generarCollagePokemon } = require('../services/canvasService');

            const listaPokemon = await pokemonService.obtenerPokedex(whatsappId);
            if (!listaPokemon || listaPokemon.length === 0) {
              return await msg.reply('🎒 Tu Pokédex está vacía. ¡Invoca un #pokesalvaje!');
            }

            const chatPrivadoId = msg.fromMe ? this.client.info.wid._serialized : (msg.author || msg.from);

            await this.client.sendMessage(chatPrivadoId, `📱 *POKÉDEX DE ${usuario.nombre_whatsapp.toUpperCase()}*\nGenerando hojas de 8 Pokémon...`);

            const bloques = [];
            for (let i = 0; i < listaPokemon.length; i += 8) {
              bloques.push(listaPokemon.slice(i, i + 8));
            }

            for (const [index, bloque] of bloques.entries()) {
              const datosBloque = [];

              for (const p of bloque) {
                let nombreBase = p.nombre.toLowerCase().trim();
                if (nombreBase === 'oinkologne') nombreBase = p.genero === 'female' ? 'oinkologne-female' : 'oinkologne-male';
                let idApi = (p.pokemon_id && p.pokemon_id < 1500) ? p.pokemon_id : nombreBase;
                if (nombreBase.includes('urshifu')) idApi = 'urshifu-single-strike';

                // CONTROL DE EXCEPCIONES INTERNO PARA EVITAR LA CAÍDA GLOBAL
                let dataApi = null;
                try {
                  dataApi = await consultarPokemon(idApi);
                } catch (errId) {
                  try {
                    dataApi = await consultarPokemon(nombreBase);
                  } catch (errName) {
                    this.log(`[Pokedex] Saltando Pokémon inváldo en API: "${nombreBase}" (ID: ${idApi}). Error: ${errName.message}`, 'warn');
                  }
                }
                
                if (dataApi) {
                  const nivelActual = p.nivel || 1;
                  const multNivel = 1 + (nivelActual - 1) * 0.05;

                  datosBloque.push({
                    nombre: p.nombre,
                    nivel: nivelActual,
                    experiencia: p.experiencia || 0, 
                    hp: Math.floor((getStat(dataApi, 'hp') || 0) * 2 * multNivel),
                    atk: Math.floor((getStat(dataApi, 'attack') || 0) * multNivel),
                    def: Math.floor((getStat(dataApi, 'defense') || 0) * multNivel),
                    spAtk: Math.floor((getStat(dataApi, 'special-attack') || 0) * multNivel),
                    spDef: Math.floor((getStat(dataApi, 'special-defense') || 0) * multNivel),
                    vel: Math.floor((getStat(dataApi, 'speed') || 0) * multNivel),
                    spriteUrl: getImagen(dataApi)
                  });
                }
              }

              // Solo genera la hoja si hay datos válidos procesados
              if (datosBloque.length > 0) {
                const imageBuffer = await generarCollagePokemon(datosBloque);
                const media = new MessageMedia('image/png', imageBuffer.toString('base64'), `pokedex_${index}.png`);

                await this.client.sendMessage(chatPrivadoId, media, {
                  caption: `📦 *Hoja de Pokédex ${index + 1}/${bloques.length}*`
                });
              } else {
                await this.client.sendMessage(chatPrivadoId, `⚠️ La hoja ${index + 1} no contenía Pokémon válidos para la API actual.`);
              }

              await new Promise(resolve => setTimeout(resolve, 3000));
            }

            this.log(`[Bot] Pokédex enviada a ${usuario.nombre_whatsapp}`, 'info');

          } catch (err) {
            console.error('Error en #pokedex:', err);
            await msg.reply('⚠️ Hubo un error procesando tu Pokédex.');
          }
        }

        // ==========================================
        // COMANDO: #poketeam
        // ==========================================
        if (textoMinuscula.startsWith('#poketeam')) {
          const { handlePoketeam } = require('../commands/poketeam');
          return await handlePoketeam(msg, texto);
        }

        // ==========================================
        // INTERCEPCIÓN DE BATALLAS POR POKEDEX
        // ==========================================
        if (textoMinuscula.startsWith('#battle')) {
          const { handlePokebatle } = require('../commands/battle');
          return await handlePokebatle(msg, texto);
        }

        if (textoMinuscula.startsWith('#accept')) {
          const { handlePokeaccept } = require('../commands/battle');
          const argumento = texto.slice('#accept'.length).trim();
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