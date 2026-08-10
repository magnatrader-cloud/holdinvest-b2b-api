const express = require('express');
const { Pool } = require('pg');
const cors = require('cors'); 
const nodemailer = require('nodemailer'); 
require('dotenv').config();

const app = express();

// CONFIGURACIÓN DE CORS
app.use(cors());
app.use(express.json());

// Configuración de la conexión a PostgreSQL (Neon y Render)
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  connectionTimeoutMillis: 5000,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Ruta Base de Verificación
app.get('/api', (req, res) => {
  res.json({ status: 'Online', message: 'Bienvenido a la API de BIDAccess B2B' });
});

// =========================================================
// 🗺️ ENDPOINTS GEOGRÁFICOS PARA FILTROS DINÁMICOS
// =========================================================

// 1. Obtener todas las regiones para el buscador
app.get('/api/regiones', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT DISTINCT nombre_region FROM regiones WHERE nombre_region IS NOT NULL ORDER BY nombre_region;');
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener regiones:', error);
    res.status(500).json({ error: 'Error al cargar regiones' });
  }
});

// 2. Obtener todos los estados para el buscador
app.get('/api/estados', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT DISTINCT nombre_estado FROM estados WHERE nombre_estado IS NOT NULL ORDER BY nombre_estado;');
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener estados:', error);
    res.status(500).json({ error: 'Error al cargar estados' });
  }
});

// 3. Obtener todas las ciudades para el buscador
app.get('/api/ciudades', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id_ciudad, nombre_ciudad FROM ciudades WHERE nombre_ciudad IS NOT NULL ORDER BY nombre_ciudad;');
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener ciudades:', error);
    res.status(500).json({ error: 'Error al cargar ciudades' });
  }
});

// =========================================================
// 🔍 ENDPOINT DE BÚSQUEDA AVANZADA B2B
// =========================================================
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

// =========================================================
// ➕ ENDPOINT DE REGISTRO (POST)
// =========================================================
app.post('/api/empresas/registrar', async (req, res) => {
  try {
    const { razon_social, identificador_fiscal, tipo_empresa, tamano_empresa, id_ciudad } = req.body;

    if (!razon_social || !identificador_fiscal) {
      return res.status(400).json({ error: 'Razón Social e Identificador Fiscal son obligatorios' });
    }

    const ciudadIdEntero = parseInt(id_ciudad || '1', 10);

    const queryText = `
      INSERT INTO empresas (razon_social, identificador_fiscal, tipo_empresa, tamano_empresa, id_ciudad)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const values = [razon_social, identificador_fiscal, tipo_empresa, tamano_empresa, ciudadIdEntero];
    
    const { rows } = await pool.query(queryText, values);

    // Filtro asíncrono secundario blindado para la mensajería
    const cleanEmailUser = (process.env.EMAIL_USER || '').replace('://', '').trim();
    const cleanEmailReceiver = (process.env.EMAIL_RECEIVER || '').replace('://', '').trim();
    const cleanEmailPass = (process.env.EMAIL_PASS || '').trim();

    const transporter = nodemailer.createTransport({
      host: '://gmail.com',
      port: 465,
      secure: true, 
      auth: {
        user: cleanEmailUser,
        pass: cleanEmailPass
      }
    });

    const mailOptions = {
      from: cleanEmailUser, 
      to: cleanEmailReceiver, 
      subject: `🚨 Nueva Solicitud de Afiliación B2B: ${razon_social}`,
      html: `<p>Se ha recibido una nueva solicitud comercial para la Razón Social: <b>${razon_social}</b></p>`
    };

    transporter.sendMail(mailOptions, (mailErr) => {
      if (mailErr) console.error('Aviso de despacho pausado:', mailErr.message);
    });

    res.status(201).json({ success: true, datos: rows });

  } catch (error) {
    console.error('Error al registrar empresa:', error);
    if (error.code === '23505') { 
      return res.status(400).json({ error: 'El identificador fiscal ya se encuentra registrado' });
    }
    if (error.code === '23503') {
      return res.status(400).json({ error: 'El ID de Ciudad Piloto ingresado no existe en el sistema' });
    }
    res.status(500).json({ error: 'Error al procesar el registro en la base de datos' });
  }
});

// ARRANQUE DEL SERVIDOR EN LA NUBE
app.listen(process.env.PORT || 3000, () => {
  console.log(`Servidor BIDAccess corriendo en puerto ${process.env.PORT || 3000}`);
});
