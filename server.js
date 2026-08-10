const express = require('express');
const { Pool } = require('pg');
const cors = require('cors'); 
const nodemailer = require('nodemailer'); 
require('dotenv').config();

const app = express(); // CORREGIDO: Se removió la palabra 'report' que causaba el fallo

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

// ENDPOINT DE REGISTRO (POST) - INTEGRADO CON ALERTAS AUTOMÁTICAS POR CORREO
app.post('/api/empresas/registrar', async (req, res) => {
  try {
    const { razon_social, identificador_fiscal, tipo_empresa, tamano_empresa, id_ciudad } = req.body;

    if (!razon_social || !identificador_fiscal) {
      return res.status(400).json({ error: 'Razón Social e Identificador Fiscal son obligatorios' });
    }

    const ciudadIdEntero = parseInt(id_ciudad || '1', 10);

    // 1. Almacenar el registro en la base de datos de Neon
    const queryText = `
      INSERT INTO empresas (razon_social, identificador_fiscal, tipo_empresa, tamano_empresa, id_ciudad)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const values = [razon_social, identificador_fiscal, tipo_empresa, tamano_empresa, ciudadIdEntero];
    
    const { rows } = await pool.query(queryText, values);

    // 2. CONFIGURACIÓN DEL TRANSPORTE SMTP (Nodemailer)
    const transporter = nodemailer.createTransport({
      service: 'gmail', 
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    // 3. ESTRUCTURA Y DISEÑO DEL CORREO DE ALERTA (Formato HTML Limpio)
    const mailOptions = {
      from: `"BIDAccess Platform" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_RECEIVER, 
      subject: `🚨 Nueva Solicitud de Afiliación B2B: ${razon_social}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px; background-color: #ffffff;">
          <h2 style="color: #1e3a8a; margin-top: 0; font-size: 20px;">💼 Nueva Solicitud de Afiliación</h2>
          <p style="color: #4b5563; font-size: 14px;">Se ha recibido y guardado una nueva solicitud comercial en la plataforma. Detalles del registro:</p>
          
          <table style="width: 100%; border-collapse: collapse; margin-top: 16px; margin-bottom: 20px;">
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-size: 13px; font-weight: bold; color: #6b7280; text-transform: uppercase; width: 35%;">Razón Social:</td>
              <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px; color: #111827; font-weight: 600;">${razon_social}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-size: 13px; font-weight: bold; color: #6b7280; text-transform: uppercase;">ID Fiscal (RIF/NIT):</td>
              <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px; color: #111827; font-family: monospace;">${identificador_fiscal}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-size: 13px; font-weight: bold; color: #6b7280; text-transform: uppercase;">Tipo de Empresa:</td>
              <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px; color: #111827;">${tipo_empresa || 'Comercial'}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-size: 13px; font-weight: bold; color: #6b7280; text-transform: uppercase;">Tamaño:</td>
              <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px; color: #111827;">${tamano_empresa || 'No especificado'}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-size: 13px; font-weight: bold; color: #6b7280; text-transform: uppercase;">ID Ciudad Piloto:</td>
              <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px; color: #111827;">${ciudadIdEntero}</td>
            </tr>
          </table>
          
          <div style="padding: 12px; background-color: #f0fdf4; border-radius: 8px; text-align: center;">
            <span style="color: #166534; font-size: 13px; font-weight: bold;">Estatus: Registro persistido en la base de datos Neon</span>
          </div>
        </div>
      `
    };

    // 4. Despachar el correo electrónico en segundo plano
    transporter.sendMail(mailOptions, (mailErr, info) => {
      if (mailErr) {
        console.error('Error al enviar el correo de notificación:', mailErr);
      } else {
        console.log('Notificación por correo enviada exitosamente:', info.response);
      }
    });

    // 5. Responder de forma exitosa al cliente web
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor BIDAccess corriendo en puerto ${PORT}`);
});
