{
  "name": "holdinvest-b2b-api",
  "version": "1.0.0",
  "description": "API de Holdinvest B2B",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.19.2",
    "pg": "^8.11.5"
  },
  "author": "",
  "license": "ISC"
}


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor B2B Holdinvest corriendo exitosamente en puerto ${PORT}`);
});
