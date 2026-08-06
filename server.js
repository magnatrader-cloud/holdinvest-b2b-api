const express = require('express');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(express.json());

// Configuración de la conexión a PostgreSQL
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  connectionTimeoutMillis: 5000 // Si no conecta en 5 segundos, aborta la petición pero NO apaga el servidor
});

// Ruta Base de Verificación (Siempre funcionará)
app.get('/api/status', (req, res) => {
  res.json({ status: 'Online', project: 'Holdinvest B2B Staging' });
});

// ENDPOINT DE BÚSQUEDA AVANZADA B2B
app.get('/api/empresas/buscar', async (req, res) => {
  try {
    let queryText = `
      SELECT 
        e.id_empresa, e.razon_social, e.identificador_fiscal, e.tipo_empresa, e.tamano_empresa,
        c.nombre_ciudad, est.nombre_estado, r.nombre_region,
        COALESCE(g.nombre_gremio, 'NO AFILIADO') AS gremio_afiliado
      FROM Empresas e
      JOIN Ciudades c ON e.id_ciudad = c.id_ciudad
      JOIN Estados est ON c.id_estado = est.id_estado
      JOIN Regiones r ON est.id_region = r.id_region
      LEFT JOIN Afiliaciones_Gremios a ON e.id_empresa = a.id_empresa
      LEFT JOIN Camaras_Gremios g ON a.id_gremio = g.id_gremio
      WHERE 1=1
    `;
    
    const { rows } = await pool.query(queryText);
    res.json({ total_resultados: rows.length, datos: rows });

  } catch (error) {
    console.error('Error de conexión en base de datos B2B:', error.message);
    res.status(500).json({ 
      error: 'Error de conexión con la base de datos de cPanel.',
      detalle: 'Asegúrate de que el puerto 5432 esté abierto de forma remota en tu hosting.',
      codigo_error: error.code
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor B2B Holdinvest corriendo exitosamente en puerto ${PORT}`);
});

