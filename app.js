/* ==========================================================================
   GRAVITY 3D - APLICACIÓN INTERACTIVA & COTIZADOR MULTI-PRODUCTO
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    function isVideoData(data) {
        if (!data) return false;
        return data.startsWith('data:video/') || data.includes('.mp4') || data.includes('.webm') || data.includes('.ogv') || data.includes('.mov');
    }

    function renderProductMedia(photo, alt, id, inlineStyle = '', className = 'catalog-thumb') {
        if (!photo) return `<img src="images/jabonera.png" alt="${alt}" class="${className}" id="${id || ''}" style="${inlineStyle}">`;
        const isVideo = isVideoData(photo);
        if (isVideo) {
            return `<video src="${photo}" class="${className}" id="${id || ''}" style="object-fit: cover; ${inlineStyle}" autoplay loop muted playsinline></video>`;
        }
        const src = photo.startsWith('images/') ? photo + '?t=' + Date.now() : photo;
        return `<img src="${src}" alt="${alt}" class="${className}" id="${id || ''}" style="${inlineStyle}">`;
    }

    function setupAdminMediaListeners(el, key) {
        if (!isAdmin) return;
        el.style.cursor = 'pointer';
        el.title = '🔓 Modo Admin: Hacé clic para cambiar la imagen/video del producto';
        
        el.addEventListener('mouseenter', () => {
            el.style.filter = 'brightness(0.7) contrast(1.1)';
            el.style.transform = 'scale(1.03)';
            el.style.boxShadow = '0 0 15px var(--primary-glow)';
        });
        el.addEventListener('mouseleave', () => {
            el.style.filter = '';
            el.style.transform = '';
            el.style.boxShadow = '';
        });
        
        el.addEventListener('click', () => {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*,video/*';
            
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    let mime = file.type || '';
                    const ext = file.name ? file.name.substring(file.name.lastIndexOf('.')).toLowerCase() : '';
                    if (!mime && ext) {
                        if (['.jpg', '.jpeg', '.jpe'].includes(ext)) mime = 'image/jpeg';
                        else if (ext === '.png') mime = 'image/png';
                        else if (ext === '.gif') mime = 'image/gif';
                        else if (ext === '.webp') mime = 'image/webp';
                        else if (ext === '.svg') mime = 'image/svg+xml';
                        else if (ext === '.mp4') mime = 'video/mp4';
                        else if (ext === '.webm') mime = 'video/webm';
                        else if (ext === '.ogv') mime = 'video/ogg';
                        else if (ext === '.mov') mime = 'video/quicktime';
                    }

                    if (!mime.startsWith('image/') && !mime.startsWith('video/')) {
                        alert("⚠️ Formato de archivo no soportado.");
                        return;
                    }

                    const reader = new FileReader();
                    reader.onload = function(event) {
                        const isVideoOrGif = mime.startsWith('video/') || mime === 'image/gif';
                        let rawBase64 = event.target.result;
                        if (rawBase64.startsWith('data:application/octet-stream;')) {
                            rawBase64 = rawBase64.replace('data:application/octet-stream;', `data:${mime};`);
                        }
                        
                        const handleResult = (base64OrUrl) => {
                            const newIsVideo = isVideoData(base64OrUrl);
                            let replacement;
                            if (newIsVideo) {
                                replacement = document.createElement('video');
                                replacement.autoplay = true;
                                replacement.loop = true;
                                replacement.muted = true;
                                replacement.playsInline = true;
                                replacement.style.objectFit = 'cover';
                            } else {
                                replacement = document.createElement('img');
                                replacement.alt = el.alt || '';
                            }
                            replacement.src = base64OrUrl;
                            replacement.className = el.className;
                            replacement.id = el.id;
                            replacement.style.cssText = el.style.cssText;
                            
                            el.parentNode.replaceChild(replacement, el);
                            
                            setupAdminMediaListeners(replacement, key);
                            
                            if (key.startsWith('custom_')) {
                                const customProds = getSafeCustomProducts();
                                const prodIndex = customProds.findIndex(p => p.key === key);
                                if (prodIndex !== -1) {
                                    customProds[prodIndex].photo = base64OrUrl;
                                    customProds[prodIndex].slicerPhoto = base64OrUrl;
                                    localStorage.setItem('custom_products', JSON.stringify(customProds));
                                }
                            } else {
                                localStorage.setItem(`custom_image_${key}`, base64OrUrl);
                            }
                            
                            persistDataToServer(true);
                            alert("✨ ¡Imagen/video del producto actualizada y persistida con éxito!");
                        };

                        if (isVideoOrGif) {
                            if (serverAvailable) {
                                uploadImageToServer(key, rawBase64).then(uploadedUrl => {
                                    handleResult(uploadedUrl || rawBase64);
                                });
                            } else {
                                handleResult(rawBase64);
                            }
                        } else {
                            const tempImg = new Image();
                            tempImg.onload = function() {
                                const canvas = document.createElement('canvas');
                                const maxDim = 320;
                                let width = tempImg.width;
                                let height = tempImg.height;
                                if (width > height) {
                                    if (width > maxDim) {
                                        height = Math.round((height * maxDim) / width);
                                        width = maxDim;
                                    }
                                } else {
                                    if (height > maxDim) {
                                        width = Math.round((width * maxDim) / height);
                                        height = maxDim;
                                    }
                                }
                                canvas.width = width;
                                canvas.height = height;
                                const ctx = canvas.getContext('2d');
                                ctx.drawImage(tempImg, 0, 0, width, height);
                                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.5);
                                
                                if (serverAvailable) {
                                    uploadImageToServer(key, compressedBase64).then(uploadedUrl => {
                                        handleResult(uploadedUrl || compressedBase64);
                                    });
                                } else {
                                    handleResult(compressedBase64);
                                }
                            };
                            tempImg.src = event.target.result;
                        }
                    };
                    reader.readAsDataURL(file);
                }
            });
            fileInput.click();
        });
    }

    // --- INTEGRACIÓN DE PERSISTENCIA EN DISCO Y API DE SERVIDOR NODE.JS ---
    let serverAvailable = false;
    try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', '/api/store-data?t=' + Date.now(), false); // Petición síncrona inmediata con cache buster
        xhr.send(null);
        if (xhr.status === 200) {
            const data = JSON.parse(xhr.responseText);
            serverAvailable = true;
            console.log("🔌 Sincronizado exitosamente con el servidor de disco local.");

            if (data.gravity_inventory) {
                localStorage.setItem('gravity_inventory', JSON.stringify(data.gravity_inventory));
            }
            if (data.custom_products) {
                localStorage.setItem('custom_products', JSON.stringify(data.custom_products));
            }
            if (data.custom_images) {
                for (const [k, val] of Object.entries(data.custom_images)) {
                    localStorage.setItem(`custom_image_${k}`, val);
                }
            }
            if (data.custom_prices) {
                for (const [k, val] of Object.entries(data.custom_prices)) {
                    localStorage.setItem(`price_${k}`, val);
                }
            }
            if (data.custom_descriptions) {
                for (const [k, val] of Object.entries(data.custom_descriptions)) {
                    localStorage.setItem(`desc_${k}`, val);
                }
            }
            if (data.deleted_factory_products) {
                localStorage.setItem('deleted_factory_products', JSON.stringify(data.deleted_factory_products));
            }
            if (data.disabled_products) {
                localStorage.setItem('disabled_products', JSON.stringify(data.disabled_products));
            }
            if (data.custom_telemetry) {
                for (const [k, val] of Object.entries(data.custom_telemetry)) {
                    localStorage.setItem(`telemetry_${k}`, JSON.stringify(val));
                }
            }
        }
    } catch (e) {
        console.warn("⚠️ Servidor de disco no disponible (ejecución estática autónoma). Se usará LocalStorage del navegador.");
    }

    // Limpieza de claves residuales de localStorage para forzar inicio en público en clientes existentes
    localStorage.removeItem('isAdmin');
    localStorage.removeItem('wholesaleCodeEntered');

    // Estado del Administrador (Clave: gravity3d)
    let isAdmin = sessionStorage.getItem('isAdmin') === 'true';

    // Configuración central de WhatsApp (Ingresar el número del taller con código de país, ej: 5491100000000)
    const WHATSAPP_PHONE = '5493434483188';

    // Código Mayorista / Venta al Público (+40% por defecto)
    let wholesaleCodeEntered = sessionStorage.getItem('wholesaleCodeEntered') === 'true';

    function getDisplayPrice(basePrice) {
        if (wholesaleCodeEntered) {
            return basePrice;
        } else {
            return customRound(basePrice * 1.40);
        }
    }

    function getFactoryMaterial(key, defaultMat) {
        const savedTelemetryRaw = localStorage.getItem(`telemetry_${key}`);
        if (savedTelemetryRaw) {
            try {
                const savedTelemetry = JSON.parse(savedTelemetryRaw);
                if (savedTelemetry && savedTelemetry.material) {
                    return savedTelemetry.material;
                }
            } catch(e) {}
        }
        return defaultMat;
    }

    // --- HELPERS PARA GUARDAR DATOS Y SUBIR IMÁGENES AL SERVIDOR NODE.JS ---
    function persistDataToServer(sync = false) {
        if (!serverAvailable) return;
        try {
            const customProductsRaw = localStorage.getItem('custom_products');
            const customProductsList = customProductsRaw ? JSON.parse(customProductsRaw) : [];
            const gravityInventoryRaw = localStorage.getItem('gravity_inventory');
            const gravityInventory = gravityInventoryRaw ? JSON.parse(gravityInventoryRaw) : null;

            // Recopilar imágenes, precios y descripciones de todos los productos de localStorage
            const customImages = {};
            const customPrices = {};
            const customDescriptions = {};

            // 1. Productos de fábrica
            const customTelemetry = {};
            const originalKeys = ['jabonera', 'portarollo', 'organizador', 'contenedor', 'organizador_moderno', 'juguete_gato'];
            originalKeys.forEach(k => {
                const img = localStorage.getItem(`custom_image_${k}`);
                if (img) customImages[k] = img;

                const price = localStorage.getItem(`price_${k}`);
                if (price) customPrices[k] = parseFloat(price);

                const desc = localStorage.getItem(`desc_${k}`);
                if (desc) customDescriptions[k] = desc;

                const tel = localStorage.getItem(`telemetry_${k}`);
                if (tel) customTelemetry[k] = JSON.parse(tel);
            });

            // 2. Productos personalizados (pueden tener precios/descripciones/imágenes)
            customProductsList.forEach(prod => {
                const price = localStorage.getItem(`price_${prod.key}`);
                if (price) customPrices[prod.key] = parseFloat(price);

                const desc = localStorage.getItem(`desc_${prod.key}`);
                if (desc) customDescriptions[prod.key] = desc;
            });

            const deletedFactoryProductsRaw = localStorage.getItem('deleted_factory_products');
            const deletedFactoryProducts = deletedFactoryProductsRaw ? JSON.parse(deletedFactoryProductsRaw) : [];

            const disabledProductsRaw = localStorage.getItem('disabled_products');
            const disabledProducts = disabledProductsRaw ? JSON.parse(disabledProductsRaw) : [];

            const payload = {
                custom_products: customProductsList,
                custom_images: customImages,
                gravity_inventory: gravityInventory,
                custom_prices: customPrices,
                custom_descriptions: customDescriptions,
                deleted_factory_products: deletedFactoryProducts,
                disabled_products: disabledProducts,
                custom_telemetry: customTelemetry
            };

            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/store-data', !sync); // Síncrono si sync es true
            xhr.setRequestHeader('Content-Type', 'application/json');
            if (!sync) {
                xhr.onload = function() {
                    if (xhr.status === 200) {
                        console.log("💾 Cambios persistidos con éxito físicamente en disco.");
                    } else {
                        console.error("❌ Fallo en la persistencia del servidor: código " + xhr.status);
                    }
                };
            }
            xhr.send(JSON.stringify(payload));
            if (sync && xhr.status === 200) {
                console.log("💾 Cambios persistidos de forma síncrona en disco.");
            }
        } catch (e) {
            console.error("❌ Error al serializar y enviar datos de guardado:", e);
        }
    }

    async function uploadImageToServer(key, base64) {
        if (!serverAvailable) return null;
        try {
            const response = await fetch('/api/upload-image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ key, imageBase64: base64 })
            });
            if (response.ok) {
                const resData = await response.json();
                if (resData.status === 'success' && resData.url) {
                    console.log(`📸 Imagen de "${key}" subida exitosamente al disco: ${resData.url}`);
                    return resData.url;
                }
            }
        } catch (err) {
            console.error("❌ Error de red/servidor al subir imagen:", err);
        }
        return null;
    }

    // Lista de productos con sus especificaciones
    const products = {
        jabonera: {
            name: "Jabonera de Panal Minimalista",
            price: localStorage.getItem('price_jabonera') ? parseFloat(localStorage.getItem('price_jabonera')) : 4550,
            qty: 0,
            color: "Beige",
            active: true,
            friendlyColor: "Beige Soft (Foto)"
        },
        portarollo: {
            name: "Smart Toilet Roll Holder",
            price: localStorage.getItem('price_portarollo') ? parseFloat(localStorage.getItem('price_portarollo')) : 7765,
            qty: 0,
            color: "Space Grey",
            active: true,
            friendlyColor: "Space Grey (Foto)"
        },
        organizador: {
            name: "Organizador Compartimentado",
            price: localStorage.getItem('price_organizador') ? parseFloat(localStorage.getItem('price_organizador')) : 13125,
            qty: 0,
            color: "Blue",
            active: true,
            friendlyColor: "Azul Corporativo (Foto)"
        },
        contenedor: {
            name: "Contenedor Roscado 50mm",
            price: localStorage.getItem('price_contenedor') ? parseFloat(localStorage.getItem('price_contenedor')) : 2055,
            qty: 0,
            color: "Red",
            active: true,
            friendlyColor: "Rojo Fuego (Foto)"
        },
        organizador_moderno: {
            name: "Organizador de Escritorio Moderno",
            price: localStorage.getItem('price_organizador_moderno') ? parseFloat(localStorage.getItem('price_organizador_moderno')) : 13320,
            qty: 0,
            color: "Space Grey",
            active: true,
            friendlyColor: "Space Grey (Foto)"
        },
        juguete_gato: {
            name: "Juguete Esfera Geodésica \"Geo-Ball\"",
            price: localStorage.getItem('price_juguete_gato') ? parseFloat(localStorage.getItem('price_juguete_gato')) : 2875,
            qty: 0,
            color: "Brown",
            active: true,
            friendlyColor: "Marrón Orgánico (Foto)"
        }
    };

    // Precios de fábrica originales para el restablecimiento individual
    const defaultPrices = {
        jabonera: 4550,
        portarollo: 7765,
        organizador: 13125,
        contenedor: 2055,
        organizador_moderno: 13320,
        juguete_gato: 2875
    };

    // Elementos del DOM
    const summaryItemsContainer = document.getElementById('summaryItemsContainer');
    const totalPriceDisplay = document.getElementById('totalPriceDisplay');
    const btnOrder = document.getElementById('btnOrder');
    const floatingCartBtn = document.getElementById('floatingCartBtn');
    const cartBadgeCount = document.getElementById('cartBadgeCount');
    let editingProductKey = null;
    let compressedImageBase64 = '';

    // ==========================================================================
    // DYNAMIC INVENTORY & CUSTOM PRODUCTS SYSTEM
    // ==========================================================================

    // Helpers de protección y recuperación de localStorage
    function getSafeInventory() {
        const defaultInv = {
            constants: {
                energia_kwh_ars: 110.0,
                consumo_p1s_kw_h: 0.14,
                amortizacion_h_ars: 200.0,
                precios_por_gramo: {
                    PETG: 32.0,
                    PLA: 28.0,
                    ABS: 35.0
                },
                margen_purga: 0.05
            },
            inventario: [
                { Material: "PETG", Color: "Beige", Marca: "GST3D", "Stock Inicial": 500.0, Consumo: 309.21, "Stock Actual": 190.79, Estado: "✅ Óptimo" },
                { Material: "PETG", Color: "Transparent", Marca: "GST3D", "Stock Inicial": 800.0, Consumo: 0.0, "Stock Actual": 800.0, Estado: "✅ Óptimo" },
                { Material: "PETG", Color: "Space Grey", Marca: "GST3D", "Stock Inicial": 500.0, Consumo: 94.72, "Stock Actual": 405.28, Estado: "✅ Óptimo" },
                { Material: "PETG", Color: "Orange", Marca: "GST3D", "Stock Inicial": 2000.0, Consumo: 86.82, "Stock Actual": 1913.18, Estado: "✅ Óptimo" },
                { Material: "PETG", Color: "Brown", Marca: "GST3D", "Stock Inicial": 5000.0, Consumo: 38.83, "Stock Actual": 4961.17, Estado: "✅ Óptimo" },
                { Material: "PETG", Color: "Black", Marca: "GST3D", "Stock Inicial": 500.0, Consumo: 39.25, "Stock Actual": 460.75, Estado: "✅ Óptimo" },
                { Material: "PETG", Color: "Blue", Marca: "GST3D", "Stock Inicial": 800.0, Consumo: 158.63, "Stock Actual": 641.37, Estado: "✅ Óptimo" },
                { Material: "PETG", Color: "Red", Marca: "GST3D", "Stock Inicial": 700.0, Consumo: 20.44, "Stock Actual": 679.56, Estado: "✅ Óptimo" },
                { Material: "PETG", Color: "Green", Marca: "GST3D", "Stock Inicial": 1700.0, Consumo: 0.0, "Stock Actual": 1700.0, Estado: "✅ Óptimo" }
            ]
        };
        try {
            const raw = localStorage.getItem('gravity_inventory');
            if (!raw) {
                localStorage.setItem('gravity_inventory', JSON.stringify(defaultInv));
                return defaultInv;
            }
            const parsed = JSON.parse(raw);
            if (parsed && parsed.constants && parsed.constants.precios_por_gramo) {
                return parsed;
            }
            localStorage.setItem('gravity_inventory', JSON.stringify(defaultInv));
            return defaultInv;
        } catch (e) {
            console.error("⚠️ Error en 'gravity_inventory' localStorage, restableciendo de emergencia:", e);
            localStorage.setItem('gravity_inventory', JSON.stringify(defaultInv));
            return defaultInv;
        }
    }

    function getSafeCustomProducts() {
        try {
            const raw = localStorage.getItem('custom_products');
            if (!raw) return [];
            let parsed = JSON.parse(raw) || [];
            
            // Auto-limpieza de imágenes base64 de productos heredados para evitar sobrecarga de cuota de localStorage o bloqueos de memoria
            let modified = false;
            parsed = parsed.map(prod => {
                let updatedProd = { ...prod };
                // Solo purga si el Base64 supera los 2MB de longitud para evitar saturar el almacenamiento
                if (updatedProd.photo && updatedProd.photo.startsWith('data:') && updatedProd.photo.length > 2000000) {
                    console.log("🧼 Limpiando imagen base64 pesada heredada:", updatedProd.name);
                    updatedProd.photo = 'images/jabonera.png'; // Fallback liviano
                    modified = true;
                }
                if (updatedProd.slicerPhoto && updatedProd.slicerPhoto.startsWith('data:') && updatedProd.slicerPhoto.length > 2000000) {
                    updatedProd.slicerPhoto = 'images/jabonera.png';
                    modified = true;
                }
                if (updatedProd.telemetry) {
                    if (updatedProd.telemetry.slicerPhoto && updatedProd.telemetry.slicerPhoto.startsWith('data:') && updatedProd.telemetry.slicerPhoto.length > 2000000) {
                        updatedProd.telemetry.slicerPhoto = 'images/jabonera.png';
                        modified = true;
                    }
                }
                return updatedProd;
            });
            
            if (modified) {
                localStorage.setItem('custom_products', JSON.stringify(parsed));
            }
            
            return parsed;
        } catch (e) {
            console.error("⚠️ Error en 'custom_products' localStorage, restableciendo:", e);
            localStorage.setItem('custom_products', '[]');
            return [];
        }
    }

    // --- FUNCIÓN PARA APLICAR LA ELIMINACIÓN DE PRODUCTOS DE FÁBRICA ---
    function applyDeletedFactoryProducts() {
        const deletedRaw = localStorage.getItem('deleted_factory_products');
        let deletedList = [];
        if (deletedRaw) {
            try {
                deletedList = JSON.parse(deletedRaw);
            } catch(e) {
                console.error(e);
            }
        }
        
        deletedList.forEach(key => {
            // Eliminar de las estructuras
            delete products[key];
            delete defaultPrices[key];
            
            // Buscar y remover la tarjeta del DOM
            let inputId = '';
            if (key === 'jabonera') inputId = 'checkJabonera';
            else if (key === 'portarollo') inputId = 'checkPortarollo';
            else if (key === 'organizador') inputId = 'checkOrganizador';
            else if (key === 'contenedor') inputId = 'checkContenedor';
            else if (key === 'organizador_moderno') inputId = 'checkOrganizadorModerno';
            else if (key === 'juguete_gato') inputId = 'checkJugueteGato';
            
            if (inputId) {
                const checkbox = document.getElementById(inputId);
                const card = checkbox ? checkbox.closest('.product-selection-card') : null;
                if (card) {
                    const grid = card.parentElement;
                    card.remove();
                    
                    // Si la grilla se queda vacía, removemos la colección y el enlace
                    if (grid && grid.children.length === 0) {
                        const collectionId = grid.id.replace('grid-', '');
                        const header = document.getElementById(collectionId);
                        if (header) header.remove();
                        grid.remove();
                        
                        const navMenu = document.querySelector('.nav-menu');
                        const navLink = navMenu ? navMenu.querySelector(`a[href="#${collectionId}"]`) : null;
                        if (navLink) navLink.remove();
                    }
                }
            }
        });
    }

    // Inicializar base de datos de inventario si no existe
    getSafeInventory();

    // Aplicar eliminación de fábrica inicial al cargar
    applyDeletedFactoryProducts();

    // Cargar productos personalizados de forma robusta a prueba de fallos de localStorage
    let customProducts = getSafeCustomProducts();
    customProducts.forEach(prod => {
        // Registrar en el diccionario global de productos
        products[prod.key] = {
            name: prod.name,
            price: localStorage.getItem(`price_${prod.key}`) ? parseFloat(localStorage.getItem(`price_${prod.key}`)) : prod.price,
            qty: 0,
            color: prod.telemetry.color,
            active: true,
            friendlyColor: prod.telemetry.friendlyColor
        };
        // Registrar en precios por defecto
        defaultPrices[prod.key] = prod.price;

        // Renderizar e inyectar tarjeta en la grilla de la colección correspondiente
        let targetGrid = document.getElementById(`grid-${prod.collectionId}`);
        if (!targetGrid) {
            // Crear colección dinámica sobre la marcha si no existe en el DOM
            const productsListWrapper = document.querySelector('.products-list-wrapper');
            if (productsListWrapper) {
                const collName = prod.collectionName || prod.collectionId.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                const newCollHTML = `
                    <div class="collection-header-inline" id="${prod.collectionId}" style="margin-top: 48px; margin-bottom: 24px;">
                        <h3><i class="fa-solid fa-folder-open" style="color: var(--primary);"></i> Colección ${collName}</h3>
                    </div>
                    <div class="products-grid-cols" id="grid-${prod.collectionId}"></div>
                `;
                productsListWrapper.insertAdjacentHTML('beforeend', newCollHTML);
                targetGrid = document.getElementById(`grid-${prod.collectionId}`);

                // --- AGREGAR ENLACE DINÁMICO EN EL MENU DE NAVEGACIÓN ---
                const navMenu = document.querySelector('.nav-menu');
                const pilaresLink = navMenu ? navMenu.querySelector('a[href="#pilares"]') : null;
                if (navMenu && pilaresLink && !navMenu.querySelector(`a[href="#${prod.collectionId}"]`)) {
                    const newNavLinkHTML = `<a href="#${prod.collectionId}" class="nav-link dynamic-nav-link">${collName}</a>`;
                    pilaresLink.insertAdjacentHTML('beforebegin', newNavLinkHTML);
                }
            }
        }
        if (targetGrid) {
            const cardHTML = `
                <div class="product-selection-card glassmorphism" data-custom-key="${prod.key}">
                    <span class="product-category-badge">${prod.categoryBadge}</span>
                    <div class="product-card-header">
                        <div class="product-main-visual">
                            ${renderProductMedia(prod.photo, prod.name, `img_${prod.key}`)}
                        </div>
                        <div class="product-main-details">
                            <h3>${prod.name} ${isAdmin ? `<i class="fa-solid fa-pen-to-square btn-edit-product-trigger" data-product-key="${prod.key}" style="cursor: pointer; margin-left: 8px; font-size: 0.95rem; color: var(--primary); transition: var(--transition);" title="Editar telemetría y detalles del producto"></i>` : ''}</h3>
                            <p class="product-card-desc" id="desc_${prod.key}">${prod.desc}</p>
                            <span class="card-price-tag ${isAdmin ? 'admin-editable' : ''}" id="price_${prod.key}">$${new Intl.NumberFormat('es-AR').format(getDisplayPrice(products[prod.key].price))} ARS</span>
                            ${isAdmin ? `<i class="fa-solid fa-rotate-left reset-price-btn" id="resetPrice_${prod.key}" style="cursor: pointer; margin-left: 8px; font-size: 0.85rem; opacity: 0.5; color: var(--primary);" title="Restablecer precio original"></i>` : ''}
                        </div>
                    </div>
                    <hr class="summary-divider">
                    <div class="product-customizer-controls">
                        <!-- Toggle Activation -->
                        <label class="toggle-container">
                            <input type="checkbox" id="check_${prod.key}" checked>
                            <span class="toggle-slider"></span>
                            <span class="toggle-label-text">Incluir en mi pedido</span>
                        </label>
                        
                        <div class="controls-row" id="controls_${prod.key}">
                            <!-- Color selection -->
                            <div class="color-control">
                                <span class="control-label-micro">Color Base:</span>
                                <div class="color-options-micro" data-target="_${prod.key}">
                                    <button class="color-btn-micro active" data-color="${prod.telemetry.color}" style="background: ${getColorGradient(prod.telemetry.color)};" data-name="${prod.telemetry.friendlyColor}"></button>
                                    <button class="color-btn-micro" data-color="Space Grey" style="background: linear-gradient(135deg, #4A5568, #2D3748);" data-name="Space Grey"></button>
                                    <button class="color-btn-micro" data-color="Beige" style="background: linear-gradient(135deg, #E2E8F0, #CBD5E0);" data-name="Beige Soft"></button>
                                    <button class="color-btn-micro" data-color="Transparent" style="background: linear-gradient(135deg, rgba(255,255,255,0.7), rgba(255,255,255,0.2));" data-name="Transparente"></button>
                                    <button class="color-btn-micro" data-color="Orange" style="background: linear-gradient(135deg, #ED8936, #DD6B20);" data-name="Naranja"></button>
                                    <button class="color-btn-micro" data-color="Brown" style="background: linear-gradient(135deg, #7B341E, #4A1D0F);" data-name="Marrón"></button>
                                    <button class="color-btn-micro" data-color="Black" style="background: linear-gradient(135deg, #1A202C, #0A0E17);" data-name="Negro"></button>
                                    <button class="color-btn-micro" data-color="Blue" style="background: linear-gradient(135deg, #3182CE, #2B6CB0);" data-name="Azul"></button>
                                    <button class="color-btn-micro" data-color="Red" style="background: linear-gradient(135deg, #E53E3E, #C53030);" data-name="Rojo"></button>
                                    <button class="color-btn-micro" data-color="Green" style="background: linear-gradient(135deg, #48BB78, #38A169);" data-name="Verde"></button>
                                </div>
                                <span class="selected-micro-name" id="colorName_${prod.key}">${prod.telemetry.friendlyColor}</span>
                            </div>
                            
                            <!-- Quantity -->
                            <div class="qty-control-wrapper">
                                <span class="control-label-micro">Cantidad:</span>
                                <div class="qty-selector">
                                    <button class="qty-btn" id="minus_${prod.key}"><i class="fa-solid fa-minus"></i></button>
                                    <span class="qty-val" id="val_${prod.key}">0</span>
                                    <button class="qty-btn" id="plus_${prod.key}"><i class="fa-solid fa-plus"></i></button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            targetGrid.insertAdjacentHTML('beforeend', cardHTML);
        }
    });

    // Cargar imágenes y telemetrías personalizadas para productos hardcoded si existen en localStorage
    const originalKeys = ['jabonera', 'portarollo', 'organizador', 'contenedor', 'organizador_moderno', 'juguete_gato'];
    originalKeys.forEach(key => {
        const savedImg = localStorage.getItem(`custom_image_${key}`);
        let domSuffix = key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');
        if (key === 'organizador_moderno') domSuffix = 'OrganizadorModerno';
        if (key === 'juguete_gato') domSuffix = 'JugueteGato';
        
        let imgEl = document.getElementById(`img${domSuffix}`);
        if (imgEl) {
            if (savedImg) {
                if (isVideoData(savedImg)) {
                    const videoEl = document.createElement('video');
                    videoEl.src = savedImg;
                    videoEl.className = imgEl.className;
                    videoEl.id = imgEl.id;
                    videoEl.autoplay = true;
                    videoEl.loop = true;
                    videoEl.muted = true;
                    videoEl.playsInline = true;
                    videoEl.style.objectFit = 'cover';
                    imgEl.parentNode.replaceChild(videoEl, imgEl);
                    imgEl = videoEl;
                } else {
                    if (savedImg.startsWith('images/')) {
                        imgEl.src = savedImg + '?t=' + Date.now();
                    } else {
                        imgEl.src = savedImg;
                    }
                }
            }
            
            // Actualizar badge de categoría con el material personalizado
            const savedTelemetryRaw = localStorage.getItem(`telemetry_${key}`);
            if (savedTelemetryRaw) {
                try {
                    const savedTelemetry = JSON.parse(savedTelemetryRaw);
                    if (savedTelemetry && savedTelemetry.material) {
                        const cardEl = imgEl.closest('.product-selection-card');
                        const badgeEl = cardEl ? cardEl.querySelector('.product-category-badge') : null;
                        if (badgeEl) {
                            badgeEl.textContent = `Tecnología ${savedTelemetry.material}`;
                        }
                    }
                } catch(e) {}
            }
        }
    });

    // Inicializar Controles por Producto original de fábrica
    setupProductControls('Jabonera', 'jabonera');
    setupProductControls('Portarollo', 'portarollo');
    setupProductControls('Organizador', 'organizador');
    setupProductControls('Contenedor', 'contenedor');
    setupProductControls('OrganizadorModerno', 'organizador_moderno');
    setupProductControls('JugueteGato', 'juguete_gato');

    // Inicializar Controles para Productos Personalizados
    customProducts.forEach(prod => {
        setupProductControls(`_${prod.key}`, prod.key);
        setupPriceEditing(`price_${prod.key}`, prod.key, `_${prod.key}`);
        setupDescriptionEditing(`desc_${prod.key}`, prod.key);
    });

    function getOriginalSuffix(key) {
        const mapping = {
            jabonera: 'Jabonera',
            portarollo: 'Portarollo',
            contenedor: 'Contenedor',
            organizador: 'Organizador',
            organizador_moderno: 'OrganizadorModerno',
            juguete_gato: 'JugueteGato'
        };
        return mapping[key];
    }

    function syncOriginalProductsEditIcons() {
        const originalKeysMap = {
            jabonera: 'resetPriceJabonera',
            portarollo: 'resetPricePortarollo',
            contenedor: 'resetPriceContenedor',
            organizador: 'resetPriceOrganizador',
            organizador_moderno: 'resetPriceOrganizadorModerno',
            juguete_gato: 'resetPriceJugueteGato'
        };
        
        Object.entries(originalKeysMap).forEach(([key, resetId]) => {
            const resetBtn = document.getElementById(resetId);
            if (!resetBtn) return;
            const parentDetails = resetBtn.parentElement;
            if (!parentDetails) return;
            const h3 = parentDetails.querySelector('h3');
            if (!h3) return;
            
            // Eliminar ícono existente si existe
            const existingTrigger = h3.querySelector('.btn-edit-product-trigger');
            if (existingTrigger) existingTrigger.remove();
            
            // Si es admin, agregar el ícono del lápiz
            if (isAdmin) {
                const editIconHTML = `<i class="fa-solid fa-pen-to-square btn-edit-product-trigger" data-product-key="${key}" style="cursor: pointer; margin-left: 8px; font-size: 0.95rem; color: var(--primary); transition: var(--transition);" title="Editar telemetría y detalles del producto"></i>`;
                h3.insertAdjacentHTML('beforeend', editIconHTML);
            }
        });
    }

    // Sincronizar iconos de edición para productos originales si es administrador
    syncOriginalProductsEditIcons();
    
    // Inicializar checklist de catálogo para el administrador
    if (isAdmin) {
        renderAdminCatalogChecklist();
    }

    // Aplicar estado de visibilidad de productos deshabilitados para venta
    applyDisabledProductsVisibility();



    // Función para configurar selectores de color, unidades y activación
    function setupProductControls(domSuffix, key) {
        const checkbox = document.getElementById(`check${domSuffix}`);
        if (!checkbox) return; // Si fue eliminado de fábrica o no existe, abortar inicialización
        const controlsRow = document.getElementById(`controls${domSuffix}`);
        const colorContainer = document.querySelector(`.color-options-micro[data-target="${domSuffix}"]`);
        const colorNameText = document.getElementById(`colorName${domSuffix}`);
        const btnMinus = document.getElementById(`minus${domSuffix}`);
        const btnPlus = document.getElementById(`plus${domSuffix}`);
        const valDisplay = document.getElementById(`val${domSuffix}`);
        const cardParent = checkbox.closest('.product-selection-card');

        // Configurar estado inicial del checkbox
        checkbox.checked = products[key].active;

        function applyActiveUI(isActive) {
            if (isActive) {
                controlsRow.style.opacity = '1';
                controlsRow.style.pointerEvents = 'auto';
                cardParent.classList.remove('disabled');
            } else {
                controlsRow.style.opacity = '0.3';
                controlsRow.style.pointerEvents = 'none';
                cardParent.classList.add('disabled');
                products[key].qty = 0;
                valDisplay.textContent = 0;
            }
        }

        // Aplicar estado inicial de la tarjeta
        applyActiveUI(products[key].active);

        checkbox.addEventListener('change', () => {
            products[key].active = checkbox.checked;
            applyActiveUI(checkbox.checked);
            updateTotalOrder();
            persistDataToServer();
        });

        // Color selector
        if (colorContainer) {
            colorContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.color-btn-micro');
                if (!btn) return;

                colorContainer.querySelectorAll('.color-btn-micro').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const selectedColor = btn.getAttribute('data-color');
                const friendlyName = btn.getAttribute('data-name');

                products[key].color = selectedColor;
                products[key].friendlyColor = friendlyName;
                colorNameText.textContent = friendlyName;

                updateTotalOrder();
            });
        }

        // Cantidad de Unidades
        btnMinus.addEventListener('click', () => {
            if (products[key].active && products[key].qty > 0) {
                products[key].qty--;
                valDisplay.textContent = products[key].qty;
                updateTotalOrder();
            }
        });

        btnPlus.addEventListener('click', () => {
            if (products[key].active) {
                products[key].qty++;
                valDisplay.textContent = products[key].qty;
                updateTotalOrder();
            }
        });
    }

    // Calcular el resumen y total dinámico de la orden
    function updateTotalOrder() {
        let total = 0;
        let totalQty = 0;
        let activeItemsHtml = '';
        let whatsappProductLines = '';
        let hasActiveProducts = false;

        // Iterar productos
        for (const [key, prod] of Object.entries(products)) {
            if (prod.active && prod.qty > 0) {
                hasActiveProducts = true;
                totalQty += prod.qty;
                const displayPrice = getDisplayPrice(prod.price);
                const subtotal = customRound(displayPrice * prod.qty);
                total += subtotal;

                const formattedSubtotal = new Intl.NumberFormat('es-AR', {
                    style: 'currency',
                    currency: 'ARS',
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0
                }).format(subtotal);

                // Renderizar línea en el resumen lateral con identificador de destino para scroll interactivo
                activeItemsHtml += `
                    <div class="summary-item-line animate-pulse" data-target-product-key="${key}" style="cursor: pointer;" title="Hacer clic para ubicar este producto en la Boutique">
                        <div class="summary-item-top">
                            <span>${prod.name}</span>
                            <span>${prod.qty}x</span>
                        </div>
                        <div class="summary-item-sub">
                            <span>Color: <strong>${prod.friendlyColor}</strong></span>
                            <span style="float: right;">Subtotal: ${formattedSubtotal}</span>
                        </div>
                    </div>
                `;

                // Añadir línea para la plantilla de WhatsApp
                whatsappProductLines += `📦 *${prod.name}*\n` +
                                        `   🎨 Color: ${prod.friendlyColor}\n` +
                                        `   🔢 Cantidad: ${prod.qty} unidad(es)\n` +
                                        `   💵 Subtotal: ${formattedSubtotal}\n\n`;
            }
        }

        // Actualizar botón flotante de carrito y su contador dinámico
        if (floatingCartBtn && cartBadgeCount) {
            cartBadgeCount.textContent = totalQty;
            if (totalQty > 0) {
                floatingCartBtn.classList.add('show');
            } else {
                floatingCartBtn.classList.remove('show');
            }
        }

        // Si no hay productos activos
        if (!hasActiveProducts) {
            summaryItemsContainer.innerHTML = `
                <p style="color: var(--text-muted); font-size: 0.9rem; text-align: center; padding: 20px 0;">
                    <i class="fa-solid fa-cart-shopping" style="font-size: 1.5rem; display: block; margin-bottom: 10px;"></i>
                    No seleccionaste ningún producto. ¡Marcá la casilla en las tarjetas para incluir un objeto!
                </p>
            `;
            totalPriceDisplay.textContent = "$0 ARS";
            if (btnOrder) {
                btnOrder.classList.add('disabled');
                btnOrder.style.pointerEvents = 'none';
                btnOrder.style.opacity = '0.5';
            }
            return;
        }

        if (btnOrder) {
            btnOrder.classList.remove('disabled');
            btnOrder.style.pointerEvents = 'auto';
            btnOrder.style.opacity = '1';
        }

        summaryItemsContainer.innerHTML = activeItemsHtml;

        // Formatear precio total
        const formattedTotal = new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(total);

        totalPriceDisplay.textContent = formattedTotal;

        if (btnOrder) {
            // Configurar enlace a WhatsApp
            const messageText = `¡Hola Gravity 3D! 🚀 Me encantaría realizar el siguiente pedido premium:\n\n` +
                                whatsappProductLines +
                                `💳 *Total General:* ${formattedTotal} ARS\n\n` +
                                `Quedo atento para coordinar el método de pago y el envío. ¡Muchas gracias!`;

            const encodedMessage = encodeURIComponent(messageText);
            btnOrder.href = `https://wa.me/${WHATSAPP_PHONE}?text=${encodedMessage}`;
            btnOrder.target = '_blank';
        }
    }

    // Configurar clic en el botón flotante del carrito (smooth-scroll y animación premium)
    if (floatingCartBtn) {
        floatingCartBtn.addEventListener('click', () => {
            const pedidoSection = document.getElementById('pedido');
            if (pedidoSection) {
                // Realizar smooth scroll centrado
                pedidoSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                // Aplicar efecto de brillo/escala premium de forma dinámica
                const summaryCard = pedidoSection.querySelector('.price-summary-card');
                if (summaryCard) {
                    summaryCard.classList.remove('pulse-highlight');
                    void summaryCard.offsetWidth; // Forzar reflow para reiniciar la animación
                    summaryCard.classList.add('pulse-highlight');
                    
                    // Quitar la clase tras finalizar la animación (1.2s)
                    setTimeout(() => {
                        summaryCard.classList.remove('pulse-highlight');
                    }, 1200);
                }
            }
        });
    }

    // Configurar el ícono de llave secreta en el pie de página
    const adminKeyIcon = document.getElementById('adminKeyIcon');
    if (adminKeyIcon) {
        adminKeyIcon.style.opacity = isAdmin ? '0.8' : '0.2';
        adminKeyIcon.style.color = isAdmin ? 'var(--primary)' : 'inherit';
        
        adminKeyIcon.addEventListener('click', () => {
            if (isAdmin) {
                sessionStorage.setItem('isAdmin', 'false');
                alert("🔒 Modo Administrador DESACTIVADO. La carga de imágenes está bloqueada para visitantes.");
                location.reload();
            } else {
                const password = prompt("🔐 Ingrese la clave de administrador para editar imágenes:");
                if (password && password.trim().toLowerCase() === "gravity3d") {
                    sessionStorage.setItem('isAdmin', 'true');
                    alert("🔓 ¡Modo Administrador ACTIVADO! Ahora podés cambiar las fotos/GIFs del catálogo haciendo clic sobre ellas.");
                    location.reload();
                } else if (password !== null) {
                    alert("❌ Clave incorrecta.");
                }
            }
        });
    }

    // Configurar botón de restablecimiento de emergencia en el pie de página
    const emergencyResetBtn = document.getElementById('emergencyResetBtn');
    if (emergencyResetBtn) {
        emergencyResetBtn.addEventListener('click', () => {
            const confirmReset = confirm("⚠ ¿Desea restablecer por completo la base de datos de la Boutique? Esto borrará el stock y los productos personalizados guardados, resolviendo cualquier bloqueo técnico.");
            if (confirmReset) {
                localStorage.clear();
                alert("✨ ¡Datos de almacenamiento web limpiados con éxito! Recargando la aplicación.");
                location.reload();
            }
        });
    }

    // Helper to map product keys to their HTML price element IDs
    function getPriceElementId(key) {
        const mapping = {
            jabonera: 'priceJabonera',
            portarollo: 'pricePortarollo',
            organizador: 'priceOrganizador',
            contenedor: 'priceContenedor',
            organizador_moderno: 'priceOrganizadorModerno',
            juguete_gato: 'priceJugueteGato'
        };
        return mapping[key] || `price_${key}`;
    }

    // Function to synchronize all price displays in the DOM based on wholesale or retail mode
    function updateAllPricesInDOM() {
        for (const [key, prod] of Object.entries(products)) {
            const priceId = getPriceElementId(key);
            const el = document.getElementById(priceId);
            if (el) {
                const displayPrice = getDisplayPrice(prod.price);
                el.textContent = `$${new Intl.NumberFormat('es-AR').format(displayPrice)} ARS`;
            }
        }
        updateTotalOrder(); // Update active order subtotals and totals
    }

    // Setup listener for the discreet wholesale code input box in the navbar
    const mayoristaCodeInput = document.getElementById('mayoristaCodeInput');
    if (mayoristaCodeInput) {
        // Show masked indicators if already active
        if (wholesaleCodeEntered) {
            mayoristaCodeInput.value = '••••••••';
        }

        mayoristaCodeInput.addEventListener('input', () => {
            const val = mayoristaCodeInput.value.trim().toLowerCase();
            if (val === 'gravity3d' || val === 'mayorista' || val === 'mayorista3d') {
                wholesaleCodeEntered = true;
                sessionStorage.setItem('wholesaleCodeEntered', 'true');
                mayoristaCodeInput.value = '••••••••'; // mask the code
                mayoristaCodeInput.blur();
                updateAllPricesInDOM();
                alert("🔓 Modo Mayorista Activado: Mostrando valores actuales de fábrica.");
            }
        });

        mayoristaCodeInput.addEventListener('focus', () => {
            // When clicked/focused, reset to retail mode so the user can re-enter or clear the code
            if (wholesaleCodeEntered) {
                mayoristaCodeInput.value = '';
                wholesaleCodeEntered = false;
                sessionStorage.setItem('wholesaleCodeEntered', 'false');
                updateAllPricesInDOM();
            }
        });
    }

    // Configuración del Modo Administrador y personalización comercial (Los cambios se realizan a nivel de nombres/rutas estáticas o precios)

    // Configurar edición de precios en Modo Administrador
    setupPriceEditing('priceJabonera', 'jabonera', 'Jabonera');
    setupPriceEditing('pricePortarollo', 'portarollo', 'Portarollo');
    setupPriceEditing('priceOrganizador', 'organizador', 'Organizador');
    setupPriceEditing('priceContenedor', 'contenedor', 'Contenedor');
    setupPriceEditing('priceOrganizadorModerno', 'organizador_moderno', 'OrganizadorModerno');
    setupPriceEditing('priceJugueteGato', 'juguete_gato', 'JugueteGato');

    function setupPriceEditing(priceId, key, domSuffix) {
        const priceElement = document.getElementById(priceId);
        if (!priceElement) return;

        const resetBtn = document.getElementById(`resetPrice${domSuffix}`);

        if (isAdmin) {
            priceElement.contentEditable = "true";
            priceElement.classList.add('admin-editable');
            priceElement.title = "Hacé clic para cambiar el precio de venta";

            // Mostrar el botón de reset individual
            if (resetBtn) {
                resetBtn.style.display = 'inline-block';
                resetBtn.addEventListener('click', () => {
                    const confirmReset = confirm(`↺ ¿Desea restablecer el precio de este producto a su valor original de fábrica ($${new Intl.NumberFormat('es-AR').format(defaultPrices[key])} ARS)?`);
                    if (confirmReset) {
                        localStorage.removeItem(`price_${key}`);
                        products[key].price = defaultPrices[key];
                        
                        priceElement.textContent = new Intl.NumberFormat('es-AR', {
                            style: 'currency',
                            currency: 'ARS',
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0
                        }).format(getDisplayPrice(products[key].price));

                        updateTotalOrder();
                        persistDataToServer();
                        renderAdminCatalogChecklist();
                        alert("✨ ¡Precio restablecido con éxito!");
                    }
                });
            }

            priceElement.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    priceElement.blur();
                }
            });

            priceElement.addEventListener('blur', () => {
                const rawText = priceElement.textContent;
                // Eliminar símbolos de moneda, letras y espacios
                let cleanText = rawText.replace(/[$\sARS]/gi, '').replace(/[^0-9.,]/g, '');
                
                // Normalizar comas a puntos si se usan como decimales, o tratarlas de forma inteligente
                if (cleanText.includes('.') && cleanText.includes(',')) {
                    // Si posee ambos (ej. 9.295,00 o 9,295.00), el del final es el decimal
                    const dotIndex = cleanText.indexOf('.');
                    const commaIndex = cleanText.indexOf(',');
                    if (dotIndex < commaIndex) {
                        // Punto es miles, coma es decimal (formato latino 9.295,00)
                        cleanText = cleanText.replace(/\./g, '').replace(/,/g, '.');
                    } else {
                        // Coma es miles, punto es decimal (formato anglosajón 9,295.00)
                        cleanText = cleanText.replace(/,/g, '').replace(/\./g, '.');
                    }
                } else if (cleanText.includes(',')) {
                    // Si posee solo coma, verificamos si es de miles (ej: 9,295) o decimal (ej: 9,5)
                    const parts = cleanText.split(',');
                    if (parts.length === 2 && parts[1].length === 3) {
                        // Separador de miles
                        cleanText = cleanText.replace(/,/g, '');
                    } else {
                        // Separador decimal
                        cleanText = cleanText.replace(/,/g, '.');
                    }
                } else if (cleanText.includes('.')) {
                    // Si posee solo punto, analizamos si es de miles (ej: 9.295) o decimal (ej: 9.5)
                    const parts = cleanText.split('.');
                    if (parts.length === 2 && parts[1].length === 3) {
                        // Separador de miles
                        cleanText = cleanText.replace(/\./g, '');
                    }
                }

                const enteredPrice = parseFloat(cleanText);
                if (!isNaN(enteredPrice) && enteredPrice >= 0) {
                    const newBasePrice = wholesaleCodeEntered ? customRound(enteredPrice) : customRound(enteredPrice / 1.40);
                    products[key].price = newBasePrice;
                    localStorage.setItem(`price_${key}`, newBasePrice);
                    updateTotalOrder();
                    persistDataToServer();
                    renderAdminCatalogChecklist();
                }
                
                priceElement.textContent = new Intl.NumberFormat('es-AR', {
                    style: 'currency',
                    currency: 'ARS',
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0
                }).format(getDisplayPrice(products[key].price));
            });
        } else {
            if (resetBtn) {
                resetBtn.style.display = 'none';
            }
        }
    }

    setupDescriptionEditing('descJabonera', 'jabonera');
    setupDescriptionEditing('descPortarollo', 'portarollo');
    setupDescriptionEditing('descOrganizador', 'organizador');
    setupDescriptionEditing('descContenedor', 'contenedor');
    setupDescriptionEditing('descOrganizadorModerno', 'organizador_moderno');
    setupDescriptionEditing('descJugueteGato', 'juguete_gato');

    function setupDescriptionEditing(descId, key) {
        const descElement = document.getElementById(descId);
        if (!descElement) return;

        // Cargar descripción personalizada previamente guardada en localStorage
        const savedDesc = localStorage.getItem(`desc_${key}`);
        if (savedDesc) {
            descElement.textContent = savedDesc;
        }

        if (isAdmin) {
            descElement.contentEditable = "true";
            descElement.classList.add('admin-editable-desc');
            descElement.title = "Hacé clic para editar la descripción y agregar medidas";

            descElement.addEventListener('blur', () => {
                const text = descElement.textContent.trim();
                if (text) {
                    localStorage.setItem(`desc_${key}`, text);
                    persistDataToServer();
                } else {
                    localStorage.removeItem(`desc_${key}`);
                    persistDataToServer(true); // Síncrono antes del reload
                    location.reload();
                }
            });
        }
    }

    // Función de redondeo personalizado comercial (Gravity 3D)
    function customRound(val) {
        let num = Math.floor(val);
        let lastDigit = num % 10;
        if (lastDigit >= 1 && lastDigit <= 4) {
            num = Math.floor(num / 10) * 10 + 5;
        } else if (lastDigit >= 6 && lastDigit <= 9) {
            num = Math.floor(num / 10) * 10 + 10;
        }
        return num;
    }

    /* ==========================================================================
       AMBIENT GLOW CUSTOMIZER & INTERACTIVE FILAMENT GUIDE
       ========================================================================== */

    // 1. Selector de Temas de Brillo (Ambient Glow Customizer)
    const themeBtns = document.querySelectorAll('.theme-btn');
    
    function applyTheme(themeName) {
        // Remover otras clases de tema
        document.body.classList.remove('theme-fuego', 'theme-cyan', 'theme-galaxy');
        // Añadir el nuevo tema
        document.body.classList.add(`theme-${themeName}`);
        
        // Actualizar botones de la interfaz
        themeBtns.forEach(btn => {
            if (btn.getAttribute('data-theme') === themeName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        // Guardar en localStorage
        localStorage.setItem('gravity_theme', themeName);
    }
    
    // Configurar escuchadores para los botones
    themeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const selectedTheme = btn.getAttribute('data-theme');
            applyTheme(selectedTheme);
        });
    });
    
    // Cargar tema guardado o por defecto (fuego)
    const savedTheme = localStorage.getItem('gravity_theme') || 'fuego';
    applyTheme(savedTheme);

    // 2. Guía Interactiva de Insumos 3D
    const materialTabs = document.querySelectorAll('.material-tab-btn');
    const matTitle = document.getElementById('matTitle');
    const matDesc = document.getElementById('matDesc');
    const matBadge1 = document.getElementById('matBadge1');
    const matBadge2 = document.getElementById('matBadge2');
    
    const fillToughness = document.getElementById('fillToughness');
    const valToughness = document.getElementById('valToughness');
    
    const fillFlexibility = document.getElementById('fillFlexibility');
    const valFlexibility = document.getElementById('valFlexibility');
    
    const fillThermal = document.getElementById('fillThermal');
    const valThermal = document.getElementById('valThermal');
    
    const materialData = {
        petg: {
            title: "PETG de Grado Técnico",
            desc: "Es el material premium estrella de nuestro taller. Combina la facilidad de extrusión del PLA con la altísima durabilidad y resistencia al impacto mecánica del ABS. Es químicamente inerte, apto para contacto alimentario y resistente al agua y humedad extrema, haciéndolo perfecto para accesorios de baño, organizadores y piezas de uso diario.",
            badges: [
                '<i class="fa-solid fa-water-slash"></i> Impermeable',
                '<i class="fa-solid fa-dumbbell"></i> Alta Tenacidad'
            ],
            metrics: {
                toughness: { val: 85, text: "85%" },
                flexibility: { val: 40, text: "40%" },
                thermal: { val: 80, text: "80°C (80%)" }
            }
        },
        pla: {
            title: "PLA Decorativo Premium",
            desc: "Ideal para modelos estéticos detallados y prototipado rápido de alta precisión. Destaca por su acabado superficial brillante ultra pulido y facilidad extrema de impresión. Sin embargo, posee baja resistencia mecánica al impacto y baja tolerancia térmica (se deforma a más de 55°C), por lo que se recomienda estrictamente para uso decorativo en interiores.",
            badges: [
                '<i class="fa-solid fa-seedling"></i> Eco-Amigable',
                '<i class="fa-solid fa-wand-magic-sparkles"></i> Detalle Extremo'
            ],
            metrics: {
                toughness: { val: 65, text: "65%" },
                flexibility: { val: 15, text: "15%" },
                thermal: { val: 55, text: "55°C (55%)" }
            }
        },
        abs: {
            title: "ABS de Grado Industrial",
            desc: "El polímero de ingeniería por excelencia. Ofrece una altísima resistencia al impacto térmico, abrasión mecánica y cargas pesadas de trabajo. Es ideal para post-procesado con vapor de acetona para lograr acabados brillantes e impermeables, pero requiere cámara de impresión cerrada para evitar alabeo (warping) por su alta contracción térmica.",
            badges: [
                '<i class="fa-solid fa-fire-flame-curved"></i> Alta Temperatura',
                '<i class="fa-solid fa-shield-halved"></i> Resistente a Impacto'
            ],
            metrics: {
                toughness: { val: 90, text: "90%" },
                flexibility: { val: 30, text: "30%" },
                thermal: { val: 100, text: "100°C (100%)" }
            }
        }
    };
    
    function switchMaterial(materialKey) {
        const data = materialData[materialKey];
        if (!data) return;
        
        // Efecto de desvanecimiento (fade-out)
        const contentContainer = document.querySelector('.material-content');
        if (contentContainer) {
            contentContainer.classList.add('fade-out');
            
            setTimeout(() => {
                // Actualizar textos e insignias
                matTitle.textContent = data.title;
                matDesc.textContent = data.desc;
                
                // Actualizar insignias/badges
                matBadge1.innerHTML = data.badges[0];
                matBadge2.innerHTML = data.badges[1];
                
                // Quitar clase fade-out para restaurar opacidad (fade-in)
                contentContainer.classList.remove('fade-out');
            }, 250);
        }
        
        // Actualizar barras de progreso y porcentajes con animación fluida
        setTimeout(() => {
            fillToughness.style.width = `${data.metrics.toughness.val}%`;
            valToughness.textContent = data.metrics.toughness.text;
            
            fillFlexibility.style.width = `${data.metrics.flexibility.val}%`;
            valFlexibility.textContent = data.metrics.flexibility.text;
            
            fillThermal.style.width = `${data.metrics.thermal.val}%`;
            valThermal.textContent = data.metrics.thermal.text;
        }, 50);
    }
    
    // ==========================================================================
    // SLICER TELEMETRY & PRODUCT CREATOR CORE SYSTEM
    // ==========================================================================

    // 1. Mostrar Panel de Creación si es Administrador
    const adminCreatorPanel = document.getElementById('adminCreatorPanel');
    if (adminCreatorPanel) {
        adminCreatorPanel.style.display = isAdmin ? 'block' : 'none';
    }

    // 2. Base de Datos de Telemetría para Productos de Fábrica (Hardcoded)
    const hardcodedTelemetry = {
        jabonera: {
            name: "Jabonera de Panal Minimalista",
            desc: "Sistema de dos piezas encastrables con drenaje en panal de abejas. Evita que el jabón se ablande y decora tu tocador.",
            categoryBadge: "Bicolor Premium",
            slicerPhoto: "images/jabonera.png",
            weight: 32.50,
            hours: 1,
            minutes: 45,
            material: "PETG",
            defaultColor: "Beige",
            friendlyColor: "Beige Soft"
        },
        portarollo: {
            name: "Smart Toilet Roll Holder",
            desc: "Porta rollo con bandeja superior integrada y antideslizante para smartphone. Comodidad y firmeza técnica en tu baño.",
            categoryBadge: "Ergonomía Diaria",
            slicerPhoto: "images/porta rollo papel higienico.gif",
            weight: 65.20,
            hours: 3,
            minutes: 15,
            material: "PETG",
            defaultColor: "Space Grey",
            friendlyColor: "Space Grey"
        },
        organizador: {
            name: "Organizador Compartimentado",
            desc: "Bandeja organizadora de alta resistencia con diseño de rejilla calada y asa frontal integrada. Perfecta para ordenar cajones, estantes y escritorios.",
            categoryBadge: "Oficina Técnica",
            slicerPhoto: "images/organizador.png",
            weight: 110.00,
            hours: 5,
            minutes: 40,
            material: "PETG",
            defaultColor: "Blue",
            friendlyColor: "Azul Corporativo"
        },
        contenedor: {
            name: "Contenedor Roscado 50mm",
            desc: "Contenedor cilíndrico estanco de 50mm con tapa roscada hermética. Ideal para viajes, organización de pequeños objetos y almacenamiento seguro.",
            categoryBadge: "Organización Práctica",
            slicerPhoto: "images/contenedor_roscado_sin_fondo.png",
            weight: 18.50,
            hours: 1,
            minutes: 10,
            material: "PETG",
            defaultColor: "Red",
            friendlyColor: "Rojo Fuego"
        },
        organizador_moderno: {
            name: "Organizador de Escritorio Moderno",
            desc: "Organizador premium minimalista en dos piezas encastrables. Espacio dedicado para smartphone, bolígrafos, notas y clips con acabado ultra suave.",
            categoryBadge: "Diseño Nórdico",
            slicerPhoto: "images/organizador moderno de escritorio.webp",
            weight: 112.00,
            hours: 5,
            minutes: 50,
            material: "PETG",
            defaultColor: "Space Grey",
            friendlyColor: "Space Grey"
        },
        juguete_gato: {
            name: "Juguete Esfera Geodésica \"Geo-Ball\"",
            desc: "Juguete modular interactivo en forma de esfera geodésica. Incluye cascabel interior y estructura ultra-resistente ideal para el juego activo de felinos.",
            categoryBadge: "Mascotas & Recreación",
            slicerPhoto: "images/juguete_gato_slicer.png",
            weight: 38.83,
            hours: 2,
            minutes: 2,
            material: "PETG",
            defaultColor: "Brown",
            friendlyColor: "Marrón Orgánico"
        }
    };

    // 3. Botones de telemetría deshabilitados a petición del cliente

    // 4. Lógica de la Calculadora de Telemetría en Vivo (Panel de Creador)
    const newProdWeight = document.getElementById('newProdWeight');
    const newProdMaterial = document.getElementById('newProdMaterial');
    const newProdHours = document.getElementById('newProdHours');
    const newProdMinutes = document.getElementById('newProdMinutes');
    const newProdMargin = document.getElementById('newProdMargin');
    
    const calcFilamentCost = document.getElementById('calcFilamentCost');
    const calcEnergyCost = document.getElementById('calcEnergyCost');
    const calcAmortCost = document.getElementById('calcAmortCost');
    const calcNetCost = document.getElementById('calcNetCost');
    const calcPriceSuggested = document.getElementById('calcPriceSuggested');

    function updateLiveTelemetry() {
        if (!newProdWeight || !newProdMaterial || !newProdHours || !newProdMinutes || !newProdMargin) return;
        
        const weight = parseFloat(newProdWeight.value) || 0;
        const material = newProdMaterial.value;
        const hours = parseFloat(newProdHours.value) || 0;
        const minutes = parseFloat(newProdMinutes.value) || 0;
        const margin = parseFloat(newProdMargin.value) || 1.65;
        // Cargar tarifas del inventario local de forma segura
        let localInv = getSafeInventory();
        const rates = localInv.constants;
        
        const pricePerGram = rates.precios_por_gramo[material] || 32.0;
        const printTimeHours = hours + (minutes / 60);
        
        // Ecuaciones físicas de costo
        const rawFilamentCost = weight * pricePerGram * (1 + rates.margen_purga);
        const rawEnergyCost = printTimeHours * rates.consumo_p1s_kw_h * rates.energia_kwh_ars;
        const rawAmortCost = printTimeHours * rates.amortizacion_h_ars;
        const netCost = rawFilamentCost + rawEnergyCost + rawAmortCost;
        const suggestedPrice = customRound(netCost * margin);
        
        // Formatear
        const formatARS = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(val);
        const formatARSNoDec = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
        
        if (calcFilamentCost) calcFilamentCost.textContent = formatARS(rawFilamentCost);
        if (calcEnergyCost) calcEnergyCost.textContent = formatARS(rawEnergyCost);
        if (calcAmortCost) calcAmortCost.textContent = formatARS(rawAmortCost);
        if (calcNetCost) calcNetCost.textContent = formatARS(netCost);
        
        const manualInput = document.getElementById('newProdPriceManual');
        const manualPrice = manualInput ? parseFloat(manualInput.value) : NaN;
        if (calcPriceSuggested) {
            if (!isNaN(manualPrice) && manualPrice > 0) {
                calcPriceSuggested.textContent = formatARSNoDec(manualPrice) + " (Manual)";
            } else {
                calcPriceSuggested.textContent = formatARSNoDec(suggestedPrice);
            }
        }
        
        return {
            filamentCost: rawFilamentCost,
            energyCost: rawEnergyCost,
            amortCost: rawAmortCost,
            netCost: netCost,
            suggestedPrice: !isNaN(manualPrice) && manualPrice > 0 ? manualPrice : suggestedPrice
        };
    }

    // Lógica dinámica del precio por gramo de filamento (Base)
    const materialPriceInput = document.getElementById('materialPriceInput');
    
    function syncMaterialPriceFromSelect() {
        if (!newProdMaterial || !materialPriceInput) return;
        const material = newProdMaterial.value;
        
        let localInv = getSafeInventory();
        const prices = localInv.constants.precios_por_gramo;
        materialPriceInput.value = prices[material] || 32.0;
    }
    
    function recalculateAllProductsPrices(material, newPrice) {
        let localInv = getSafeInventory();
        const rates = localInv.constants;
        const originalKeys = ['jabonera', 'portarollo', 'organizador', 'contenedor', 'organizador_moderno', 'juguete_gato'];
        
        const getFactoryDomId = (key) => {
            if (key === 'organizador_moderno') return 'priceOrganizadorModerno';
            if (key === 'juguete_gato') return 'priceJugueteGato';
            return 'price' + key.charAt(0).toUpperCase() + key.slice(1);
        };
        
        // 1. Recalcular productos de fábrica
        originalKeys.forEach(key => {
            const hardcoded = hardcodedTelemetry[key];
            if (hardcoded) {
                const savedTelemetryRaw = localStorage.getItem(`telemetry_${key}`);
                const savedTelemetry = savedTelemetryRaw ? JSON.parse(savedTelemetryRaw) : null;
                const mat = savedTelemetry ? savedTelemetry.material : hardcoded.material;
                
                if (mat === material) {
                    const weight = savedTelemetry ? savedTelemetry.weight : hardcoded.weight;
                    const hours = savedTelemetry ? savedTelemetry.hours : hardcoded.hours;
                    const minutes = savedTelemetry ? savedTelemetry.minutes : hardcoded.minutes;
                    const margin = savedTelemetry ? savedTelemetry.margin : 1.65;
                    const printTimeHours = hours + (minutes / 60);
                    
                    const rawFilamentCost = weight * newPrice * (1 + rates.margen_purga);
                    const rawEnergyCost = printTimeHours * rates.consumo_p1s_kw_h * rates.energia_kwh_ars;
                    const rawAmortCost = printTimeHours * rates.amortizacion_h_ars;
                    const netCost = rawFilamentCost + rawEnergyCost + rawAmortCost;
                    const suggestedPrice = customRound(netCost * margin);
                    
                    localStorage.setItem(`price_${key}`, suggestedPrice);
                    if (products[key]) {
                        products[key].price = suggestedPrice;
                    }
                    
                    const domId = getFactoryDomId(key);
                    const priceEl = document.getElementById(domId);
                    if (priceEl) {
                        priceEl.textContent = `$${new Intl.NumberFormat('es-AR').format(getDisplayPrice(suggestedPrice))} ARS`;
                    }
                }
            }
        });
        
        // 2. Recalcular productos personalizados
        let customProds = getSafeCustomProducts();
        let modified = false;
        
        customProds = customProds.map(prod => {
            if (prod.telemetry && prod.telemetry.material === material) {
                const weight = prod.telemetry.weight;
                const hours = prod.telemetry.hours;
                const minutes = prod.telemetry.minutes;
                const margin = prod.telemetry.margin || 1.65;
                const printTimeHours = hours + (minutes / 60);
                
                const rawFilamentCost = weight * newPrice * (1 + rates.margen_purga);
                const rawEnergyCost = printTimeHours * rates.consumo_p1s_kw_h * rates.energia_kwh_ars;
                const rawAmortCost = printTimeHours * rates.amortizacion_h_ars;
                const netCost = rawFilamentCost + rawEnergyCost + rawAmortCost;
                const suggestedPrice = customRound(netCost * margin);
                
                prod.price = suggestedPrice;
                prod.telemetry.filamentCost = rawFilamentCost;
                prod.telemetry.netCost = netCost;
                
                localStorage.setItem(`price_${prod.key}`, suggestedPrice);
                if (products[prod.key]) {
                    products[prod.key].price = suggestedPrice;
                }
                
                const priceEl = document.getElementById(`price_${prod.key}`);
                if (priceEl) {
                    priceEl.textContent = `$${new Intl.NumberFormat('es-AR').format(getDisplayPrice(suggestedPrice))} ARS`;
                }
                modified = true;
            }
            return prod;
        });
        
        if (modified) {
            localStorage.setItem('custom_products', JSON.stringify(customProds));
        }
        
        updateTotalOrder();
        renderAdminCatalogChecklist();
    }

    function saveMaterialPriceToLocal() {
        if (!newProdMaterial || !materialPriceInput) return;
        const material = newProdMaterial.value;
        const newPrice = parseFloat(materialPriceInput.value);
        if (isNaN(newPrice) || newPrice <= 0) return;
        
        let localInv = getSafeInventory();
        if (localInv && localInv.constants && localInv.constants.precios_por_gramo) {
            localInv.constants.precios_por_gramo[material] = newPrice;
            localStorage.setItem('gravity_inventory', JSON.stringify(localInv));
            
            // Recalcular precios de todos los productos del catálogo que usan este filamento
            recalculateAllProductsPrices(material, newPrice);
            
            persistDataToServer();
        }
    }
    
    // Inicializar valor al cargar la página
    syncMaterialPriceFromSelect();

    if (newProdWeight) {
        ['input', 'change'].forEach(evt => {
            newProdWeight.addEventListener(evt, updateLiveTelemetry);
            newProdHours.addEventListener(evt, updateLiveTelemetry);
            newProdMinutes.addEventListener(evt, updateLiveTelemetry);
            newProdMargin.addEventListener(evt, updateLiveTelemetry);
        });
        
        const newProdPriceManual = document.getElementById('newProdPriceManual');
        if (newProdPriceManual) {
            ['input', 'change'].forEach(evt => {
                newProdPriceManual.addEventListener(evt, updateLiveTelemetry);
            });
        }
        
        if (newProdMaterial) {
            newProdMaterial.addEventListener('change', () => {
                syncMaterialPriceFromSelect();
                updateLiveTelemetry();
            });
        }
        
        if (materialPriceInput) {
            ['input', 'change'].forEach(evt => {
                materialPriceInput.addEventListener(evt, () => {
                    saveMaterialPriceToLocal();
                    updateLiveTelemetry();
                });
            });
        }
    }

    // Mostrar/ocultar input de nueva colección
    const newProdCollectionEl = document.getElementById('newProdCollection');
    const newCollectionNameGroup = document.getElementById('newCollectionNameGroup');
    if (newProdCollectionEl && newCollectionNameGroup) {
        newProdCollectionEl.addEventListener('change', () => {
            if (newProdCollectionEl.value === 'nueva-coleccion') {
                newCollectionNameGroup.style.display = 'block';
                const newCollectionName = document.getElementById('newCollectionName');
                if (newCollectionName) newCollectionName.focus();
            } else {
                newCollectionNameGroup.style.display = 'none';
            }
        });
    }

    // --- SISTEMA DE CONTROL Y CHECKLIST DE CARGA DE GÓNDOLA ---
    function renderAdminCatalogChecklist() {
        const tbody = document.getElementById('adminCatalogChecklistBody');
        const countSpan = document.getElementById('adminCatalogCount');
        if (!tbody) return;
        
        const customProds = getSafeCustomProducts();
        
        const deletedRaw = localStorage.getItem('deleted_factory_products');
        let deletedList = [];
        if (deletedRaw) {
            try {
                deletedList = JSON.parse(deletedRaw);
            } catch(e) {
                console.error(e);
            }
        }
        
        const disabledRaw = localStorage.getItem('disabled_products');
        let disabledList = [];
        if (disabledRaw) {
            try {
                disabledList = JSON.parse(disabledRaw);
            } catch(e) {
                console.error(e);
            }
        }
        
        const allFactoryProds = [
            { key: 'jabonera', name: products.jabonera?.name || "Jabonera de Panal Minimalista", collection: 'Tocador & Baño', material: getFactoryMaterial('jabonera', 'PETG'), price: products.jabonera?.price || 4550, photo: 'images/jabonera.png' },
            { key: 'portarollo', name: products.portarollo?.name || "Smart Toilet Roll Holder", collection: 'Tocador & Baño', material: getFactoryMaterial('portarollo', 'PETG'), price: products.portarollo?.price || 7765, photo: 'images/porta rollo papel higienico.gif' },
            { key: 'organizador', name: products.organizador?.name || "Organizador Compartimentado", collection: 'Oficina & Escritorio', material: getFactoryMaterial('organizador', 'PETG'), price: products.organizador?.price || 13125, photo: 'images/organizador.png' },
            { key: 'contenedor', name: products.contenedor?.name || "Contenedor Roscado 50mm", collection: 'Oficina & Escritorio', material: getFactoryMaterial('contenedor', 'PETG'), price: products.contenedor?.price || 2055, photo: 'images/contenedor_roscado_sin_fondo.png' },
            { key: 'organizador_moderno', name: products.organizador_moderno?.name || "Organizador de Escritorio Moderno", collection: 'Oficina & Escritorio', material: getFactoryMaterial('organizador_moderno', 'PETG'), price: products.organizador_moderno?.price || 13320, photo: 'images/organizador moderno de escritorio.webp' },
            { key: 'juguete_gato', name: products.juguete_gato?.name || "Juguete Esfera Geodésica \"Geo-Ball\"", collection: 'Mascotas & Recreación', material: getFactoryMaterial('juguete_gato', 'PETG'), price: products.juguete_gato?.price || 2875, photo: 'images/juguete_gato_slicer.png' }
        ];

        const factoryProds = allFactoryProds.filter(p => !deletedList.includes(p.key));
        
        const customMapped = customProds.map(p => ({
            key: p.key,
            name: p.name,
            collection: p.collectionName || p.collectionId.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
            material: p.telemetry ? p.telemetry.material : 'PETG',
            price: products[p.key]?.price || p.price,
            photo: p.photo,
            isCustom: true
        }));
        
        const allProds = [...factoryProds, ...customMapped];
        
        if (countSpan) {
            countSpan.textContent = `${allProds.length} Productos`;
        }
        
        if (allProds.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: var(--text-muted);">No hay productos en el catálogo.</td></tr>`;
            return;
        }
        
        let rowsHtml = '';
        allProds.forEach(prod => {
            const formattedPrice = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(prod.price);
            const isCommercial = !disabledList.includes(prod.key);
            
            rowsHtml += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.04); transition: var(--transition);" class="admin-table-row">
                    <td style="padding: 8px 8px;">
                        ${renderProductMedia(prod.photo, prod.name, '', 'width: 38px; height: 38px; border-radius: 6px; object-fit: cover; border: 1px solid var(--glass-border);')}
                    </td>
                    <td style="padding: 8px 8px; color: white; font-weight: 500;">${prod.name}</td>
                    <td style="padding: 8px 8px;">${prod.collection}</td>
                    <td style="padding: 8px 8px;"><span class="badge" style="background: rgba(255,255,255,0.05); color: var(--primary); font-size: 0.7rem; margin: 0; padding: 4px 8px;">${prod.material}</span></td>
                    <td style="padding: 8px 8px; text-align: right; color: white; font-weight: bold;">${formattedPrice}</td>
                    <td style="padding: 8px 8px; text-align: center;">
                        <label class="toggle-container" style="justify-content: center; gap: 0; display: inline-flex; min-height: auto; cursor: pointer;">
                            <input type="checkbox" class="btn-toggle-commercial-trigger" data-product-key="${prod.key}" ${isCommercial ? 'checked' : ''}>
                            <span class="toggle-slider" style="transform: scale(0.8); cursor: pointer; display: block;"></span>
                        </label>
                    </td>
                    <td style="padding: 8px 8px; text-align: center;">
                        <div style="display: flex; gap: 8px; justify-content: center;">
                            <button type="button" class="btn-edit-product-trigger" data-product-key="${prod.key}" style="background: none; border: none; color: var(--primary); cursor: pointer; padding: 4px;" title="Editar producto">
                                <i class="fa-solid fa-pen-to-square"></i>
                            </button>
                            <button type="button" class="btn-delete-product-trigger" data-product-key="${prod.key}" style="background: none; border: none; color: #E53E3E; cursor: pointer; padding: 4px;" title="Eliminar del catálogo permanentemente">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });
        
        tbody.innerHTML = rowsHtml;
    }

    // Escuchador de eliminación delegada de productos personalizados
    document.body.addEventListener('click', (e) => {
        const trigger = e.target.closest('.btn-delete-product-trigger');
        if (!trigger) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        if (!isAdmin) return;
        
        const productKey = trigger.getAttribute('data-product-key');
        if (!productKey) return;
        
        const customProds = getSafeCustomProducts();
        let product = customProds.find(p => p.key === productKey);
        const isFactory = !product;
        
        if (isFactory) {
            const allFactoryProds = [
                { key: 'jabonera', name: "Jabonera de Panal Minimalista" },
                { key: 'portarollo', name: "Smart Toilet Roll Holder" },
                { key: 'organizador', name: "Organizador Compartimentado" },
                { key: 'contenedor', name: "Contenedor Roscado 50mm" },
                { key: 'organizador_moderno', name: "Organizador de Escritorio Moderno" },
                { key: 'juguete_gato', name: "Juguete Esfera Geodésica \"Geo-Ball\"" }
            ];
            product = allFactoryProds.find(p => p.key === productKey);
        }
        
        if (!product) return;
        
        const confirmDelete = confirm(`⚠️ ¿Desea eliminar permanentemente el producto "${product.name}" de su Boutique y de todos los registros en disco? Esta acción no se puede deshacer.`);
        if (confirmDelete) {
            if (isFactory) {
                // Registrar en la lista de eliminados de fábrica
                const deletedRaw = localStorage.getItem('deleted_factory_products');
                let deletedList = deletedRaw ? JSON.parse(deletedRaw) : [];
                if (!deletedList.includes(productKey)) {
                    deletedList.push(productKey);
                    localStorage.setItem('deleted_factory_products', JSON.stringify(deletedList));
                }
                
                // Quitar de las estructuras en caliente
                delete products[productKey];
                delete defaultPrices[productKey];
                
                // Persistir al disco local de forma síncrona
                persistDataToServer(true);
                
                // Aplicar el ocultamiento en el DOM
                applyDeletedFactoryProducts();
            } else {
                const updatedProds = customProds.filter(p => p.key !== productKey);
                localStorage.setItem('custom_products', JSON.stringify(updatedProds));
                
                delete products[productKey];
                delete defaultPrices[productKey];
                
                // Persistir al disco local de forma síncrona
                persistDataToServer(true);
                
                const card = document.querySelector(`[data-custom-key="${productKey}"]`);
                if (card) {
                    const grid = card.parentElement;
                    card.remove();
                    
                    if (grid && grid.children.length === 0) {
                        const collectionId = grid.id.replace('grid-', '');
                        const header = document.getElementById(collectionId);
                        if (header) header.remove();
                        grid.remove();
                        
                        const navMenu = document.querySelector('.nav-menu');
                        const navLink = navMenu ? navMenu.querySelector(`a[href="#${collectionId}"]`) : null;
                        if (navLink) navLink.remove();
                    }
                }
            }
            
            updateTotalOrder();
            renderAdminCatalogChecklist();
            applyDisabledProductsVisibility();
            
            showToastNotification(`🗑️ Producto "${product.name}" eliminado correctamente.`);
            
            if (editingProductKey === productKey) {
                exitProductEditMode();
            }
        }
    });

    // --- SOPORTE PARA HABILITAR/DESHABILITAR COMERCIALIZACIÓN DE PRODUCTOS ---
    
    // Obtener la tarjeta del DOM de un producto por su clave (de fábrica o personalizada)
    function getProductCard(key) {
        let checkbox = document.getElementById(`check_${key}`);
        if (checkbox) return checkbox.closest('.product-selection-card');
        
        let domSuffix = key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');
        if (key === 'organizador_moderno') domSuffix = 'OrganizadorModerno';
        if (key === 'juguete_gato') domSuffix = 'JugueteGato';
        
        checkbox = document.getElementById(`check${domSuffix}`);
        if (checkbox) return checkbox.closest('.product-selection-card');
        
        return null;
    }

    // Aplica la visibilidad de los productos deshabilitados para venta
    function applyDisabledProductsVisibility() {
        const disabledRaw = localStorage.getItem('disabled_products');
        let disabledList = [];
        if (disabledRaw) {
            try {
                disabledList = JSON.parse(disabledRaw);
            } catch(e) {
                console.error(e);
            }
        }
        
        // Resetear todas las tarjetas a su estado original
        const allCards = document.querySelectorAll('.product-selection-card');
        allCards.forEach(card => {
            card.style.display = '';
            card.style.opacity = '';
            card.classList.remove('admin-disabled-card');
            const badge = card.querySelector('.disabled-badge-admin');
            if (badge) badge.remove();
            
            // Reactivar inputs de forma segura si no es un producto deshabilitado
            const checkbox = card.querySelector('.toggle-container input[type="checkbox"]');
            if (checkbox && checkbox.disabled) {
                checkbox.disabled = false;
            }
        });
        
        // Aplicar estado de deshabilitación para venta
        disabledList.forEach(key => {
            const card = getProductCard(key);
            if (!card) return;
            
            if (isAdmin) {
                // Si es admin, mostrar opaco con una banda "PAUSADO"
                card.style.opacity = '0.55';
                card.classList.add('admin-disabled-card');
                
                if (!card.querySelector('.disabled-badge-admin')) {
                    const badgeHTML = `<span class="disabled-badge-admin" style="position: absolute; top: 12px; right: 12px; background: rgba(229, 62, 62, 0.95); color: white; padding: 4px 10px; border-radius: 8px; font-size: 0.7rem; font-weight: bold; text-transform: uppercase; z-index: 10; box-shadow: 0 0 10px rgba(229, 62, 62, 0.4);"><i class="fa-solid fa-eye-slash" style="margin-right: 4px;"></i> Pausado</span>`;
                    card.insertAdjacentHTML('afterbegin', badgeHTML);
                }
                
                // Deshabilitar controles de compra
                const checkbox = card.querySelector('.toggle-container input[type="checkbox"]');
                if (checkbox) {
                    checkbox.checked = false;
                    checkbox.disabled = true;
                    
                    const controlsRow = card.querySelector('.controls-row');
                    if (controlsRow) {
                        controlsRow.style.opacity = '0.3';
                        controlsRow.style.pointerEvents = 'none';
                    }
                    card.classList.add('disabled');
                    products[key].qty = 0;
                    const valDisplay = card.querySelector('.qty-val');
                    if (valDisplay) valDisplay.textContent = 0;
                }
            } else {
                // Si es visitante, ocultar completamente de la góndola
                card.style.display = 'none';
                
                // Ocultar sección de colección si se queda vacía
                const grid = card.parentElement;
                if (grid) {
                    const visibleCards = Array.from(grid.children).filter(c => c.style.display !== 'none');
                    if (visibleCards.length === 0) {
                        const collectionId = grid.id.replace('grid-', '');
                        const header = document.getElementById(collectionId);
                        if (header) header.style.display = 'none';
                        grid.style.display = 'none';
                    }
                }
            }
        });
        
        // Si el visitante normal entra, asegurar de restaurar colecciones visibles si tienen productos
        if (!isAdmin) {
            const allGrids = document.querySelectorAll('.products-grid-cols');
            allGrids.forEach(grid => {
                const visibleCards = Array.from(grid.children).filter(c => c.style.display !== 'none');
                if (visibleCards.length > 0) {
                    const collectionId = grid.id.replace('grid-', '');
                    const header = document.getElementById(collectionId);
                    if (header) header.style.display = '';
                    grid.style.display = '';
                }
            });
        }
        
        updateTotalOrder();
    }

    // Escuchador de conmutación de venta comercial delegada
    document.body.addEventListener('change', (e) => {
        const trigger = e.target.closest('.btn-toggle-commercial-trigger');
        if (!trigger) return;
        
        if (!isAdmin) return;
        
        const key = trigger.getAttribute('data-product-key');
        if (!key) return;
        
        const isChecked = trigger.checked;
        const disabledRaw = localStorage.getItem('disabled_products');
        let disabledList = [];
        if (disabledRaw) {
            try {
                disabledList = JSON.parse(disabledRaw);
            } catch(err) {
                console.error(err);
            }
        }
        
        if (isChecked) {
            disabledList = disabledList.filter(k => k !== key);
            showToastNotification(`🛒 Producto habilitado para comercialización.`);
        } else {
            if (!disabledList.includes(key)) {
                disabledList.push(key);
            }
            showToastNotification(`📴 Producto pausado y quitado de góndola.`);
        }
        
        localStorage.setItem('disabled_products', JSON.stringify(disabledList));
        persistDataToServer();
        applyDisabledProductsVisibility();
    });

    // Asegurar que la colección exista en el selector
    function ensureCollectionInSelect(collectionId, collectionName) {
        const select = document.getElementById('newProdCollection');
        if (!select) return;
        let exists = false;
        for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].value === collectionId) {
                exists = true;
                break;
            }
        }
        if (!exists) {
            const opt = document.createElement('option');
            opt.value = collectionId;
            opt.textContent = collectionName || collectionId.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            select.insertBefore(opt, select.options[select.options.length - 1]);
        }
    }

    // Salir del modo edición
    function exitProductEditMode() {
        editingProductKey = null;
        const productCreatorForm = document.getElementById('productCreatorForm');
        if (productCreatorForm) productCreatorForm.reset();
        
        compressedImageBase64 = '';
        const uploadPreviewContainer = document.getElementById('uploadPreviewContainer');
        const uploadPreviewImg = document.getElementById('uploadPreviewImg');
        const uploadPreviewVideo = document.getElementById('uploadPreviewVideo');
        if (uploadPreviewContainer) uploadPreviewContainer.style.display = 'none';
        if (uploadPreviewImg) {
            uploadPreviewImg.src = '';
            uploadPreviewImg.style.display = 'none';
        }
        if (uploadPreviewVideo) {
            uploadPreviewVideo.src = '';
            uploadPreviewVideo.style.display = 'none';
        }
        
        const newCollectionNameGroup = document.getElementById('newCollectionNameGroup');
        if (newCollectionNameGroup) newCollectionNameGroup.style.display = 'none';
        
        // Restaurar título del creador
        const adminCreatorPanel = document.getElementById('adminCreatorPanel');
        if (adminCreatorPanel) {
            const creatorTitle = adminCreatorPanel.querySelector('h3');
            if (creatorTitle) {
                creatorTitle.innerHTML = `<i class="fa-solid fa-square-plus" style="color: var(--primary);"></i> Creador de Productos & Telemetría`;
            }
        }
        
        // Restaurar textos de botones
        const btnPublishProduct = document.getElementById('btnPublishProduct');
        const btnPublishAndKeep = document.getElementById('btnPublishAndKeep');
        if (btnPublishProduct) {
            btnPublishProduct.innerHTML = `<i class="fa-solid fa-circle-check" style="margin-right: 8px;"></i> Publicar y Finalizar`;
        }
        if (btnPublishAndKeep) {
            btnPublishAndKeep.innerHTML = `<i class="fa-solid fa-square-plus" style="margin-right: 8px; color: var(--primary);"></i> Guardar y Seguir Cargando`;
        }
        
        // Eliminar botón cancelar
        const btnCancel = document.getElementById('btnCancelProductEdit');
        if (btnCancel) btnCancel.remove();
        
        syncMaterialPriceFromSelect();
        updateLiveTelemetry();
    }

    // Escuchador delegado para reeditar producto (Modo Administrador)
    document.body.addEventListener('click', (e) => {
        const trigger = e.target.closest('.btn-edit-product-trigger');
        if (!trigger) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        if (!isAdmin) return;
        
        const productKey = trigger.getAttribute('data-product-key');
        if (!productKey) return;
        
        const customProds = getSafeCustomProducts();
        let product = customProds.find(p => p.key === productKey);
        if (!product) {
            const hardcoded = hardcodedTelemetry[productKey];
            if (hardcoded) {
                const savedPrice = localStorage.getItem(`price_${productKey}`);
                const savedDesc = localStorage.getItem(`desc_${productKey}`);
                const savedImage = localStorage.getItem(`custom_image_${productKey}`);
                const savedTelemetryRaw = localStorage.getItem(`telemetry_${productKey}`);
                const savedTelemetry = savedTelemetryRaw ? JSON.parse(savedTelemetryRaw) : null;
                
                product = {
                    key: productKey,
                    name: hardcoded.name,
                    desc: savedDesc || hardcoded.desc,
                    price: savedPrice ? parseFloat(savedPrice) : (products[productKey] ? products[productKey].price : 0),
                    collectionId: productKey === 'jabonera' || productKey === 'portarollo' ? 'tocador-baño' : (productKey === 'contenedor' || productKey === 'organizador' || productKey === 'organizador_moderno' ? 'oficina-escritorio' : 'mascotas-recreacion'),
                    collectionName: productKey === 'jabonera' || productKey === 'portarollo' ? 'Tocador & Baño' : (productKey === 'contenedor' || productKey === 'organizador' || productKey === 'organizador_moderno' ? 'Oficina & Escritorio' : 'Mascotas & Recreación'),
                    categoryBadge: hardcoded.categoryBadge,
                    photo: savedImage || hardcoded.slicerPhoto,
                    slicerPhoto: hardcoded.slicerPhoto,
                    telemetry: {
                        weight: savedTelemetry ? savedTelemetry.weight : hardcoded.weight,
                        hours: savedTelemetry ? savedTelemetry.hours : hardcoded.hours,
                        minutes: savedTelemetry ? savedTelemetry.minutes : hardcoded.minutes,
                        material: savedTelemetry ? savedTelemetry.material : hardcoded.material,
                        color: savedTelemetry ? savedTelemetry.color : hardcoded.defaultColor,
                        friendlyColor: savedTelemetry ? savedTelemetry.friendlyColor : hardcoded.friendlyColor,
                        margin: savedTelemetry ? savedTelemetry.margin : 1.65
                    }
                };
            }
        }
        
        if (!product) {
            alert("⚠️ No se encontró el producto en el catálogo personalizado ni de fábrica.");
            return;
        }
        
        // Entrar en modo edición
        editingProductKey = product.key;
        
        // Abrir panel y scroll suave
        const adminCreatorPanel = document.getElementById('adminCreatorPanel');
        if (adminCreatorPanel) {
            adminCreatorPanel.style.display = 'block';
            adminCreatorPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        
        // Rellenar formulario
        const newProdName = document.getElementById('newProdName');
        const newProdCollection = document.getElementById('newProdCollection');
        const newProdDesc = document.getElementById('newProdDesc');
        const newProdPhotoName = document.getElementById('newProdPhotoName');
        const newProdWeight = document.getElementById('newProdWeight');
        const newProdMaterial = document.getElementById('newProdMaterial');
        const newProdColor = document.getElementById('newProdColor');
        const newProdHours = document.getElementById('newProdHours');
        const newProdMinutes = document.getElementById('newProdMinutes');
        const newProdMargin = document.getElementById('newProdMargin');
        
        if (newProdName) newProdName.value = product.name;
        if (newProdDesc) newProdDesc.value = product.desc;
        
        // Asegurar que la colección esté en el selector
        ensureCollectionInSelect(product.collectionId, product.collectionName);
        if (newProdCollection) {
            newProdCollection.value = product.collectionId;
            // Ocultar grupo de nueva colección si estaba abierto
            const newCollectionNameGroup = document.getElementById('newCollectionNameGroup');
            if (newCollectionNameGroup) newCollectionNameGroup.style.display = 'none';
        }
        
        // Rellenar imagen
        if (newProdPhotoName) {
            if (product.photo && !product.photo.startsWith('data:')) {
                let cleanPath = product.photo;
                if (cleanPath.startsWith('images/')) {
                    cleanPath = cleanPath.substring(7);
                }
                newProdPhotoName.value = cleanPath;
                // Ocultar previsualización
                const uploadPreviewContainer = document.getElementById('uploadPreviewContainer');
                if (uploadPreviewContainer) uploadPreviewContainer.style.display = 'none';
            } else {
                newProdPhotoName.value = '';
                // Mostrar previsualización si es base64
                if (product.photo && product.photo.startsWith('data:')) {
                    compressedImageBase64 = product.photo;
                    const uploadPreviewContainer = document.getElementById('uploadPreviewContainer');
                    const uploadPreviewImg = document.getElementById('uploadPreviewImg');
                    const uploadPreviewVideo = document.getElementById('uploadPreviewVideo');
                    if (uploadPreviewContainer) {
                        const isVideo = isVideoData(product.photo);
                        if (isVideo) {
                            if (uploadPreviewImg) uploadPreviewImg.style.display = 'none';
                            if (uploadPreviewVideo) {
                                uploadPreviewVideo.src = product.photo;
                                uploadPreviewVideo.style.display = 'block';
                            }
                        } else {
                            if (uploadPreviewVideo) uploadPreviewVideo.style.display = 'none';
                            if (uploadPreviewImg) {
                                uploadPreviewImg.src = product.photo;
                                uploadPreviewImg.style.display = 'block';
                            }
                        }
                        uploadPreviewContainer.style.display = 'flex';
                    }
                } else {
                    compressedImageBase64 = '';
                    const uploadPreviewContainer = document.getElementById('uploadPreviewContainer');
                    if (uploadPreviewContainer) uploadPreviewContainer.style.display = 'none';
                }
            }
        }
        
        // Rellenar telemetría
        if (product.telemetry) {
            if (newProdWeight) newProdWeight.value = product.telemetry.weight;
            if (newProdMaterial) {
                newProdMaterial.value = product.telemetry.material;
                syncMaterialPriceFromSelect();
            }
            if (newProdColor) newProdColor.value = product.telemetry.color;
            if (newProdHours) newProdHours.value = product.telemetry.hours;
            if (newProdMinutes) newProdMinutes.value = product.telemetry.minutes;
            if (newProdMargin) newProdMargin.value = product.telemetry.margin || "1.65";
            const newProdPriceManual = document.getElementById('newProdPriceManual');
            if (newProdPriceManual) {
                newProdPriceManual.value = product.telemetry.manualPrice || '';
            }
        }
        
        // Recalcular costos de inmediato
        updateLiveTelemetry();
        
        // Modificar aspecto visual del panel
        const creatorTitle = adminCreatorPanel.querySelector('h3');
        if (creatorTitle) {
            creatorTitle.innerHTML = `<i class="fa-solid fa-pen-to-square" style="color: var(--primary);"></i> Editando: ${product.name}`;
        }
        
        // Cambiar texto de los botones de guardar/publicar
        const btnPublishProduct = document.getElementById('btnPublishProduct');
        const btnPublishAndKeep = document.getElementById('btnPublishAndKeep');
        if (btnPublishProduct) {
            btnPublishProduct.innerHTML = `<i class="fa-solid fa-circle-check" style="margin-right: 8px;"></i> Guardar Cambios y Finalizar`;
        }
        if (btnPublishAndKeep) {
            btnPublishAndKeep.innerHTML = `<i class="fa-solid fa-square-plus" style="margin-right: 8px; color: var(--primary);"></i> Guardar y Seguir Editando`;
        }
        
        // Agregar botón de cancelar si no existe
        const submitGroup = btnPublishProduct.parentElement;
        if (submitGroup && !document.getElementById('btnCancelProductEdit')) {
            const btnCancel = document.createElement('button');
            btnCancel.type = 'button';
            btnCancel.id = 'btnCancelProductEdit';
            btnCancel.className = 'btn btn-outline';
            btnCancel.style.flex = '1';
            btnCancel.style.borderRadius = '12px';
            btnCancel.style.fontSize = '0.9rem';
            btnCancel.style.padding = '14px';
            btnCancel.style.borderColor = '#E53E3E';
            btnCancel.style.color = '#E53E3E';
            btnCancel.style.background = 'rgba(229, 62, 92, 0.05)';
            btnCancel.style.minWidth = '150px';
            btnCancel.innerHTML = `<i class="fa-solid fa-xmark" style="margin-right: 8px;"></i> Cancelar Edición`;
            
            btnCancel.addEventListener('click', () => {
                exitProductEditMode();
            });
            
            // Insertar al final del contenedor de botones
            submitGroup.appendChild(btnCancel);
        }
    });

    // 6. Publicar producto y telemetría personalizada
    const productCreatorForm = document.getElementById('productCreatorForm');
    const btnPublishAndKeep = document.getElementById('btnPublishAndKeep');

    if (productCreatorForm) {
        // Interceptar submit tradicional (Publicar y Finalizar)
        productCreatorForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await publishProductLogic(false);
        });

        // Configurar botón "Guardar y Seguir Cargando"
        if (btnPublishAndKeep) {
            btnPublishAndKeep.addEventListener('click', async (e) => {
                e.preventDefault();
                await publishProductLogic(true);
            });
        }
    }

    // Función de notificación premium dinámica tipo Toast
    function showToastNotification(message) {
        const toast = document.createElement('div');
        toast.className = 'glassmorphism highlighted-card animate-pulse';
        toast.style.position = 'fixed';
        toast.style.bottom = '40px';
        toast.style.left = '40px';
        toast.style.padding = '16px 28px';
        toast.style.borderRadius = '16px';
        toast.style.border = '1px solid var(--primary)';
        toast.style.background = 'rgba(7, 10, 17, 0.95)';
        toast.style.color = 'white';
        toast.style.boxShadow = '0 10px 30px rgba(245, 101, 101, 0.25)';
        toast.style.zIndex = '3000';
        toast.style.fontFamily = 'var(--font-body)';
        toast.style.fontSize = '0.92rem';
        toast.style.fontWeight = '600';
        toast.style.display = 'flex';
        toast.style.alignItems = 'center';
        toast.style.gap = '10px';
        toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        toast.innerHTML = `<i class="fa-solid fa-circle-check" style="color: #48BB78; font-size: 1.15rem;"></i> ${message}`;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(15px)';
            setTimeout(() => toast.remove(), 400);
        }, 3000);
    }

    // Lógica unificada para procesar, guardar y opcionalmente renderizar en caliente
    async function publishProductLogic(keepOpen) {
        const newProdName = document.getElementById('newProdName');
        const newProdCollection = document.getElementById('newProdCollection');
        const newProdDesc = document.getElementById('newProdDesc');
        const newProdPhotoName = document.getElementById('newProdPhotoName');
        
        if (!newProdName || !newProdName.value.trim()) {
            alert("⚠️ Por favor, ingrese el nombre del producto.");
            return;
        }
        if (!newProdDesc || !newProdDesc.value.trim()) {
            alert("⚠️ Por favor, ingrese la descripción comercial.");
            return;
        }

        const material = newProdMaterial.value;
        const manualInput = document.getElementById('newProdPriceManual');
        const manualPrice = manualInput ? parseFloat(manualInput.value) : NaN;
        
        let weight = parseFloat(newProdWeight.value);
        if (isNaN(weight) || weight < 0) {
            weight = 0;
        }

        if (isNaN(manualPrice) || manualPrice <= 0) {
            if (weight <= 0) {
                alert("⚠️ Por favor, ingrese un peso válido para calcular el precio, o defina un precio de venta fijo manual.");
                return;
            }
        }

        const uniqueKey = editingProductKey || `custom_${Date.now()}`;
        let photoPath = '';
        if (compressedImageBase64) {
            if (serverAvailable) {
                const uploadedUrl = await uploadImageToServer(uniqueKey, compressedImageBase64);
                photoPath = uploadedUrl || compressedImageBase64;
            } else {
                photoPath = compressedImageBase64;
            }
        } else {
            let typedPath = newProdPhotoName ? newProdPhotoName.value.trim() : '';
            if (typedPath) {
                if (!typedPath.toLowerCase().startsWith('images/')) {
                    photoPath = 'images/' + typedPath;
                } else {
                    photoPath = typedPath;
                }
            } else if (editingProductKey) {
                // Preservar la imagen original del producto editado si no se subió una nueva
                const customProds = getSafeCustomProducts();
                const existingProd = customProds.find(p => p.key === editingProductKey);
                photoPath = existingProd ? existingProd.photo : 'images/jabonera.png';
            } else {
                photoPath = 'images/jabonera.png';
            }
        }
        
        const slicerPath = photoPath;
        let collectionId = newProdCollection.value;
        let collectionName = '';
        
        if (collectionId === 'nueva-coleccion') {
            const newCollectionName = document.getElementById('newCollectionName');
            const rawName = newCollectionName ? newCollectionName.value.trim() : '';
            if (!rawName) {
                alert("⚠️ Por favor, ingrese el nombre para la nueva colección.");
                return;
            }
            collectionName = rawName;
            collectionId = rawName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            if (!collectionId) {
                collectionId = `coleccion-${Date.now()}`;
            }
        } else {
            // Obtener el nombre comercial de la colección seleccionada para el badge/encabezado
            const selectedOpt = newProdCollection.options[newProdCollection.selectedIndex];
            if (selectedOpt) {
                collectionName = selectedOpt.textContent;
            }
        }
        
        const newProdColor = document.getElementById('newProdColor');
        const typedColor = newProdColor ? newProdColor.value.trim() : '';
        const defaultColor = typedColor || (material === 'PETG' ? 'Space Grey' : 'Beige');
        const friendlyColor = defaultColor || 'N/A';
        
        const calcData = updateLiveTelemetry();
        const finalPrice = (!isNaN(manualPrice) && manualPrice > 0) ? manualPrice : (calcData ? calcData.suggestedPrice : 0);
        
        const newProduct = {
            key: uniqueKey,
            name: newProdName.value,
            desc: newProdDesc.value,
            price: finalPrice,
            collectionId: collectionId,
            collectionName: collectionName,
            categoryBadge: `Tecnología ${material}`,
            photo: photoPath,
            slicerPhoto: slicerPath,
            telemetry: {
                weight: weight,
                hours: parseInt(newProdHours.value) || 0,
                minutes: parseInt(newProdMinutes.value) || 0,
                material: material,
                color: defaultColor || 'N/A',
                friendlyColor: friendlyColor,
                margin: parseFloat(newProdMargin.value) || 1.65,
                filamentCost: calcData ? calcData.filamentCost : 0,
                energyCost: calcData ? calcData.energyCost : 0,
                amortCost: calcData ? calcData.amortCost : 0,
                netCost: calcData ? calcData.netCost : 0,
                manualPrice: !isNaN(manualPrice) && manualPrice > 0 ? manualPrice : null
            }
        };
        
        try {
            const originalKeys = ['jabonera', 'portarollo', 'organizador', 'contenedor', 'organizador_moderno', 'juguete_gato'];
            const isOriginal = originalKeys.includes(uniqueKey);
            
            if (isOriginal) {
                // Guardar los cambios del producto original en sus respectivas claves individuales de localStorage
                localStorage.setItem(`price_${uniqueKey}`, newProduct.price);
                localStorage.setItem(`desc_${uniqueKey}`, newProduct.desc);
                if (compressedImageBase64) {
                    localStorage.setItem(`custom_image_${uniqueKey}`, photoPath);
                }
                localStorage.setItem(`telemetry_${uniqueKey}`, JSON.stringify(newProduct.telemetry));
            } else {
                // Flujo para productos personalizados dinámicos
                const customProductsList = getSafeCustomProducts();
                const existingIndex = customProductsList.findIndex(p => p.key === uniqueKey);
                if (existingIndex !== -1) {
                    customProductsList[existingIndex] = newProduct;
                } else {
                    customProductsList.push(newProduct);
                }
                localStorage.setItem('custom_products', JSON.stringify(customProductsList));
                
                if (!editingProductKey) {
                    deductStock(material, defaultColor, weight);
                }
            }
            
            persistDataToServer(true);
            
            if (editingProductKey) {
                // Modo Edición en Caliente (DOM reactivo)
                products[newProduct.key].price = newProduct.price;
                defaultPrices[newProduct.key] = newProduct.price;

                const suffix = getOriginalSuffix(newProduct.key);
                if (suffix) {
                    // Actualizar elementos estáticos de producto de fábrica
                    const imgEl = document.getElementById('img' + suffix);
                    if (imgEl) imgEl.src = newProduct.photo;
                    
                    const priceEl = document.getElementById('price' + suffix);
                    const parent = priceEl ? priceEl.parentElement : null;
                    const titleEl = parent ? parent.querySelector('h3') : null;
                    if (titleEl) {
                        titleEl.innerHTML = `${newProduct.name} ${isAdmin ? `<i class="fa-solid fa-pen-to-square btn-edit-product-trigger" data-product-key="${newProduct.key}" style="cursor: pointer; margin-left: 8px; font-size: 0.95rem; color: var(--primary); transition: var(--transition);" title="Editar telemetría y detalles del producto"></i>` : ''}`;
                    }
                    
                    const descEl = document.getElementById('desc' + suffix);
                    if (descEl) descEl.textContent = newProduct.desc;
                    
                    if (priceEl) priceEl.textContent = `$${new Intl.NumberFormat('es-AR').format(newProduct.price)} ARS`;

                    // Actualizar badge de categoría del producto estático
                    const cardEl = imgEl ? imgEl.closest('.product-selection-card') : null;
                    const badgeEl = cardEl ? cardEl.querySelector('.product-category-badge') : null;
                    if (badgeEl) {
                        badgeEl.textContent = newProduct.categoryBadge;
                    }
                } else {
                    // Actualizar tarjetas de productos dinámicos
                    const existingCard = document.querySelector(`[data-custom-key="${newProduct.key}"]`);
                    if (existingCard) {
                        const imgEl = existingCard.querySelector('.catalog-thumb');
                        if (imgEl) imgEl.src = newProduct.photo;
                        
                        const titleEl = existingCard.querySelector('.product-main-details h3');
                        if (titleEl) {
                            titleEl.innerHTML = `${newProduct.name} ${isAdmin ? `<i class="fa-solid fa-pen-to-square btn-edit-product-trigger" data-product-key="${newProduct.key}" style="cursor: pointer; margin-left: 8px; font-size: 0.95rem; color: var(--primary); transition: var(--transition);" title="Editar telemetría y detalles del producto"></i>` : ''}`;
                        }
                        
                        const descEl = existingCard.querySelector('.product-card-desc');
                        if (descEl) descEl.textContent = newProduct.desc;
                        
                        const priceEl = existingCard.querySelector('.card-price-tag');
                        if (priceEl) priceEl.textContent = `$${new Intl.NumberFormat('es-AR').format(newProduct.price)} ARS`;
                        
                        const badgeEl = existingCard.querySelector('.product-category-badge');
                        if (badgeEl) badgeEl.textContent = newProduct.categoryBadge;

                        // Mover la tarjeta si cambió de colección
                        const parentGrid = existingCard.parentElement;
                        const targetGridId = `grid-${newProduct.collectionId}`;
                        if (parentGrid && parentGrid.id !== targetGridId) {
                            existingCard.remove();
                            let targetGrid = document.getElementById(targetGridId);
                            if (!targetGrid) {
                                const productsListWrapper = document.querySelector('.products-list-wrapper');
                                if (productsListWrapper) {
                                    const collName = newProduct.collectionName || newProduct.collectionId.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                                    const newCollHTML = `
                                        <div class="collection-header-inline" id="${newProduct.collectionId}" style="margin-top: 48px; margin-bottom: 24px;">
                                            <h3><i class="fa-solid fa-folder-open" style="color: var(--primary);"></i> Colección ${collName}</h3>
                                        </div>
                                        <div class="products-grid-cols" id="grid-${newProduct.collectionId}"></div>
                                    `;
                                    productsListWrapper.insertAdjacentHTML('beforeend', newCollHTML);
                                    targetGrid = document.getElementById(targetGridId);
                                    
                                    const navMenu = document.querySelector('.nav-menu');
                                    const pilaresLink = navMenu ? navMenu.querySelector('a[href="#pilares"]') : null;
                                    if (navMenu && pilaresLink && !navMenu.querySelector(`a[href="#${newProduct.collectionId}"]`)) {
                                        const newNavLinkHTML = `<a href="#${newProduct.collectionId}" class="nav-link dynamic-nav-link">${collName}</a>`;
                                        pilaresLink.insertAdjacentHTML('beforebegin', newNavLinkHTML);
                                    }
                                }
                            }
                            if (targetGrid) {
                                targetGrid.appendChild(existingCard);
                            }
                        }
                        
                        setupProductControls(`_${newProduct.key}`, newProduct.key);
                        setupPriceEditing(`price_${newProduct.key}`, newProduct.key, `_${newProduct.key}`);
                        setupDescriptionEditing(`desc_${newProduct.key}`, newProduct.key);
                    }
                }

                showToastNotification(`✨ Producto "${newProduct.name}" actualizado en caliente!`);
                exitProductEditMode();
                renderAdminCatalogChecklist();
                applyDisabledProductsVisibility();

                if (!keepOpen) {
                    const editedElement = suffix ? document.getElementById('price' + suffix) : document.querySelector(`[data-custom-key="${newProduct.key}"]`);
                    if (editedElement) {
                        editedElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }
            } else if (keepOpen) {
                // Registrar en estructuras globales en caliente para productos nuevos
                products[newProduct.key] = {
                    name: newProduct.name,
                    price: newProduct.price,
                    qty: 0,
                    color: newProduct.telemetry.color,
                    active: true,
                    friendlyColor: newProduct.telemetry.friendlyColor
                };
                defaultPrices[newProduct.key] = newProduct.price;

                let targetGrid = document.getElementById(`grid-${newProduct.collectionId}`);
                if (!targetGrid) {
                    const productsListWrapper = document.querySelector('.products-list-wrapper');
                    if (productsListWrapper) {
                        const collName = newProduct.collectionName || newProduct.collectionId.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                        const newCollHTML = `
                            <div class="collection-header-inline" id="${newProduct.collectionId}" style="margin-top: 48px; margin-bottom: 24px;">
                                <h3><i class="fa-solid fa-folder-open" style="color: var(--primary);"></i> Colección ${collName}</h3>
                            </div>
                            <div class="products-grid-cols" id="grid-${newProduct.collectionId}"></div>
                        `;
                        productsListWrapper.insertAdjacentHTML('beforeend', newCollHTML);
                        targetGrid = document.getElementById(`grid-${newProduct.collectionId}`);
                        
                        const navMenu = document.querySelector('.nav-menu');
                        const pilaresLink = navMenu ? navMenu.querySelector('a[href="#pilares"]') : null;
                        if (navMenu && pilaresLink && !navMenu.querySelector(`a[href="#${newProduct.collectionId}"]`)) {
                            const newNavLinkHTML = `<a href="#${newProduct.collectionId}" class="nav-link dynamic-nav-link">${collName}</a>`;
                            pilaresLink.insertAdjacentHTML('beforebegin', newNavLinkHTML);
                        }
                    }
                }
                
                if (targetGrid) {
                    const cardHTML = `
                        <div class="product-selection-card glassmorphism" data-custom-key="${newProduct.key}">
                            <span class="product-category-badge">${newProduct.categoryBadge}</span>
                            <div class="product-card-header">
                                <div class="product-main-visual">
                                    <img src="${newProduct.photo}" alt="${newProduct.name}" class="catalog-thumb" id="img_${newProduct.key}">
                                </div>
                                <div class="product-main-details">
                                    <h3>${newProduct.name} ${isAdmin ? `<i class="fa-solid fa-pen-to-square btn-edit-product-trigger" data-product-key="${newProduct.key}" style="cursor: pointer; margin-left: 8px; font-size: 0.95rem; color: var(--primary); transition: var(--transition);" title="Editar telemetría y detalles del producto"></i>` : ''}</h3>
                                    <p class="product-card-desc" id="desc_${newProduct.key}">${newProduct.desc}</p>
                                    <span class="card-price-tag ${isAdmin ? 'admin-editable' : ''}" id="price_${newProduct.key}">$${new Intl.NumberFormat('es-AR').format(getDisplayPrice(products[newProduct.key].price))} ARS</span>
                                    ${isAdmin ? `<i class="fa-solid fa-rotate-left reset-price-btn" id="resetPrice_${newProduct.key}" style="cursor: pointer; margin-left: 8px; font-size: 0.85rem; opacity: 0.5; color: var(--primary);" title="Restablecer precio original"></i>` : ''}
                                </div>
                            </div>
                            <hr class="summary-divider">
                            <div class="product-customizer-controls">
                                <label class="toggle-container">
                                    <input type="checkbox" id="check_${newProduct.key}" checked>
                                    <span class="toggle-slider"></span>
                                    <span class="toggle-label-text">Incluir en mi pedido</span>
                                </label>
                                
                                <div class="controls-row" id="controls_${newProduct.key}">
                                    <div class="color-control">
                                        <span class="control-label-micro">Color Base:</span>
                                        <div class="color-options-micro" data-target="_${newProduct.key}">
                                            <button class="color-btn-micro active" data-color="${newProduct.telemetry.color}" style="background: ${getColorGradient(newProduct.telemetry.color)};" data-name="${newProduct.telemetry.friendlyColor}"></button>
                                            <button class="color-btn-micro" data-color="Space Grey" style="background: linear-gradient(135deg, #4A5568, #2D3748);" data-name="Space Grey"></button>
                                            <button class="color-btn-micro" data-color="Beige" style="background: linear-gradient(135deg, #E2E8F0, #CBD5E0);" data-name="Beige Soft"></button>
                                            <button class="color-btn-micro" data-color="Transparent" style="background: linear-gradient(135deg, rgba(255,255,255,0.7), rgba(255,255,255,0.2));" data-name="Transparente"></button>
                                            <button class="color-btn-micro" data-color="Orange" style="background: linear-gradient(135deg, #ED8936, #DD6B20);" data-name="Naranja"></button>
                                            <button class="color-btn-micro" data-color="Brown" style="background: linear-gradient(135deg, #7B341E, #4A1D0F);" data-name="Marrón"></button>
                                            <button class="color-btn-micro" data-color="Black" style="background: linear-gradient(135deg, #1A202C, #0A0E17);" data-name="Negro"></button>
                                            <button class="color-btn-micro" data-color="Blue" style="background: linear-gradient(135deg, #3182CE, #2B6CB0);" data-name="Azul"></button>
                                            <button class="color-btn-micro" data-color="Red" style="background: linear-gradient(135deg, #E53E3E, #C53030);" data-name="Rojo"></button>
                                            <button class="color-btn-micro" data-color="Green" style="background: linear-gradient(135deg, #48BB78, #38A169);" data-name="Verde"></button>
                                        </div>
                                        <span class="selected-micro-name" id="colorName_${newProduct.key}">${newProduct.telemetry.friendlyColor}</span>
                                    </div>
                                    
                                    <div class="qty-control-wrapper">
                                        <span class="control-label-micro">Cantidad:</span>
                                        <div class="qty-selector">
                                            <button class="qty-btn" id="minus_${newProduct.key}"><i class="fa-solid fa-minus"></i></button>
                                            <span class="qty-val" id="val_${newProduct.key}">0</span>
                                            <button class="qty-btn" id="plus_${newProduct.key}"><i class="fa-solid fa-plus"></i></button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                    targetGrid.insertAdjacentHTML('beforeend', cardHTML);
                    
                    setupProductControls(`_${newProduct.key}`, newProduct.key);
                    setupPriceEditing(`price_${newProduct.key}`, newProduct.key, `_${newProduct.key}`);
                    setupDescriptionEditing(`desc_${newProduct.key}`, newProduct.key);
                    
                    const newImgEl = document.getElementById(`img_${newProduct.key}`);
                    if (newImgEl) {
                        setupAdminMediaListeners(newImgEl, newProduct.key);
                    }
                }
                
                showToastNotification(`✨ Producto "${newProduct.name}" guardado en caliente!`);
                renderAdminCatalogChecklist();
                applyDisabledProductsVisibility();
                
                productCreatorForm.reset();
                compressedImageBase64 = '';
                const uploadPreviewContainer = document.getElementById('uploadPreviewContainer');
                const uploadPreviewImg = document.getElementById('uploadPreviewImg');
                const uploadPreviewVideo = document.getElementById('uploadPreviewVideo');
                if (uploadPreviewContainer) uploadPreviewContainer.style.display = 'none';
                if (uploadPreviewImg) {
                    uploadPreviewImg.src = '';
                    uploadPreviewImg.style.display = 'none';
                }
                if (uploadPreviewVideo) {
                    uploadPreviewVideo.src = '';
                    uploadPreviewVideo.style.display = 'none';
                }
                
                const newCollectionNameGroup = document.getElementById('newCollectionNameGroup');
                if (newCollectionNameGroup) newCollectionNameGroup.style.display = 'none';
                
                syncMaterialPriceFromSelect();
                updateLiveTelemetry();
                
                newProdName.focus();
            } else {
                alert(`🚀 ¡Producto "${newProduct.name}" publicado en la Boutique!\nCalculado a un RRP sugerido de $${new Intl.NumberFormat('es-AR').format(newProduct.price)} ARS.\nSe dedujeron ${ (weight * 1.05).toFixed(2) }g de filamento del rollo local.`);
                location.reload();
            }
        } catch (err) {
            console.error(err);
            alert(`❌ Error de Almacenamiento: No se pudo guardar el producto. Detalles: ${err.message}`);
        }
    }

    // 8. Sincronizar Stock local por exportación JSON
    const btnSyncJsonExport = document.getElementById('btnSyncJsonExport');
    if (btnSyncJsonExport) {
        btnSyncJsonExport.addEventListener('click', () => {
            const localInv = localStorage.getItem('gravity_inventory');
            if (!localInv) {
                alert("❌ No hay base de datos de inventario local.");
                return;
            }
            
            const formattedJson = JSON.stringify(JSON.parse(localInv), null, 2);
            const blob = new Blob([formattedJson], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'backup_inventario.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            alert("📥 Archivo 'backup_inventario.json' descargado.\nReemplázalo en tu directorio local del taller para conservar el stock físico real auditado.");
        });
    }

    // 8.5 Exportar Catálogo General a Excel (CSV con formato Windows-Spanish/Excel)
    const btnExportCatalogExcel = document.getElementById('btnExportCatalogExcel');
    if (btnExportCatalogExcel) {
        btnExportCatalogExcel.addEventListener('click', () => {
            const customProds = getSafeCustomProducts();
            
            const deletedRaw = localStorage.getItem('deleted_factory_products');
            let deletedList = [];
            if (deletedRaw) {
                try {
                    deletedList = JSON.parse(deletedRaw);
                } catch(e) {
                    console.error(e);
                }
            }

            const disabledRaw = localStorage.getItem('disabled_products');
            let disabledList = [];
            if (disabledRaw) {
                try {
                    disabledList = JSON.parse(disabledRaw);
                } catch(e) {
                    console.error(e);
                }
            }
            
            const allFactoryProds = [
                { key: 'jabonera', name: products.jabonera?.name || "Jabonera de Panal Minimalista", collection: 'Tocador & Baño', material: getFactoryMaterial('jabonera', 'PETG'), price: products.jabonera?.price || 4550, origin: 'Fábrica' },
                { key: 'portarollo', name: products.portarollo?.name || "Smart Toilet Roll Holder", collection: 'Tocador & Baño', material: getFactoryMaterial('portarollo', 'PETG'), price: products.portarollo?.price || 7765, origin: 'Fábrica' },
                { key: 'organizador', name: products.organizador?.name || "Organizador Compartimentado", collection: 'Oficina & Escritorio', material: getFactoryMaterial('organizador', 'PETG'), price: products.organizador?.price || 13125, origin: 'Fábrica' },
                { key: 'contenedor', name: products.contenedor?.name || "Contenedor Roscado 50mm", collection: 'Oficina & Escritorio', material: getFactoryMaterial('contenedor', 'PETG'), price: products.contenedor?.price || 2055, origin: 'Fábrica' },
                { key: 'organizador_moderno', name: products.organizador_moderno?.name || "Organizador de Escritorio Moderno", collection: 'Oficina & Escritorio', material: getFactoryMaterial('organizador_moderno', 'PETG'), price: products.organizador_moderno?.price || 13320, origin: 'Fábrica' },
                { key: 'juguete_gato', name: products.juguete_gato?.name || "Juguete Esfera Geodésica \"Geo-Ball\"", collection: 'Mascotas & Recreación', material: getFactoryMaterial('juguete_gato', 'PETG'), price: products.juguete_gato?.price || 2875, origin: 'Fábrica' }
            ];
            
            const factoryProds = allFactoryProds.filter(p => !deletedList.includes(p.key));
            
            const customMapped = customProds.map(p => ({
                key: p.key,
                name: p.name,
                collection: p.collectionName || p.collectionId.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
                material: p.telemetry ? p.telemetry.material : 'PETG',
                price: products[p.key]?.price || p.price,
                origin: 'Personalizado'
            }));
            
            const allProds = [...factoryProds, ...customMapped];
            
            if (allProds.length === 0) {
                alert("⚠️ No hay productos en el catálogo para exportar.");
                return;
            }
            
            // Construir CSV compatible con Excel en español (punto y coma ';') y BOM UTF-8
            let csvContent = "\ufeff"; // BOM para caracteres especiales (tildes, eñes)
            csvContent += "Nombre;Colección;Material;Precio Sugerido (ARS);Origen;Estado Comercialización\n";
            
            allProds.forEach(prod => {
                const nameEscaped = prod.name.replace(/"/g, '""');
                const colEscaped = prod.collection.replace(/"/g, '""');
                const matEscaped = prod.material.replace(/"/g, '""');
                const priceVal = Math.round(prod.price);
                const originEscaped = prod.origin.replace(/"/g, '""');
                const isCommercial = !disabledList.includes(prod.key);
                
                csvContent += `"${nameEscaped}";"${colEscaped}";"${matEscaped}";${priceVal};"${originEscaped}";"${isCommercial ? 'Habilitado' : 'Pausado'}"\n`;
            });
            
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `catalogo_completo_gravity3d_${new Date().toISOString().slice(0,10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showToastNotification("📈 Catálogo exportado correctamente para Excel.");
        });
    }

    // 8.6 Exportar Catálogo General a PDF (Impresión Premium con imágenes de referencia)
    const btnExportCatalogPDF = document.getElementById('btnExportCatalogPDF');
    if (btnExportCatalogPDF) {
        btnExportCatalogPDF.addEventListener('click', () => {
            const customProds = getSafeCustomProducts();
            
            const deletedRaw = localStorage.getItem('deleted_factory_products');
            let deletedList = [];
            if (deletedRaw) {
                try {
                    deletedList = JSON.parse(deletedRaw);
                } catch(e) {
                    console.error(e);
                }
            }

            const disabledRaw = localStorage.getItem('disabled_products');
            let disabledList = [];
            if (disabledRaw) {
                try {
                    disabledList = JSON.parse(disabledRaw);
                } catch(e) {
                    console.error(e);
                }
            }
            
            const allFactoryProds = [
                { key: 'jabonera', name: products.jabonera?.name || "Jabonera de Panal Minimalista", collection: 'Tocador & Baño', material: getFactoryMaterial('jabonera', 'PETG'), price: products.jabonera?.price || 4550, photo: 'images/jabonera.png', origin: 'Fábrica' },
                { key: 'portarollo', name: products.portarollo?.name || "Smart Toilet Roll Holder", collection: 'Tocador & Baño', material: getFactoryMaterial('portarollo', 'PETG'), price: products.portarollo?.price || 7765, photo: 'images/porta rollo papel higienico.gif', origin: 'Fábrica' },
                { key: 'organizador', name: products.organizador?.name || "Organizador Compartimentado", collection: 'Oficina & Escritorio', material: getFactoryMaterial('organizador', 'PETG'), price: products.organizador?.price || 13125, photo: 'images/organizador.png', origin: 'Fábrica' },
                { key: 'contenedor', name: products.contenedor?.name || "Contenedor Roscado 50mm", collection: 'Oficina & Escritorio', material: getFactoryMaterial('contenedor', 'PETG'), price: products.contenedor?.price || 2055, photo: 'images/contenedor_roscado_sin_fondo.png', origin: 'Fábrica' },
                { key: 'organizador_moderno', name: products.organizador_moderno?.name || "Organizador de Escritorio Moderno", collection: 'Oficina & Escritorio', material: getFactoryMaterial('organizador_moderno', 'PETG'), price: products.organizador_moderno?.price || 13320, photo: 'images/organizador moderno de escritorio.webp', origin: 'Fábrica' },
                { key: 'juguete_gato', name: products.juguete_gato?.name || "Juguete Esfera Geodésica \"Geo-Ball\"", collection: 'Mascotas & Recreación', material: getFactoryMaterial('juguete_gato', 'PETG'), price: products.juguete_gato?.price || 2875, photo: 'images/juguete_gato_slicer.png', origin: 'Fábrica' }
            ];
            
            const factoryProds = allFactoryProds.filter(p => !deletedList.includes(p.key));
            
            const customMapped = customProds.map(p => ({
                key: p.key,
                name: p.name,
                collection: p.collectionName || p.collectionId.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
                material: p.telemetry ? p.telemetry.material : 'PETG',
                price: products[p.key]?.price || p.price,
                photo: p.photo,
                origin: 'Personalizado'
            }));
            
            const allProds = [...factoryProds, ...customMapped];
            
            if (allProds.length === 0) {
                alert("⚠️ No hay productos en el catálogo para exportar.");
                return;
            }
 
            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                alert("⚠️ Por favor, permita las ventanas emergentes (popups) para poder imprimir el catálogo.");
                return;
            }
 
            let rowsHtml = '';
            allProds.forEach(prod => {
                const formattedPrice = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(prod.price);
                const isCommercial = !disabledList.includes(prod.key);
                const statusBadge = isCommercial ? '' : ' <span style="background: #E53E3E; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; margin-left: 6px; border: 1px solid rgba(229,62,62,0.4);">PAUSADO</span>';
                
                rowsHtml += `
                    <tr style="border-bottom: 1px solid #444;">
                        <td style="padding: 12px; text-align: center;">
                            ${renderProductMedia(prod.photo, prod.name, '', 'width: 55px; height: 55px; border-radius: 8px; object-fit: cover; border: 1px solid #444;')}
                        </td>
                        <td style="padding: 12px; font-weight: bold; color: #fff;">${prod.name}${statusBadge}</td>
                        <td style="padding: 12px; color: #ccc;">${prod.collection}</td>
                        <td style="padding: 12px; text-align: center;"><span style="background: rgba(0,242,254,0.15); color: #00f2fe; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: bold; border: 1px solid rgba(0,242,254,0.3);">${prod.material}</span></td>
                        <td style="padding: 12px; text-align: right; font-weight: bold; color: #00f2fe;">${formattedPrice}</td>
                        <td style="padding: 12px; text-align: center; color: #aaa; font-size: 0.8rem;">${prod.origin}</td>
                    </tr>
                `;
            });

            const htmlContent = `
                <!DOCTYPE html>
                <html lang="es">
                <head>
                    <meta charset="UTF-8">
                    <title>Catálogo Oficial - GRAVITY 3D Studio</title>
                    <style>
                        body {
                            background-color: #121212;
                            color: #ffffff;
                            font-family: 'Segoe UI', -apple-system, sans-serif;
                            margin: 0;
                            padding: 40px 20px;
                        }
                        .header {
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            border-bottom: 2px solid #00f2fe;
                            padding-bottom: 20px;
                            margin-bottom: 30px;
                        }
                        .header h1 {
                            margin: 0;
                            font-size: 2.2rem;
                            letter-spacing: 1px;
                            background: linear-gradient(135deg, #00f2fe 0%, #4facfe 100%);
                            -webkit-background-clip: text;
                            -webkit-text-fill-color: transparent;
                        }
                        .header p {
                            margin: 5px 0 0 0;
                            color: #888;
                            font-size: 0.9rem;
                        }
                        .logo-container {
                            text-align: right;
                        }
                        .logo-text {
                            font-size: 1.6rem;
                            font-weight: 900;
                            color: #fff;
                            letter-spacing: 2px;
                        }
                        .logo-sub {
                            font-size: 0.75rem;
                            color: #00f2fe;
                            font-weight: bold;
                            letter-spacing: 4px;
                        }
                        table {
                            width: 100%;
                            border-collapse: collapse;
                            margin-top: 20px;
                        }
                        th {
                            background-color: #1a1a1a;
                            color: #00f2fe;
                            font-weight: 600;
                            text-transform: uppercase;
                            font-size: 0.75rem;
                            letter-spacing: 1px;
                            padding: 14px;
                            border-bottom: 2px solid #00f2fe;
                        }
                        td {
                            border-bottom: 1px solid #2d2d2d;
                        }
                        .footer {
                            margin-top: 50px;
                            border-top: 1px solid #2d2d2d;
                            padding-top: 20px;
                            display: flex;
                            justify-content: space-between;
                            font-size: 0.8rem;
                            color: #666;
                        }
                        @media print {
                            body {
                                background-color: #ffffff !important;
                                color: #000000 !important;
                                padding: 0;
                            }
                            .header h1 {
                                -webkit-text-fill-color: initial !important;
                                color: #000000 !important;
                            }
                            th {
                                background-color: #f0f0f0 !important;
                                color: #000000 !important;
                                border-bottom: 2px solid #000000 !important;
                            }
                            td {
                                border-bottom: 1px solid #e0e0e0 !important;
                                color: #000000 !important;
                            }
                            td img {
                                border: 1px solid #ccc !important;
                            }
                            span {
                                color: #000000 !important;
                                background: none !important;
                                border: none !important;
                                font-weight: bold !important;
                                padding: 0 !important;
                            }
                            .footer {
                                color: #555 !important;
                                border-top: 1px solid #ccc !important;
                            }
                            @page {
                                margin: 1.5cm;
                            }
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div>
                            <h1>CATÁLOGO OFICIAL DE PRODUCTOS</h1>
                            <p>Generado automáticamente el ${new Date().toLocaleDateString('es-AR')}</p>
                        </div>
                        <div class="logo-container">
                            <div class="logo-text">GRAVITY 3D</div>
                            <div class="logo-sub">STUDIO</div>
                        </div>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th style="width: 80px; text-align: center;">Referencia</th>
                                <th style="text-align: left;">Nombre del Insumo</th>
                                <th style="text-align: left;">Colección</th>
                                <th style="width: 100px; text-align: center;">Material</th>
                                <th style="width: 130px; text-align: right;">Precio Sugerido</th>
                                <th style="width: 100px; text-align: center;">Origen</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>

                    <div class="footer">
                        <div>GRAVITY 3D Studio &copy; ${new Date().getFullYear()} - Todos los derechos reservados</div>
                        <div>Catálogo General de Góndola</div>
                    </div>

                    <script>
                        // Esperar a que carguen todas las imágenes antes de imprimir
                        window.onload = function() {
                            setTimeout(() => {
                                window.print();
                            }, 500);
                        };
                    </script>
                </body>
                </html>
            `;

            printWindow.document.open();
            printWindow.document.write(htmlContent);
            printWindow.document.close();
            
            showToastNotification("📈 Generando PDF de catálogo con imágenes de referencia...");
        });
    }

    // 7. Deducción Dinámica en la base de datos de inventario
    function deductStock(material, color, weight) {
        let localInv = getSafeInventory();
        
        const totalConsumption = weight * 1.05; // 5% purga
        let itemFound = false;
        
        for (let item of localInv.inventario) {
            if (item.Material.toUpperCase() === material.toUpperCase() && item.Color.toUpperCase() === color.toUpperCase()) {
                item.Consumo = parseFloat((item.Consumo + totalConsumption).toFixed(2));
                item.StockActual = parseFloat((item["Stock Inicial"] - item.Consumo).toFixed(2));
                if (item.StockActual < 0) {
                    item.StockActual = 0;
                    item.Estado = "⚠️ Sin Stock";
                } else if (item.StockActual < 50) {
                    item.Estado = "⚠️ Crítico";
                } else {
                    item.Estado = "✅ Óptimo";
                }
                itemFound = true;
                break;
            }
        }
        
        if (!itemFound) {
            for (let item of localInv.inventario) {
                if (item.Material.toUpperCase() === material.toUpperCase()) {
                    item.Consumo = parseFloat((item.Consumo + totalConsumption).toFixed(2));
                    item.StockActual = parseFloat((item["Stock Inicial"] - item.Consumo).toFixed(2));
                    if (item.StockActual < 0) {
                        item.StockActual = 0;
                        item.Estado = "⚠️ Sin Stock";
                    } else if (item.StockActual < 50) {
                        item.Estado = "⚠️ Crítico";
                    } else {
                        item.Estado = "✅ Óptimo";
                    }
                    break;
                }
            }
        }
        
        localStorage.setItem('gravity_inventory', JSON.stringify(localInv));
        persistDataToServer();
    }


    // 9. Lógica del Modal Slicer Telemetry 3D
    function getProductTelemetryData(key) {
        // Primero buscar en personalizados
        const customProds = getSafeCustomProducts();
        const customProd = customProds.find(p => p.key === key);
        if (customProd) {
            return {
                name: customProd.name,
                desc: customProd.desc,
                categoryBadge: customProd.categoryBadge,
                photo: customProd.photo,
                slicerPhoto: customProd.slicerPhoto,
                weight: customProd.telemetry.weight,
                hours: customProd.telemetry.hours,
                minutes: customProd.telemetry.minutes,
                material: customProd.telemetry.material,
                color: customProd.telemetry.color,
                margin: customProd.telemetry.margin
            };
        }
        
        // De lo contrario buscar en hardcoded
        const hardcoded = hardcodedTelemetry[key];
        if (hardcoded) {
            const savedTelemetryRaw = localStorage.getItem(`telemetry_${key}`);
            const savedTelemetry = savedTelemetryRaw ? JSON.parse(savedTelemetryRaw) : null;
            return {
                name: products[key] ? products[key].name : hardcoded.name,
                desc: localStorage.getItem(`desc_${key}`) || hardcoded.desc,
                categoryBadge: hardcoded.categoryBadge,
                photo: localStorage.getItem(`custom_image_${key}`) || hardcoded.slicerPhoto,
                slicerPhoto: hardcoded.slicerPhoto,
                weight: savedTelemetry ? savedTelemetry.weight : hardcoded.weight,
                hours: savedTelemetry ? savedTelemetry.hours : hardcoded.hours,
                minutes: savedTelemetry ? savedTelemetry.minutes : hardcoded.minutes,
                material: savedTelemetry ? savedTelemetry.material : hardcoded.material,
                color: savedTelemetry ? savedTelemetry.color : hardcoded.defaultColor,
                margin: savedTelemetry ? savedTelemetry.margin : 1.65
            };
        }
        return null;
    }

    // Escuchador delegado para abrir el modal
    document.body.addEventListener('click', (e) => {
        const trigger = e.target.closest('.btn-telemetry-trigger');
        if (!trigger) return;
        
        const key = trigger.getAttribute('data-product-key');
        const data = getProductTelemetryData(key);
        if (!data) return;
        
        let localInv = getSafeInventory();
        
        const rates = localInv.constants;
        const pricePerGram = rates.precios_por_gramo[data.material] || 32.0;
        const printTimeHours = data.hours + (data.minutes / 60);
        
        // Cálculos dinámicos auditados
        const filamentCost = data.weight * pricePerGram * (1 + rates.margen_purga);
        const energyCost = printTimeHours * rates.consumo_p1s_kw_h * rates.energia_kwh_ars;
        const amortCost = printTimeHours * rates.amortizacion_h_ars;
        const netCost = filamentCost + energyCost + amortCost;
        
        // Precio sugerido o precio activo en la tienda (que puede estar editado en vivo!)
        const activePrice = products[key] ? products[key].price : (netCost * data.margin);
        const activePriceRounded = customRound(getDisplayPrice(activePrice));
        
        // Formatear ARS
        const formatARS = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
        const formatARSPrecise = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(val);
        
        // Volcar al modal
        document.getElementById('telemetryProdTitle').textContent = data.name;
        document.getElementById('telemetryProdDesc').textContent = data.desc;
        document.getElementById('telemetryProdBadge').textContent = `${data.material} Premium - ${data.color}`;
        let slicerImg = document.getElementById('telemetrySlicerImg');
        if (slicerImg) {
            const photoSrc = data.slicerPhoto || data.photo || 'images/jabonera.png';
            const isVideo = isVideoData(photoSrc);
            
            if (isVideo) {
                if (slicerImg.tagName.toLowerCase() !== 'video') {
                    const videoEl = document.createElement('video');
                    videoEl.id = 'telemetrySlicerImg';
                    videoEl.autoplay = true;
                    videoEl.loop = true;
                    videoEl.muted = true;
                    videoEl.playsInline = true;
                    videoEl.style.cssText = slicerImg.style.cssText;
                    slicerImg.parentNode.replaceChild(videoEl, slicerImg);
                    slicerImg = videoEl;
                }
                slicerImg.src = photoSrc;
                slicerImg.onerror = null;
            } else {
                if (slicerImg.tagName.toLowerCase() !== 'img') {
                    const imgEl = document.createElement('img');
                    imgEl.id = 'telemetrySlicerImg';
                    imgEl.alt = 'Previsualización de Laminado';
                    imgEl.style.cssText = slicerImg.style.cssText;
                    slicerImg.parentNode.replaceChild(imgEl, slicerImg);
                    slicerImg = imgEl;
                }
                slicerImg.src = photoSrc;
                slicerImg.onerror = () => {
                    const currentSrc = slicerImg.src.toLowerCase();
                    if (currentSrc.endsWith('.png')) {
                        slicerImg.src = photoSrc.replace('.png', '.jpg');
                    } else if (currentSrc.endsWith('.jpg')) {
                        slicerImg.src = photoSrc.replace('.jpg', '.webp');
                    } else {
                        slicerImg.src = data.photo || 'images/jabonera.png';
                        slicerImg.onerror = null;
                    }
                };
            }
        }

        
        document.getElementById('telemetryMat').textContent = `${data.material} Técnico`;
        document.getElementById('telemetryWeight').textContent = `${data.weight.toFixed(2)} g`;
        document.getElementById('telemetryTime').textContent = `${data.hours}h ${data.minutes.toString().padStart(2, '0')}m`;
        
        document.getElementById('telemetryMatCost').textContent = formatARSPrecise(filamentCost);
        document.getElementById('telemetryEnergyCost').textContent = formatARSPrecise(energyCost);
        document.getElementById('telemetryAmortCost').textContent = formatARSPrecise(amortCost);
        
        document.getElementById('telemetryNetCost').textContent = formatARSPrecise(netCost);
        document.getElementById('telemetrySuggestedPrice').textContent = formatARS(activePriceRounded);
        
        const currentMargin = netCost > 0 ? activePriceRounded / netCost : 0;
        document.getElementById('telemetryMarginIntel').innerHTML = `
            *Cálculo de Taller: Costo Extrusión (con purga) + Energía Activa + Desgaste Mecánico P1S.<br>
            <strong>Márgen Comercial Real en Góndola: ${currentMargin > 0 ? currentMargin.toFixed(2) + 'x' : 'N/A (Precio Fijo)'}</strong> (Redondeado).
        `;
        
        // Mostrar modal con efecto fade-in
        const modal = document.getElementById('telemetryModal');
        if (modal) {
            modal.classList.add('show');
        }
    });

    // Controladores de cierre del modal
    const telemetryModal = document.getElementById('telemetryModal');
    const closeTelemetryBtn = document.getElementById('closeTelemetryBtn');
    
    if (telemetryModal && closeTelemetryBtn) {
        closeTelemetryBtn.addEventListener('click', () => {
            telemetryModal.classList.remove('show');
        });
        
        telemetryModal.addEventListener('click', (e) => {
            if (e.target === telemetryModal) {
                telemetryModal.classList.remove('show');
            }
        });
        
        // Tecla ESC para cerrar
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && telemetryModal.classList.contains('show')) {
                telemetryModal.classList.remove('show');
            }
        });
    }

    // Helpers de Inicialización de base de datos
    function initInventory() {
        if (!localStorage.getItem('gravity_inventory')) {
            const initialInv = {
                constants: {
                    energia_kwh_ars: 110.0,
                    consumo_p1s_kw_h: 0.14,
                    amortizacion_h_ars: 200.0,
                    precios_por_gramo: {
                        PETG: 32.0,
                        PLA: 28.0,
                        ABS: 35.0
                    },
                    margen_purga: 0.05
                },
                inventario: [
                    { Material: "PETG", Color: "Beige", Marca: "GST3D", "Stock Inicial": 500.0, Consumo: 309.21, "Stock Actual": 190.79, Estado: "✅ Óptimo" },
                    { Material: "PETG", Color: "Transparent", Marca: "GST3D", "Stock Inicial": 800.0, Consumo: 0.0, "Stock Actual": 800.0, Estado: "✅ Óptimo" },
                    { Material: "PETG", Color: "Space Grey", Marca: "GST3D", "Stock Inicial": 500.0, Consumo: 94.72, "Stock Actual": 405.28, Estado: "✅ Óptimo" },
                    { Material: "PETG", Color: "Orange", Marca: "GST3D", "Stock Inicial": 2000.0, Consumo: 86.82, "Stock Actual": 1913.18, Estado: "✅ Óptimo" },
                    { Material: "PETG", Color: "Brown", Marca: "GST3D", "Stock Inicial": 5000.0, Consumo: 38.83, "Stock Actual": 4961.17, Estado: "✅ Óptimo" },
                    { Material: "PETG", Color: "Black", Marca: "GST3D", "Stock Inicial": 500.0, Consumo: 39.25, "Stock Actual": 460.75, Estado: "✅ Óptimo" },
                    { Material: "PETG", Color: "Blue", Marca: "GST3D", "Stock Inicial": 800.0, Consumo: 158.63, "Stock Actual": 641.37, Estado: "✅ Óptimo" },
                    { Material: "PETG", Color: "Red", Marca: "GST3D", "Stock Inicial": 700.0, Consumo: 20.44, "Stock Actual": 679.56, Estado: "✅ Óptimo" },
                    { Material: "PETG", Color: "Green", Marca: "GST3D", "Stock Inicial": 1700.0, Consumo: 0.0, "Stock Actual": 1700.0, Estado: "✅ Óptimo" }
                ]
            };
            localStorage.setItem('gravity_inventory', JSON.stringify(initialInv));
            persistDataToServer();
        }
    }

    function getColorGradient(color) {
        if (!color) return 'linear-gradient(135deg, #E2E8F0, #CBD5E0)';
        const clean = color.trim().toLowerCase();
        
        switch(clean) {
            case 'beige': return 'linear-gradient(135deg, #E2E8F0, #CBD5E0)';
            case 'space grey':
            case 'space gray':
            case 'gris oscuro': return 'linear-gradient(135deg, #4A5568, #2D3748)';
            case 'transparent':
            case 'transparente': return 'linear-gradient(135deg, rgba(255,255,255,0.7), rgba(255,255,255,0.2))';
            case 'orange':
            case 'naranja': return 'linear-gradient(135deg, #ED8936, #DD6B20)';
            case 'brown':
            case 'marrón':
            case 'marron': return 'linear-gradient(135deg, #7B341E, #4A1D0F)';
            case 'black':
            case 'negro': return 'linear-gradient(135deg, #1A202C, #0A0E17)';
            case 'blue':
            case 'azul': return 'linear-gradient(135deg, #3182CE, #2B6CB0)';
            case 'red':
            case 'rojo': return 'linear-gradient(135deg, #E53E3E, #C53030)';
            case 'green':
            case 'verde': return 'linear-gradient(135deg, #48BB78, #38A169)';
            case 'yellow':
            case 'amarillo': return 'linear-gradient(135deg, #ECC94B, #D69E2E)';
            case 'pink':
            case 'rosa':
            case 'rosado': return 'linear-gradient(135deg, #F687B3, #ED64A6)';
            case 'purple':
            case 'violeta':
            case 'púrpura':
            case 'purpura': return 'linear-gradient(135deg, #9F7AEA, #805AD5)';
            case 'cyan':
            case 'celeste':
            case 'turquesa': return 'linear-gradient(135deg, #9DECF9, #0BC5EA)';
            case 'white':
            case 'blanco': return 'linear-gradient(135deg, #FFFFFF, #E2E8F0)';
            default:
                // Si es una palabra libre (ej. Fucsia, Esmeralda), calculamos un HSL dinámico a partir de un hash estable
                let hash = 0;
                for (let i = 0; i < clean.length; i++) {
                    hash = clean.charCodeAt(i) + ((hash << 5) - hash);
                }
                const hue = Math.abs(hash) % 360;
                return `linear-gradient(135deg, hsl(${hue}, 85%, 65%), hsl(${hue}, 85%, 45%))`;
        }
    }

    // Configurar controladores de eventos para pestañas de materiales
    materialTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            // Remover active de todas las pestañas
            materialTabs.forEach(t => t.classList.remove('active'));
            // Añadir active a la pestaña seleccionada
            tab.classList.add('active');
            
            const selectedMaterial = tab.getAttribute('data-material');
            switchMaterial(selectedMaterial);
        });
    });
    
    // Inicializar barras de progreso del material por defecto (PETG) con retardo suave
    setTimeout(() => {
        switchMaterial('petg');
    }, 400);

    // --- INTEGRACIÓN DE PEGADO/SUBIDA Y COMPRESIÓN DE CAPTURAS DE PANTALLA ---
    compressedImageBase64 = '';

    function processImageFile(file) {
        if (!file) return;

        let mime = file.type || '';
        const ext = file.name ? file.name.substring(file.name.lastIndexOf('.')).toLowerCase() : '';
        if (!mime && ext) {
            if (['.jpg', '.jpeg', '.jpe'].includes(ext)) mime = 'image/jpeg';
            else if (ext === '.png') mime = 'image/png';
            else if (ext === '.gif') mime = 'image/gif';
            else if (ext === '.webp') mime = 'image/webp';
            else if (ext === '.svg') mime = 'image/svg+xml';
            else if (ext === '.mp4') mime = 'video/mp4';
            else if (ext === '.webm') mime = 'video/webm';
            else if (ext === '.ogv') mime = 'video/ogg';
            else if (ext === '.mov') mime = 'video/quicktime';
        }

        console.log("📂 [DEBUG] Procesando archivo:", file.name, "MIME:", mime, "Tamaño:", file.size);

        if (!mime.startsWith('image/') && !mime.startsWith('video/')) {
            alert("⚠️ Formato de archivo no soportado. Por favor suba una imagen (JPG, PNG, GIF, WEBP) o video (MP4, WEBM).");
            return;
        }

        const reader = new FileReader();
        reader.onload = function(event) {
            const isVideoOrGif = mime.startsWith('video/') || mime === 'image/gif';
            if (isVideoOrGif) {
                let base64Data = event.target.result;
                if (base64Data.startsWith('data:application/octet-stream;')) {
                    base64Data = base64Data.replace('data:application/octet-stream;', `data:${mime};`);
                }
                
                if (!serverAvailable && base64Data.length > 2000000) {
                    alert("⚠️ El archivo multimedia supera los 2MB de límite en almacenamiento local (sin servidor). Suba un archivo más optimizado o inicie el servidor.");
                    return;
                }
                compressedImageBase64 = base64Data;
                
                const uploadPreviewContainer = document.getElementById('uploadPreviewContainer');
                const uploadPreviewImg = document.getElementById('uploadPreviewImg');
                const uploadPreviewVideo = document.getElementById('uploadPreviewVideo');
                if (uploadPreviewContainer) {
                    if (mime.startsWith('video/')) {
                        if (uploadPreviewImg) uploadPreviewImg.style.display = 'none';
                        if (uploadPreviewVideo) {
                            uploadPreviewVideo.src = compressedImageBase64;
                            uploadPreviewVideo.style.display = 'block';
                        }
                    } else {
                        if (uploadPreviewVideo) uploadPreviewVideo.style.display = 'none';
                        if (uploadPreviewImg) {
                            uploadPreviewImg.src = compressedImageBase64;
                            uploadPreviewImg.style.display = 'block';
                        }
                    }
                    uploadPreviewContainer.style.display = 'flex';
                }
                return;
            }

            const img = new Image();
            img.onload = function() {
                // Configurar canvas para redimensionar y comprimir la captura de pantalla
                const canvas = document.createElement('canvas');
                const maxDim = 320; // Dimensión máxima del catálogo para evitar bloqueos
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxDim) {
                        height = Math.round((height * maxDim) / width);
                        width = maxDim;
                    }
                } else {
                    if (height > maxDim) {
                        width = Math.round((width * maxDim) / height);
                        height = maxDim;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Comprimir como JPEG al 0.5 (calidad media, tamaño ínfimo < 15KB)
                compressedImageBase64 = canvas.toDataURL('image/jpeg', 0.5);

                // Mostrar previsualización
                const uploadPreviewContainer = document.getElementById('uploadPreviewContainer');
                const uploadPreviewImg = document.getElementById('uploadPreviewImg');
                const uploadPreviewVideo = document.getElementById('uploadPreviewVideo');
                if (uploadPreviewContainer) {
                    if (uploadPreviewVideo) uploadPreviewVideo.style.display = 'none';
                    if (uploadPreviewImg) {
                        uploadPreviewImg.src = compressedImageBase64;
                        uploadPreviewImg.style.display = 'block';
                    }
                    uploadPreviewContainer.style.display = 'flex';
                }
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }

    const imageUploadArea = document.getElementById('imageUploadArea');
    const newProdFileSelector = document.getElementById('newProdFileSelector');

    if (imageUploadArea && newProdFileSelector) {
        // Clic para abrir el selector
        imageUploadArea.addEventListener('click', () => {
            newProdFileSelector.click();
        });

        // Cambio del selector de archivos
        newProdFileSelector.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) processImageFile(file);
        });

        // Escuchar pegar Ctrl+V en el documento (solo si el creador está visible)
        document.addEventListener('paste', (e) => {
            if (adminCreatorPanel && adminCreatorPanel.style.display !== 'none') {
                const items = (e.clipboardData || e.originalEvent.clipboardData).items;
                for (let index in items) {
                    const item = items[index];
                    if (item.kind === 'file' && (item.type.startsWith('image/') || item.type.startsWith('video/'))) {
                        const blob = item.getAsFile();
                        processImageFile(blob);
                        break;
                    }
                }
            }
        });

        // Eventos de arrastre (Drag & Drop)
        ['dragenter', 'dragover'].forEach(eventName => {
            imageUploadArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                imageUploadArea.style.borderColor = 'var(--primary)';
                imageUploadArea.style.background = 'rgba(245, 101, 101, 0.08)';
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            imageUploadArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                imageUploadArea.style.borderColor = 'rgba(255,255,255,0.15)';
                imageUploadArea.style.background = 'rgba(0,0,0,0.15)';
            }, false);
        });

        imageUploadArea.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const file = dt.files[0];
            if (file) processImageFile(file);
        });
    }

    // --- EDICIÓN DINÁMICA DE IMÁGENES DEL CATÁLOGO PARA EL ADMINISTRADOR ---
    function getProductKeyFromImgId(imgId) {
        if (imgId.startsWith('img_')) {
            return imgId.replace('img_', ''); // es una llave de producto personalizado
        }
        const mapping = {
            'imgJabonera': 'jabonera',
            'imgPortarollo': 'portarollo',
            'imgOrganizador': 'organizador',
            'imgContenedor': 'contenedor',
            'imgOrganizadorModerno': 'organizador_moderno',
            'imgJugueteGato': 'juguete_gato'
        };
        return mapping[imgId] || null;
    }

    if (isAdmin) {
        // Seleccionar todas las imágenes/videos del catálogo
        const catalogThumbs = document.querySelectorAll('.catalog-thumb');
        catalogThumbs.forEach(thumb => {
            const key = getProductKeyFromImgId(thumb.id);
            if (key) {
                setupAdminMediaListeners(thumb, key);
            }
        });
    }

    // --- SISTEMA DE LOCALIZACIÓN INTERACTIVA DE PRODUCTOS (SCROLL IN SITU) ---
    const glowStyle = document.createElement('style');
    glowStyle.innerHTML = `
        @keyframes glowFlash {
            0% { box-shadow: 0 0 0 rgba(245, 101, 101, 0); border-color: var(--glass-border); }
            30% { box-shadow: 0 0 25px var(--primary), inset 0 0 15px rgba(245, 101, 101, 0.4); border-color: var(--primary); }
            100% { box-shadow: 0 0 0 rgba(245, 101, 101, 0); border-color: var(--glass-border); }
        }
        .highlighted-glow-effect {
            animation: glowFlash 2s ease-in-out;
            transform: scale(1.02);
            transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .summary-item-line {
            transition: background-color 0.3s ease, transform 0.3s ease, border-color 0.3s ease;
            border: 1px solid transparent;
        }
        .summary-item-line:hover {
            background-color: rgba(255, 255, 255, 0.05) !important;
            border-color: rgba(255, 255, 255, 0.1);
            transform: translateY(-2px);
        }
    `;
    document.head.appendChild(glowStyle);

    function getProductCardElement(key) {
        let el = document.querySelector(`[data-custom-key="${key}"]`);
        if (el) return el;
        
        const suffix = getOriginalSuffix(key);
        if (suffix) {
            const checkbox = document.getElementById(`check${suffix}`);
            if (checkbox) {
                return checkbox.closest('.product-selection-card');
            }
        }
        return null;
    }

    if (summaryItemsContainer) {
        summaryItemsContainer.addEventListener('click', (e) => {
            const line = e.target.closest('.summary-item-line');
            if (!line) return;
            const key = line.getAttribute('data-target-product-key');
            if (!key) return;
            
            const cardEl = getProductCardElement(key);
            if (cardEl) {
                cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                cardEl.classList.add('highlighted-glow-effect');
                setTimeout(() => {
                    cardEl.classList.remove('highlighted-glow-effect');
                }, 2000);
            }
        });
    }

    // Configurar enlaces estáticos de WhatsApp (botón flotante y footer)
    function setupStaticWhatsappLinks() {
        const floatWhatsappBtn = document.getElementById('floatingWhatsappBtn');
        if (floatWhatsappBtn) {
            floatWhatsappBtn.href = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent("¡Hola Gravity 3D! 🚀 Quisiera realizar una consulta sobre los productos del catálogo...")}`;
        }

        const footerWhatsappLink = document.querySelector('.footer-whatsapp-link');
        if (footerWhatsappLink) {
            footerWhatsappLink.href = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent("¡Hola Gravity 3D! 🚀 Quisiera recibir más información sobre el taller...")}`;
        }
    }

    // Inicialización del cálculo general y sincronización de precios al público/mayorista
    updateAllPricesInDOM();
    setupStaticWhatsappLinks();

    // --- SOPORTE PARA MENÚ DE NAVEGACIÓN MÓVIL ---
    function setupMobileMenu() {
        const mobileMenuBtn = document.getElementById('mobileMenuBtn');
        const navMenu = document.querySelector('.nav-menu');
        
        if (mobileMenuBtn && navMenu) {
            mobileMenuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                navMenu.classList.toggle('active');
                mobileMenuBtn.classList.toggle('active');
                
                // Cambiar icono entre barras y cruz
                const icon = mobileMenuBtn.querySelector('i');
                if (icon) {
                    if (navMenu.classList.contains('active')) {
                        icon.className = 'fa-solid fa-xmark';
                    } else {
                        icon.className = 'fa-solid fa-bars';
                    }
                }
            });

            // Cerrar menú al hacer clic en un enlace de navegación
            const navLinks = navMenu.querySelectorAll('.nav-link, .nav-btn');
            navLinks.forEach(link => {
                link.addEventListener('click', () => {
                    navMenu.classList.remove('active');
                    mobileMenuBtn.classList.remove('active');
                    const icon = mobileMenuBtn.querySelector('i');
                    if (icon) icon.className = 'fa-solid fa-bars';
                });
            });

            // Cerrar menú al hacer clic fuera de él
            document.addEventListener('click', (e) => {
                if (navMenu.classList.contains('active') && !navMenu.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
                    navMenu.classList.remove('active');
                    mobileMenuBtn.classList.remove('active');
                    const icon = mobileMenuBtn.querySelector('i');
                    if (icon) icon.className = 'fa-solid fa-bars';
                }
            });
        }
    }
    setupMobileMenu();
});
