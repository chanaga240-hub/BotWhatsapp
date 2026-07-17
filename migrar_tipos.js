const pool = require('./services/database.js');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function cargarRango(inicio, fin) {
    console.log(`🚀 Iniciando carga del rango: ${inicio} al ${fin}`);

    for (let i = inicio; i <= fin; i++) {
        try {
            console.log(`[${i}] Procesando...`);
            
            // 1. Obtener Datos Base
            const resBase = await fetch(`https://pokeapi.co/api/v2/pokemon/${i}`);
            if (!resBase.ok) continue;
            const pokeData = await resBase.json();

            // 2. Obtener Datos Especie
            const resSpecies = await fetch(pokeData.species.url);
            const speciesData = await resSpecies.json();

            // 3. Extraer tipos (Manejo de seguridad por si solo tiene 1 tipo)
            const type1 = pokeData.types[0]?.type.name || null;
            const type2 = pokeData.types[1]?.type.name || null;

            // 4. Guardar en BD (Incluyendo query_key, type1 y type2)
            await pool.query(
                `REPLACE INTO pokemon_cache 
                (pokemon_id, query_key, name, type1, type2, data, species_data, capture_rate, updated_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [
                    pokeData.id,
                    pokeData.name.toLowerCase(), // query_key
                    pokeData.name,
                    type1,
                    type2,
                    JSON.stringify(pokeData),
                    JSON.stringify(speciesData),
                    speciesData.capture_rate || 45
                ]
            );

            await delay(300); // Pausa para la API

        } catch (err) {
            console.error(`❌ Error en ID ${i}:`, err.message);
        }
    }
}

async function ejecucionTotal() {
    // Asegurar estructura de la tabla
    await pool.query("ALTER TABLE pokemon_cache MODIFY species_data LONGTEXT");
    
    // Ejecutar rangos
    await cargarRango(1, 1025);
    await cargarRango(10001, 10326);
    
    console.log("🎉 ¡Carga completa exitosa con tipos incluidos!");
    process.exit();
}

ejecucionTotal();