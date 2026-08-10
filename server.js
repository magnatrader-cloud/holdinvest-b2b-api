const express = require('express');
const { Pool } = require('pg');
const cors = require('cors'); // AGREGADO: Necesario para permitir que tu Frontend se comunique con la API
require('dotenv').config();

const app = express();

// CONFIGURACIÓN DE CORS: Permite de forma segura el acceso desde cualquier origen (tu frontend)
app.use(cors());
app.use(express.json());

// Configuración de la conexión a PostgreSQL ajustada para Neon y las variables de Render
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  connectionTimeoutMillis: 5000,
  // CONFIGURACIÓN SSL CRÍTICA: Resuelve el conflicto con la variable DB_SSL = true de Neon
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Ruta Base de Verificación (Apunta a la ruta que probamos antes)
app.get('/api', (req, res) => {
  res.json({ status: 'Online', message: 'Bienvenido a la API de Holdinvest B2B' });
});

// ENDPOINT DE BÚSQUEDA AVANZADA B2B
app.get('/api/empresas/buscar', async (req, res) => {
  try {
    const { tamano, region, estado, ciudad, tipo } = req.query;
    
    let queryText = `
      SELECT 
        e.id_empresa,
        e.razon_social,
        e.identificador_fiscal,
        e.tipo_empresa,
        e.tamano_empresa,
        c.nombre_ciudad,
        est.nombre_estado,
        r.nombre_region,
        COALESCE(g.nombre_gremio, 'NO AFILIADO') AS gremio_afiliado
      FROM empresas e
      JOIN ciudades c ON e.id_ciudad = c.id_ciudad
      JOIN estados est ON c.id_estado = est.id_estado
      JOIN regiones r ON est.id_region = r.id_region
      LEFT JOIN afiliaciones_gremios a ON e.id_empresa = a.id_empresa
      LEFT JOIN camaras_gremios g ON a.id_gremio = g.id_gremio
      WHERE 1=1
    `;
    // Nota: Se cambiaron los nombres de las tablas a minúsculas para coincidir exactamente con Postgres de Neon
    
    const queryParams = [];
    let paramCounter = 1;

    if (tamano) {
      queryText += ` AND e.tamano_empresa = $${paramCounter}`;
      queryParams.push(tamano);
      paramCounter++;
    }
    if (tipo) {
      queryText += ` AND e.tipo_empresa = $${paramCounter}`;
      queryParams.push(tipo);
      paramCounter++;
    }
    if (region) {
      queryText += ` AND r.nombre_region ILIKE $${paramCounter}`;
      queryParams.push(`%${region}%`);
      paramCounter++;
    }
    if (estado) {
      queryText += ` AND est.nombre_estado ILIKE $${paramCounter}`;
      queryParams.push(`%${estado}%`);
      paramCounter++;
    }
    if (ciudad) {
      queryText += ` AND c.nombre_ciudad ILIKE $${paramCounter}`;
      queryParams.push(`%${ciudad}%`);
      paramCounter++;
    }

    const { rows } = await pool.query(queryText, queryParams);
    res.json({ total_resultados: rows.length, datos: rows });

  } catch (error) {
    console.error('Error en búsqueda B2B:', error);
    res.status(500).json({ error: 'Error interno del servidor de desarrollo' });
  }
});

// ENDPOINT DE REGISTRO (POST): Agregado para procesar las altas desde tu formulario del frontend
app.post('/api/empresas/registrar', async (req, res) => {
  try {
    const { razon_social, identificador_fiscal, tipo_empresa, tamano_empresa, id_ciudad } = req.body;

    if (!razon_social || !identificador_fiscal) {
      return res.status(400).json({ error: 'Razón Social e Identificador Fiscal son obligatorios' });
    }

    const queryText = `
      INSERT INTO empresas (razon_social, identificador_fiscal, tipo_empresa, tamano_empresa, id_ciudad)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const values = [razon_social, identificador_fiscal, tipo_empresa, tamano_empresa, id_ciudad];
    
    const { rows } = await pool.query(queryText, values);
    res.status(201).json({ success: true, datos: rows[0] });

  } catch (error) {
    console.error('Error al registrar empresa:', error);
    if (error.code === '23505') { // Código de error de clave duplicada en Postgres
      return res.status(400).json({ error: 'El identificador fiscal ya se encuentra registrado' });
    }
    res.status(500).json({ error: 'Error al procesar el registro en la base de datos' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor B2B Holdinvest corriendo en puerto ${PORT}`);
});
