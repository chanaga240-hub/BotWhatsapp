const db = require('./database');

const TIPOS_HABILITADOS = ['normal', 'fire', 'water', 'Electric', 'Grass', 'Ice', 'Poison'];

function generarRecompensaAleatoria() {
    const rand = Math.random();
    if (rand < 0.40) return 'pokeballs';
    if (rand < 0.70) return 'monedas';
    if (rand < 0.90) return 'pocion_xp_small';
    return 'pokemon';
}

function generarEstructuraCampo() {
    const filas = ['A', 'B', 'C', 'D'];
    const estructura = {};
    for (const fila of filas) {
        estructura[fila] = {};
        for (let col = 1; col <= 7; col++) {
            estructura[fila][col] = { 
                estado: 'libre', 
                resultado: generarRecompensaAleatoria() 
            };
        }
    }
    return estructura;
}

async function obtenerCampoHoy() {
    const [rows] = await db.execute(
        'SELECT * FROM RegistroCampos WHERE DATE(fecha_generacion) = CURDATE() ORDER BY id DESC LIMIT 1'
    );
    return rows.length > 0 ? rows[0] : null;
}

async function obtenerOCrearCampoHoy() {
    const campo = await obtenerCampoHoy();
    if (campo) return { campo, esNuevo: false };

    const nuevoTipo = TIPOS_HABILITADOS[Math.floor(Math.random() * TIPOS_HABILITADOS.length)];
    const nuevaEstructura = generarEstructuraCampo();
    
    await db.execute(
        'INSERT INTO RegistroCampos (tipo_campo, estructura) VALUES (?, ?)', 
        [nuevoTipo, JSON.stringify(nuevaEstructura)]
    );
    
    const [nuevoCampo] = await db.execute('SELECT * FROM RegistroCampos ORDER BY id DESC LIMIT 1');
    return { campo: nuevoCampo[0], esNuevo: true };
}

async function explorarCelda(usuarioId, coordenada) {
    const connection = await db.getConnection(); 
    try {
        await connection.beginTransaction();

        // 1. Bloquear la fila del campo actual con FOR UPDATE para evitar colisiones
        const [campos] = await connection.execute(
            'SELECT * FROM RegistroCampos WHERE DATE(fecha_generacion) = CURDATE() ORDER BY id DESC LIMIT 1 FOR UPDATE'
        );
        const campo = campos[0];
        
        if (!campo) {
            await connection.rollback();
            return { error: 'no_generado' };
        }

        // 2. Validar límite diario 
        const [intentos] = await connection.execute(
            'SELECT COUNT(*) as total FROM CamposDiarios WHERE usuario_id = ? AND DATE(fecha_captura) = CURDATE()',
            [usuarioId]
        );
        
        if (intentos[0].total >= 2) {
            await connection.rollback();
            return { error: 'limite_diario' };
        }

        // 3. Validar coordenada asegurada
        const mapa = typeof campo.estructura === 'string' ? JSON.parse(campo.estructura) : campo.estructura;
        const [fila, col] = coordenada.toUpperCase().split('-');

        if (!fila || !col || !mapa[fila] || !mapa[fila][col]) {
            await connection.rollback();
            return { error: 'coordenada_invalida' };
        }
        
        if (mapa[fila][col].estado === 'reclamado') {
            await connection.rollback();
            return { error: 'ya_reclamado' };
        }

        // 4. Ejecutar cambios en el mapa
        const premio = mapa[fila][col].resultado;
        mapa[fila][col].estado = 'reclamado';

        await connection.execute(
            'UPDATE RegistroCampos SET estructura = ? WHERE id = ?', 
            [JSON.stringify(mapa), campo.id]
        );
        
        await connection.execute(
            'INSERT INTO CamposDiarios (usuario_id, registro_campo_id, fecha_captura) VALUES (?, ?, CURDATE())',
            [usuarioId, campo.id]
        );

        await connection.commit(); 

        return { 
            success: true, 
            resultado: premio, 
            tipoCampo: campo.tipo_campo
        };

    } catch (error) {
        await connection.rollback(); 
        console.error('Error en explorarCelda:', error);
        return { error: 'db_error' };
    } finally {
        connection.release(); 
    }
}

module.exports = { obtenerCampoHoy, obtenerOCrearCampoHoy, explorarCelda };