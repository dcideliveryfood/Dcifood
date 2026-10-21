/**
 * Catálogo de Productos del Puesto Universitario (Costco)
 * y Datos Bancarios / Puntos de Entrega en el Campus.
 * Nota: Todos los precios ya incluyen el cargo por entrega en el campus.
 */

export const DATOS_PAGO = {
  banco: "BBVA México",
  beneficiario: "Alex",
  clabe: "012180015030010316",
  qrImagen: "./assets/qr-codi.png",
  telefonoCodi: "4778969542",
  whatsappVendedor: "524778969542", // Para botón de enviar comprobante
  instruccion: "Coloca tu código en el concepto de la transferencia"
};

export const PUNTOS_ENTREGA_SUGERIDOS = [
  "Afuera de Cafetería"
];

export const CONDIMENTOS_DISPONIBLES = [
  { id: "mayonesa", nombre: "Mayonesa" },
  { id: "mostaza", nombre: "Mostaza" },
  { id: "catsup", nombre: "Cátsup" },
  { id: "cebolla", nombre: "Cebolla" },
  { id: "jalapenos", nombre: "Jalapeños" },
  { id: "chile-quebrado", nombre: "Chile quebrado" }
];

export const REFRESCOS_600ML = [
  "Coca-Cola",
  "Coca Zero",
  "Fuze Tea Sin Azúcar",
  "Fanta Sin Azúcar",
  "Sprite Sin Azúcar",
  "Agua Mineral"
];

export const CATEGORIAS = [
  { id: "todos", nombre: "Todo el Menú", icono: "🍽️" },
  { id: "estrellas", nombre: "Productos Estrella", icono: "⭐" },
  { id: "calientes", nombre: "Food Court & Panadería", icono: "🥖" },
  { id: "pizzas-enteras", nombre: "Pizzas Enteras", icono: "📦" },
  { id: "bebidas", nombre: "Refrescos 600 ml", icono: "🥤" }
];

export const CATALOGO_PRODUCTOS = [
  // ================= PRODUCTOS ESTRELLA =================
  {
    id: "rebanada-pizza-pepperoni",
    nombre: "Rebanada de Pizza de Pepperoni",
    categoria: "estrellas",
    precio_unitario: 55,
    descripcion: "Rebanada gigante con pepperoni y extra queso ($50 rebanada + $5 de entrega incluidos).",
    emoji: "🍕",
    badge: "⭐ Estrella • $55",
    colorBg: "from-red-500/15 to-orange-500/10",
    permiteCondimentos: true,
    condimentosSugeridos: ["Chile quebrado", "Cátsup", "Jalapeños", "Mayonesa", "Mostaza", "Cebolla"]
  },
  {
    id: "rebanada-pizza-queso",
    nombre: "Rebanada de Pizza de Queso",
    categoria: "estrellas",
    precio_unitario: 55,
    descripcion: "Rebanada gigante mezcla de quesos gratinados ($50 rebanada + $5 de entrega incluidos).",
    emoji: "🧀",
    badge: "⭐ Estrella • $55",
    colorBg: "from-amber-500/15 to-yellow-500/10",
    permiteCondimentos: true,
    condimentosSugeridos: ["Chile quebrado", "Cátsup", "Jalapeños", "Mayonesa", "Mostaza", "Cebolla"]
  },
  {
    id: "hotdog-refresco-600",
    nombre: "Hot Dog Kirkland + Refresco 600 ml",
    categoria: "estrellas",
    precio_unitario: 35,
    descripcion: "Hot Dog Jumbo 100% de res + tu refresco de 600 ml a elegir ($30 combo + $5 de entrega).",
    emoji: "🌭",
    badge: "⭐ Estrella • $35",
    colorBg: "from-rose-600/15 to-amber-500/10",
    permiteElegirRefresco: true,
    permiteCondimentos: true,
    condimentosSugeridos: ["Mayonesa", "Mostaza", "Cátsup", "Cebolla", "Jalapeños", "Chile quebrado"]
  },

  // ================= FOOD COURT & PANADERÍA =================
  {
    id: "galleta-costco",
    nombre: "Galleta Gigante con Chispas de Chocolate",
    categoria: "calientes",
    precio_unitario: 45,
    descripcion: "Mega galleta recién horneada Double Chocolate Chunk tibia (incluye entrega).",
    emoji: "🍪",
    badge: "Favorito",
    colorBg: "from-amber-700/15 to-orange-600/10",
    permiteCondimentos: false
  },
  {
    id: "chicken-bake",
    nombre: "Chicken Bake Original",
    categoria: "calientes",
    precio_unitario: 100,
    descripcion: "Rollo horneado relleno de pechuga de pollo, tocino, aderezo César y parmesano (incluye entrega).",
    emoji: "🥖",
    badge: "Clásico",
    colorBg: "from-orange-500/15 to-amber-500/10",
    permiteCondimentos: true,
    condimentosSugeridos: ["Jalapeños", "Chile quebrado", "Cátsup", "Mayonesa", "Mostaza", "Cebolla"]
  },
  {
    id: "hojaldre-costco",
    nombre: "Hojaldre Relleno de Panadería",
    categoria: "calientes",
    precio_unitario: 100,
    descripcion: "Hojaldre recién horneado de panadería Costco, crujiente por fuera y suave por dentro (incluye entrega).",
    emoji: "🥐",
    badge: "Panadería",
    colorBg: "from-yellow-600/15 to-amber-500/10",
    permiteCondimentos: true,
    condimentosSugeridos: ["Jalapeños", "Mayonesa", "Mostaza", "Cátsup", "Cebolla", "Chile quebrado"]
  },

  // ================= PIZZAS ENTERAS ($225 + $20 entrega = $245) =================
  {
    id: "pizza-entera-pepperoni",
    nombre: "Pizza Entera de Pepperoni (18\")",
    categoria: "pizzas-enteras",
    precio_unitario: 245,
    descripcion: "Caja completa de pizza gigante de Pepperoni ideal para compartir ($225 pizza + $20 de entrega).",
    emoji: "📦",
    badge: "Familiar • $245",
    colorBg: "from-red-600/15 to-rose-500/10",
    permiteCondimentos: true,
    condimentosSugeridos: ["Chile quebrado", "Cátsup", "Jalapeños", "Mayonesa", "Mostaza", "Cebolla"]
  },
  {
    id: "pizza-entera-queso",
    nombre: "Pizza Entera de Queso (18\")",
    categoria: "pizzas-enteras",
    precio_unitario: 245,
    descripcion: "Caja completa de pizza gigante de Queso ideal para compartir ($225 pizza + $20 de entrega).",
    emoji: "📦",
    badge: "Familiar • $245",
    colorBg: "from-blue-600/15 to-indigo-500/10",
    permiteCondimentos: true,
    condimentosSugeridos: ["Chile quebrado", "Cátsup", "Jalapeños", "Mayonesa", "Mostaza", "Cebolla"]
  },

  // ================= REFRESCOS 600 ML ($15 + $5 entrega = $20) =================
  {
    id: "refresco-coca",
    nombre: "Coca-Cola Original 600 ml",
    categoria: "bebidas",
    precio_unitario: 20,
    descripcion: "Botella de 600 ml bien fría conservada en hielera (incluye $5 de entrega).",
    emoji: "🥤",
    badge: "600 ml",
    colorBg: "from-red-600/15 to-slate-500/10",
    permiteCondimentos: false
  },
  {
    id: "refresco-coca-zero",
    nombre: "Coca-Cola Zero (Sin Azúcar) 600 ml",
    categoria: "bebidas",
    precio_unitario: 20,
    descripcion: "Botella de 600 ml sin azúcar bien fría en hielera (incluye $5 de entrega).",
    emoji: "🖤",
    badge: "Sin azúcar",
    colorBg: "from-slate-700/15 to-slate-500/10",
    permiteCondimentos: false
  },
  {
    id: "refresco-fuze-tea",
    nombre: "Fuze Tea Sin Azúcar 600 ml",
    categoria: "bebidas",
    precio_unitario: 20,
    descripcion: "Té helado Fuze Tea de 600 ml sin azúcar bien frío (incluye $5 de entrega).",
    emoji: "🧋",
    badge: "Sin azúcar",
    colorBg: "from-amber-600/15 to-emerald-500/10",
    permiteCondimentos: false
  },
  {
    id: "refresco-fanta",
    nombre: "Fanta Sin Azúcar 600 ml",
    categoria: "bebidas",
    precio_unitario: 20,
    descripcion: "Refresco sabor naranja Fanta 600 ml sin azúcar bien frío (incluye $5 de entrega).",
    emoji: "🍊",
    badge: "Sin azúcar",
    colorBg: "from-orange-500/15 to-amber-500/10",
    permiteCondimentos: false
  },
  {
    id: "refresco-sprite",
    nombre: "Sprite Sin Azúcar 600 ml",
    categoria: "bebidas",
    precio_unitario: 20,
    descripcion: "Refresco lima-limón Sprite 600 ml sin azúcar bien frío (incluye $5 de entrega).",
    emoji: "🍋",
    badge: "Sin azúcar",
    colorBg: "from-emerald-500/15 to-teal-500/10",
    permiteCondimentos: false
  },
  {
    id: "refresco-agua-mineral",
    nombre: "Agua Mineral 600 ml",
    categoria: "bebidas",
    precio_unitario: 20,
    descripcion: "Agua mineral gasificada de 600 ml bien fría en hielera (incluye $5 de entrega).",
    emoji: "🫧",
    badge: "600 ml",
    colorBg: "from-sky-500/15 to-cyan-500/10",
    permiteCondimentos: false
  }
];
