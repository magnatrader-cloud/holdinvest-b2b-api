const express = require('express');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(express.json());

// Configuración de la conexión a PostgreSQL con cPanel
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  connectionTimeoutMillis: 5000 // Aborta la petición a los 5 segundos si hay bloqueo, pero mantiene la API encendida
});

// 1. Ruta de Estado de la API
app.get('/api/status', (req, res) => {
  res.json({ status: 'Online', project: 'Holdinvest B2B Staging' });
});

// 2. Endpoint de Búsqueda Avanzada B2B (GET)
app.get('/api/empresas/buscar', async (req, res) => {
  try {
    const { tamano, region, estado, tipo } = req.query;
    
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
    
    const queryParams = [];
    let paramCounter = 1;

    if (tamano) { queryText += ` AND e.tamano_empresa = $${paramCounter}`; queryParams.push(tamano); paramCounter++; }
    if (tipo) { queryText += ` AND e.tipo_empresa = $${paramCounter}`; queryParams.push(tipo); paramCounter++; }
    if (region) { queryText += ` AND r.nombre_region ILIKE $${paramCounter}`; queryParams.push(`%${region}%`); paramCounter++; }
    if (estado) { queryText += ` AND est.nombre_estado ILIKE $${paramCounter}`; queryParams.push(`%${estado}%`); paramCounter++; }

    const { rows } = await pool.query(queryText, queryParams);
    res.json({ total_resultados: rows.length, datos: rows });

  } catch (error) {
    console.error('Error de consulta B2B:', error.message);
    res.status(500).json({ error: 'Error de conexión con la base de datos de cPanel.', detalle: error.message });
  }
});

// 3. NUEVO ENDPOINT: Registrar Nueva Empresa B2B (POST)
app.post('/api/empresas/registrar', async (req, res) => {
  try {
    const { razon_social, identificador_fiscal, tipo_empresa, tamano_empresa, id_ciudad, direccion_especifica } = req.body;

    // Validación básica de campos obligatorios antes de golpear la base de datos
    if (!razon_social || !identificador_fiscal || !tipo_empresa || !tamano_empresa || !id_ciudad) {
      return res.status(400).json({ error: 'Faltan campos obligatorios para procesar el registro comercial.' });
    }

    const insertText = `
      INSERT INTO Empresas (razon_social, identificador_fiscal, tipo_empresa, tamano_empresa, id_ciudad, direccion_especifica)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id_empresa, razon_social, fecha_registro;
    `;
    
    const values = [razon_social, identificador_fiscal, tipo_empresa, tamano_empresa, id_ciudad, direccion_especifica || null];
    
    const { rows } = await pool.query(insertText, values);
    res.status(201).json({ mensaje: 'Empresa afiliada con éxito', datos_empresa: rows[0] });

  } catch (error) {
    console.error('Error al insertar registro comercial:', error.message);
    
    // Captura específica si intentan registrar un RIF/NIT que ya existe
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El identificador fiscal (RIF/NIT) ya está registrado en el ecosistema.' });
    }
    
    res.status(500).json({ error: 'Error de conexión con la base de datos de cPanel.', detalle: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor B2B Holdinvest corriendo exitosamente en puerto ${PORT}`);
});
