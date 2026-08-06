// Modifica esta sección en tu server.js
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  connectionTimeoutMillis: 5000,
  // Configuración ultra-compatible: intenta SSL, pero si no se puede, conecta igual
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});
