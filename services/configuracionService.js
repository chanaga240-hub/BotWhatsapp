const db = require('./database');

class ConfiguracionService {
  /**
   * Obtiene un registro de configuración por su nombre
   * @param {string} nombre 
   */
  async obtenerConfiguracion(nombre) {
    try {
      const [rows] = await db.execute('SELECT * FROM configuracion WHERE nombre = ?', [nombre]);
      return rows[0] || null;
    } catch (error) {
      console.error(`Error al obtener configuración (${nombre}):`, error);
      return null;
    }
  }

  /**
   * Actualiza el campo 'registro' con la fecha y hora actual (NOW())
   * @param {string} nombre 
   */
  async actualizarUltimoEnvio(nombre) {
    try {
      await db.execute('UPDATE configuracion SET registro = NOW() WHERE nombre = ?', [nombre]);
      return true;
    } catch (error) {
      console.error(`Error al actualizar la fecha de registro para ${nombre}:`, error);
      return false;
    }
  }
}

module.exports = new ConfiguracionService();