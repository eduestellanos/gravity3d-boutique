const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject'
};

const server = http.createServer((req, res) => {
    // Sanitizar la ruta para evitar directory traversal
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    
    // --- INTEGRACIÓN DE ENDPOINTS DE API PARA PERSISTENCIA EN DISCO ---
    if (urlPath.startsWith('/api/')) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        if (urlPath === '/api/store-data' && req.method === 'GET') {
            try {
                let customProducts = [];
                let customImages = {};
                let gravityInventory = null;
                let customPrices = {};
                let customDescriptions = {};
                let deletedFactoryProducts = [];
                let disabledProducts = [];

                const cpPath = path.join(DATA_DIR, 'custom_products.json');
                const ciPath = path.join(DATA_DIR, 'custom_images.json');
                const giPath = path.join(DATA_DIR, 'gravity_inventory.json');
                const cprPath = path.join(DATA_DIR, 'custom_prices.json');
                const cdPath = path.join(DATA_DIR, 'custom_descriptions.json');
                const dfpPath = path.join(DATA_DIR, 'deleted_factory_products.json');
                const dpPath = path.join(DATA_DIR, 'disabled_products.json');

                if (fs.existsSync(cpPath)) {
                    customProducts = JSON.parse(fs.readFileSync(cpPath, 'utf8'));
                }
                if (fs.existsSync(ciPath)) {
                    customImages = JSON.parse(fs.readFileSync(ciPath, 'utf8'));
                }
                if (fs.existsSync(giPath)) {
                    gravityInventory = JSON.parse(fs.readFileSync(giPath, 'utf8'));
                }
                if (fs.existsSync(cprPath)) {
                    customPrices = JSON.parse(fs.readFileSync(cprPath, 'utf8'));
                }
                if (fs.existsSync(cdPath)) {
                    customDescriptions = JSON.parse(fs.readFileSync(cdPath, 'utf8'));
                }
                if (fs.existsSync(dfpPath)) {
                    deletedFactoryProducts = JSON.parse(fs.readFileSync(dfpPath, 'utf8'));
                }
                if (fs.existsSync(dpPath)) {
                    disabledProducts = JSON.parse(fs.readFileSync(dpPath, 'utf8'));
                }

                res.writeHead(200);
                res.end(JSON.stringify({
                    custom_products: customProducts,
                    custom_images: customImages,
                    gravity_inventory: gravityInventory,
                    custom_prices: customPrices,
                    custom_descriptions: customDescriptions,
                    deleted_factory_products: deletedFactoryProducts,
                    disabled_products: disabledProducts
                }));
            } catch (err) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message }));
            }
            return;
        }

        if (urlPath === '/api/store-data' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    const cpPath = path.join(DATA_DIR, 'custom_products.json');
                    const ciPath = path.join(DATA_DIR, 'custom_images.json');
                    const giPath = path.join(DATA_DIR, 'gravity_inventory.json');
                    const cprPath = path.join(DATA_DIR, 'custom_prices.json');
                    const cdPath = path.join(DATA_DIR, 'custom_descriptions.json');
                    const dfpPath = path.join(DATA_DIR, 'deleted_factory_products.json');
                    const dpPath = path.join(DATA_DIR, 'disabled_products.json');

                    if (data.custom_products !== undefined) {
                        fs.writeFileSync(cpPath, JSON.stringify(data.custom_products, null, 2), 'utf8');
                    }
                    if (data.custom_images !== undefined) {
                        fs.writeFileSync(ciPath, JSON.stringify(data.custom_images, null, 2), 'utf8');
                    }
                    if (data.gravity_inventory !== undefined) {
                        fs.writeFileSync(giPath, JSON.stringify(data.gravity_inventory, null, 2), 'utf8');
                    }
                    if (data.custom_prices !== undefined) {
                        fs.writeFileSync(cprPath, JSON.stringify(data.custom_prices, null, 2), 'utf8');
                    }
                    if (data.custom_descriptions !== undefined) {
                        fs.writeFileSync(cdPath, JSON.stringify(data.custom_descriptions, null, 2), 'utf8');
                    }
                    if (data.deleted_factory_products !== undefined) {
                        fs.writeFileSync(dfpPath, JSON.stringify(data.deleted_factory_products, null, 2), 'utf8');
                    }
                    if (data.disabled_products !== undefined) {
                        fs.writeFileSync(dpPath, JSON.stringify(data.disabled_products, null, 2), 'utf8');
                    }

                    res.writeHead(200);
                    res.end(JSON.stringify({ status: 'success' }));
                } catch (err) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Error al escribir en disco: ' + err.message }));
                }
            });
            return;
        }

        if (urlPath === '/api/upload-image' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    const key = data.key;
                    const imageBase64 = data.imageBase64;

                    if (!key || !imageBase64) {
                        res.writeHead(400);
                        res.end(JSON.stringify({ error: 'Falta key o imageBase64' }));
                        return;
                    }

                    // Decodificar Base64
                    const matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                    if (!matches || matches.length !== 3) {
                        res.writeHead(400);
                        res.end(JSON.stringify({ error: 'Formato Base64 inválido' }));
                        return;
                    }

                    const mimeType = matches[1];
                    const base64Data = matches[2];
                    const buffer = Buffer.from(base64Data, 'base64');

                    // Determinar extensión adecuada
                    let ext = '.jpg';
                    if (mimeType === 'image/png') ext = '.png';
                    else if (mimeType === 'image/gif') ext = '.gif';
                    else if (mimeType === 'image/webp') ext = '.webp';

                    // Sanitizar la clave para evitar path traversal en la escritura
                    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '');
                    if (!safeKey) {
                        res.writeHead(400);
                        res.end(JSON.stringify({ error: 'Clave de imagen inválida o vacía tras sanitización' }));
                        return;
                    }

                    // Crear carpeta de subidas si no existe
                    const uploadsDir = path.resolve(DATA_DIR, 'images', 'uploads');
                    if (!fs.existsSync(uploadsDir)) {
                        fs.mkdirSync(uploadsDir, { recursive: true });
                    }

                    const filename = `custom_image_${safeKey}${ext}`;
                    const filePath = path.resolve(uploadsDir, filename);

                    // Verificar límite de directorio (Double Check)
                    if (!filePath.startsWith(uploadsDir)) {
                        res.writeHead(400);
                        res.end(JSON.stringify({ error: 'Intento de Path Traversal detectado en la escritura' }));
                        return;
                    }

                    fs.writeFileSync(filePath, buffer);

                    const relativeUrl = `images/uploads/${filename}`;

                    res.writeHead(200);
                    res.end(JSON.stringify({ status: 'success', url: relativeUrl }));
                } catch (err) {
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: 'Error de servidor al subir imagen: ' + err.message }));
                }
            });
            return;
        }

        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Endpoint de API no encontrado' }));
        return;
    }

    let filePath;
    if (urlPath.startsWith('/images/uploads/') || urlPath.startsWith('images/uploads/')) {
        const relativePath = urlPath.startsWith('/') ? urlPath.substring('/images/uploads/'.length) : urlPath.substring('images/uploads/'.length);
        const uploadsDir = path.resolve(DATA_DIR, 'images', 'uploads');
        filePath = path.resolve(uploadsDir, relativePath);

        // Validar que no se salga de la carpeta de subidas
        if (!filePath.startsWith(uploadsDir)) {
            res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>403 - Acceso Prohibido</h1><p>No tienes permiso para acceder a este recurso.</p>', 'utf-8');
            return;
        }
    } else {
        const publicDir = path.resolve(__dirname);
        filePath = path.resolve(publicDir, urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, ''));

        // Validar que no se salga de la carpeta del proyecto
        if (!filePath.startsWith(publicDir)) {
            res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>403 - Acceso Prohibido</h1><p>No tienes permiso para acceder a este recurso.</p>', 'utf-8');
            return;
        }
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 - Archivo no encontrado</h1><p>Verifica que el archivo exista en la boutique comercial.</p>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end('<h1>500 - Error interno del servidor: ' + error.code + '</h1>', 'utf-8');
            }
        } else {
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            res.end(content, 'utf-8');
        }
    });
});

const HOST = process.env.RENDER ? '0.0.0.0' : '127.0.0.1';

server.listen(PORT, HOST, () => {
    console.log(`🚀 Servidor de Gravity 3D iniciado con exito!`);
    console.log(`🌍 URL de acceso: http://${HOST}:${PORT}`);
    console.log(`📂 Directorio de persistencia: ${DATA_DIR}`);
    
    // Intentar abrir el navegador por defecto automaticamente solo en Windows local
    if (process.platform === 'win32' && !process.env.RENDER) {
        try {
            const { exec } = require('child_process');
            exec(`start http://${HOST}:${PORT}`);
        } catch (e) {
            console.warn("No se pudo iniciar el navegador automaticamente:", e.message);
        }
    }
});
