/**
 * Configuración de Firebase (Firestore) y Capa de Datos Reactiva
 * Soporta conexión real a Cloud Firestore (SDK Modular v10) y modo Demo Local
 * sincronizado en tiempo real entre pestañas (BroadcastChannel + localStorage)
 * mientras configuras tus credenciales de Firebase.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore,
  doc,
  collection,
  onSnapshot,
  setDoc,
  addDoc,
  updateDoc,
  getDoc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// ============================================================================
// 1. CREDENCIALES DE FIREBASE (Reemplaza con los datos de tu consola Firebase)
// ============================================================================
export const firebaseConfig = {
  apiKey: "AIzaSyDcI_8fYkpC5sqS1bL-Ua6Y2aH5U6t2deI",
  authDomain: "costco-campus.firebaseapp.com",
  projectId: "costco-campus",
  storageBucket: "costco-campus.firebasestorage.app",
  messagingSenderId: "739941276459",
  appId: "1:739941276459:web:e4acd6717142e90adc836e"
};

// Constantes de esquema Firestore
export const COLECCION_CONFIG = "config";
export const DOC_TIENDA = "tienda";
export const COLECCION_PEDIDOS = "pedidos";

// Claves para respaldo local / modo demo interactivo
const LS_CONFIG_KEY = "costco_uni_config_tienda_v1";
const LS_PEDIDOS_KEY = "costco_uni_pedidos_v1";
const LS_FIREBASE_OVERRIDE_KEY = "costco_uni_firebase_config_override";

const syncChannel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("costco_uni_realtime_sync")
    : null;

const localConfigListeners = new Set();
const localPedidosListeners = new Set();
const localSingleOrderListeners = new Map(); // id_pedido -> Set<callback>

// Configuración inicial por defecto para 'config/tienda'
export const DEFAULT_TIENDA_CONFIG = {
  estado: "abierto", // 'abierto' | 'en_camino' | 'en_clase' | 'cerrado'
  aviso_personalizado: "¡Pedidos abiertos! Entregas hoy afuera de cafetería 🍕",
  hora_corte: "13:30"
};

/**
 * Obtiene la configuración de Firebase activa (código o guardada en el navegador).
 */
export function obtenerFirebaseConfigActiva() {
  try {
    const guardada = localStorage.getItem(LS_FIREBASE_OVERRIDE_KEY);
    if (guardada) {
      const parsed = JSON.parse(guardada);
      if (parsed && parsed.apiKey && parsed.apiKey !== "TU_API_KEY" && parsed.projectId) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("No se pudo leer configuración de Firebase guardada:", e);
  }
  return firebaseConfig;
}

/**
 * Permite guardar la configuración de Firebase desde el Panel Admin y recargar.
 */
export function guardarFirebaseConfigEnNavegador(configObj) {
  localStorage.setItem(LS_FIREBASE_OVERRIDE_KEY, JSON.stringify(configObj));
}

export function limpiarFirebaseConfigEnNavegador() {
  localStorage.removeItem(LS_FIREBASE_OVERRIDE_KEY);
}

const activeConfig = obtenerFirebaseConfigActiva();
export const isDemoMode =
  !activeConfig.apiKey ||
  activeConfig.apiKey === "TU_API_KEY" ||
  activeConfig.projectId === "tu-proyecto";

let app = null;
let db = null;

if (!isDemoMode) {
  try {
    app = initializeApp(activeConfig);
    db = getFirestore(app);
    console.log("✅ Conectado a Firebase Firestore:", activeConfig.projectId);
  } catch (error) {
    console.error("❌ Error inicializando Firebase, activando modo local de respaldo:", error);
  }
} else {
  console.info(
    "⚡ Modo Demo Local Activo (Sincronizado en tiempo real entre pestañas). Configura js/firebase-config.js para usar Cloud Firestore."
  );
  inicializarDatosDemoSiVacio();
}

// ============================================================================
// 2. MOTOR LOCAL REACTIVO (Solo cuando aún no se configura Firebase)
// ============================================================================
function inicializarDatosDemoSiVacio() {
  if (!localStorage.getItem(LS_CONFIG_KEY)) {
    localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(DEFAULT_TIENDA_CONFIG));
  }
  if (!localStorage.getItem(LS_PEDIDOS_KEY)) {
    const ahora = Date.now();
    const pedidosEjemplo = [
      {
        docId: "demo-1",
        id_pedido: "ORD-4821",
        cliente: {
          nombre: "Valeria Morales",
          whatsapp: "5541239876",
          facultad_edificio: "Facultad de Ingeniería - Entrada Principal"
        },
        items: [
          {
            id: "rebanada-pizza-pepperoni",
            nombre: "Rebanada de Pizza de Pepperoni (Con: Chile quebrado, Cátsup)",
            cantidad: 2,
            precio_unitario: 25,
            subtotal: 50,
            condimentos: ["Chile quebrado", "Cátsup"]
          },
          {
            id: "galleta-costco",
            nombre: "Galleta Gigante con Chispas de Chocolate",
            cantidad: 1,
            precio_unitario: 45,
            subtotal: 45,
            condimentos: []
          }
        ],
        total: 95,
        estatus: "pendiente",
        clave_rastreo: "BBVA-992831",
        timestampMs: ahora - 1000 * 60 * 8
      },
      {
        docId: "demo-2",
        id_pedido: "ORD-7391",
        cliente: {
          nombre: "Diego Hernández",
          whatsapp: "5587651234",
          facultad_edificio: "Biblioteca Central - Escalones"
        },
        items: [
          {
            id: "hotdog-refresco-600",
            nombre: "Hot Dog Kirkland + Coca Zero 600 ml (Con: Mostaza, Cátsup, Cebolla, Jalapeños)",
            cantidad: 1,
            precio_unitario: 35,
            subtotal: 35,
            bebida: "Coca Zero",
            condimentos: ["Mostaza", "Cátsup", "Cebolla", "Jalapeños"]
          },
          {
            id: "chicken-bake",
            nombre: "Chicken Bake Original (Con: Jalapeños)",
            cantidad: 1,
            precio_unitario: 100,
            subtotal: 100,
            condimentos: ["Jalapeños"]
          }
        ],
        total: 135,
        estatus: "aprobado",
        clave_rastreo: "NU-77310",
        timestampMs: ahora - 1000 * 60 * 24
      },
      {
        docId: "demo-3",
        id_pedido: "ORD-3109",
        cliente: {
          nombre: "Sofía Ramírez",
          whatsapp: "5539012288",
          facultad_edificio: "Facultad de Medicina - Bancas"
        },
        items: [
          {
            id: "pizza-entera-pepperoni",
            nombre: "Pizza Entera de Pepperoni (18\") (Con: Chile quebrado, Jalapeños)",
            cantidad: 1,
            precio_unitario: 245,
            subtotal: 245,
            condimentos: ["Chile quebrado", "Jalapeños"]
          }
        ],
        total: 245,
        estatus: "entregado",
        clave_rastreo: "CODI-5519",
        timestampMs: ahora - 1000 * 60 * 52
      }
    ];
    localStorage.setItem(LS_PEDIDOS_KEY, JSON.stringify(pedidosEjemplo));
  }
}

function leerConfigLocal() {
  try {
    const raw = localStorage.getItem(LS_CONFIG_KEY);
    return raw ? { ...DEFAULT_TIENDA_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_TIENDA_CONFIG };
  } catch {
    return { ...DEFAULT_TIENDA_CONFIG };
  }
}

function leerPedidosLocales() {
  try {
    const raw = localStorage.getItem(LS_PEDIDOS_KEY);
    const lista = raw ? JSON.parse(raw) : [];
    return lista.sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
  } catch {
    return [];
  }
}

function notificarCambioConfigLocal() {
  const cfg = leerConfigLocal();
  localConfigListeners.forEach((cb) => cb(cfg));
}

function notificarCambioPedidosLocal() {
  const pedidos = leerPedidosLocales();
  localPedidosListeners.forEach((cb) => cb(pedidos));
  localSingleOrderListeners.forEach((callbacks, idPedido) => {
    const encontrado = pedidos.find((p) => p.id_pedido === idPedido) || null;
    callbacks.forEach((cb) => cb(encontrado));
  });
}

if (syncChannel) {
  syncChannel.addEventListener("message", (event) => {
    if (event.data?.type === "CONFIG_UPDATED") {
      notificarCambioConfigLocal();
    } else if (event.data?.type === "PEDIDOS_UPDATED") {
      notificarCambioPedidosLocal();
    }
  });
}

window.addEventListener("storage", (event) => {
  if (event.key === LS_CONFIG_KEY) notificarCambioConfigLocal();
  if (event.key === LS_PEDIDOS_KEY) notificarCambioPedidosLocal();
});

// ============================================================================
// 3. FUNCIONES PÚBLICAS DE ACCESO A DATOS (FIRESTORE + FALLBACK)
// ============================================================================

/**
 * Escucha en tiempo real el documento 'config/tienda'.
 * Si no existe aún en Firestore, lo inicializa automáticamente con valores por defecto.
 *
 * @param {(config: {estado: string, aviso_personalizado: string, hora_corte: string}) => void} callback
 * @returns {() => void} Función para cancelar suscripción
 */
export function escucharConfigTienda(callback) {
  if (db) {
    const tiendaRef = doc(db, COLECCION_CONFIG, DOC_TIENDA);
    return onSnapshot(
      tiendaRef,
      async (snapshot) => {
        if (snapshot.exists()) {
          callback({ ...DEFAULT_TIENDA_CONFIG, ...snapshot.data() });
        } else {
          try {
            await setDoc(tiendaRef, DEFAULT_TIENDA_CONFIG);
          } catch (e) {
            console.warn("No se pudo crear documento inicial config/tienda:", e);
          }
          callback({ ...DEFAULT_TIENDA_CONFIG });
        }
      },
      (error) => {
        console.error("Error escuchando config/tienda en Firestore:", error);
        callback(leerConfigLocal());
      }
    );
  }

  // Modo Demo Local
  localConfigListeners.add(callback);
  callback(leerConfigLocal());
  return () => localConfigListeners.delete(callback);
}

/**
 * Actualiza el documento 'config/tienda' en Firestore.
 *
 * @param {Partial<{estado: string, aviso_personalizado: string, hora_corte: string}>} nuevosDatos
 */
export async function actualizarConfigTienda(nuevosDatos) {
  if (db) {
    const tiendaRef = doc(db, COLECCION_CONFIG, DOC_TIENDA);
    await setDoc(tiendaRef, nuevosDatos, { merge: true });
    return;
  }

  // Modo Demo Local
  const actual = leerConfigLocal();
  const actualizado = { ...actual, ...nuevosDatos };
  localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(actualizado));
  notificarCambioConfigLocal();
  syncChannel?.postMessage({ type: "CONFIG_UPDATED" });
}

/**
 * Crea un nuevo documento en la colección 'pedidos' de Firestore.
 * Cumple exactamente con el esquema:
 * - id_pedido: string (ej. "ORD-7391")
 * - cliente: { nombre, whatsapp, facultad_edificio }
 * - items: [{ id, nombre, cantidad, precio_unitario, subtotal, condimentos?, bebida? }]
 * - total: number
 * - estatus: 'pendiente' | 'aprobado' | 'entregado' | 'cancelado'
 * - clave_rastreo: string (opcional del cliente)
 * - timestamp: serverTimestamp()
 *
 * @param {Object} datosPedido
 * @returns {Promise<Object>} Pedido creado
 */
export async function crearPedidoEnFirestore(datosPedido) {
  const payloadBase = {
    id_pedido: datosPedido.id_pedido,
    cliente: {
      nombre: datosPedido.cliente.nombre.trim(),
      whatsapp: datosPedido.cliente.whatsapp.trim(),
      facultad_edificio: datosPedido.cliente.facultad_edificio.trim()
    },
    items: datosPedido.items.map((item) => ({
      id: item.id,
      nombre: item.nombre,
      cantidad: Number(item.cantidad),
      precio_unitario: Number(item.precio_unitario),
      subtotal: Number(item.subtotal),
      condimentos: Array.isArray(item.condimentos) ? item.condimentos : [],
      bebida: item.bebida || null
    })),
    total: Number(datosPedido.total),
    estatus: "pendiente",
    clave_rastreo: (datosPedido.clave_rastreo || "").trim(),
    comprobante_url: (datosPedido.comprobante_url || "").trim()
  };

  if (db) {
    const pedidosRef = collection(db, COLECCION_PEDIDOS);
    const docRef = await addDoc(pedidosRef, {
      ...payloadBase,
      timestamp: serverTimestamp()
    });
    return {
      docId: docRef.id,
      ...payloadBase,
      timestampMs: Date.now()
    };
  }

  // Modo Demo Local
  const nuevoPedido = {
    docId: "local-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    ...payloadBase,
    timestampMs: Date.now()
  };

  const pedidos = leerPedidosLocales();
  pedidos.unshift(nuevoPedido);
  localStorage.setItem(LS_PEDIDOS_KEY, JSON.stringify(pedidos));
  notificarCambioPedidosLocal();
  syncChannel?.postMessage({ type: "PEDIDOS_UPDATED" });
  return nuevoPedido;
}

/**
 * Normaliza un documento de Firestore para tener siempre timestampMs numérico.
 */
function normalizarPedidoFirestore(docSnap) {
  const data = docSnap.data();
  let timestampMs = Date.now();
  if (data.timestamp && typeof data.timestamp.toMillis === "function") {
    timestampMs = data.timestamp.toMillis();
  } else if (typeof data.timestampMs === "number") {
    timestampMs = data.timestampMs;
  }
  return {
    docId: docSnap.id,
    ...data,
    timestampMs
  };
}

/**
 * Escucha todos los pedidos en tiempo real (ordenados del más reciente al más antiguo).
 *
 * @param {(pedidos: Array<Object>) => void} callback
 * @returns {() => void} Función para cancelar suscripción
 */
export function escucharPedidos(callback) {
  if (db) {
    const pedidosRef = collection(db, COLECCION_PEDIDOS);
    const q = query(pedidosRef, orderBy("timestamp", "desc"));
    return onSnapshot(
      q,
      (querySnapshot) => {
        const lista = [];
        querySnapshot.forEach((docSnap) => {
          lista.push(normalizarPedidoFirestore(docSnap));
        });
        callback(lista);
      },
      (error) => {
        console.error("Error escuchando colección 'pedidos':", error);
      }
    );
  }

  // Modo Demo Local
  localPedidosListeners.add(callback);
  callback(leerPedidosLocales());
  return () => localPedidosListeners.delete(callback);
}

/**
 * Escucha un pedido específico por su código `id_pedido` (ej. "ORD-7391") en tiempo real
 * para actualizar la pantalla de espera del estudiante cuando el admin lo aprueba o entrega.
 *
 * @param {string} idPedido
 * @param {(pedido: Object | null) => void} callback
 * @returns {() => void}
 */
export function escucharPedidoPorCodigo(idPedido, callback) {
  const codigoLimpio = (idPedido || "").trim().toUpperCase();

  if (db) {
    return escucharPedidos((todos) => {
      const encontrado =
        todos.find((p) => (p.id_pedido || "").toUpperCase() === codigoLimpio) || null;
      callback(encontrado);
    });
  }

  if (!localSingleOrderListeners.has(codigoLimpio)) {
    localSingleOrderListeners.set(codigoLimpio, new Set());
  }
  const set = localSingleOrderListeners.get(codigoLimpio);
  set.add(callback);

  const actual =
    leerPedidosLocales().find((p) => (p.id_pedido || "").toUpperCase() === codigoLimpio) || null;
  callback(actual);

  return () => {
    set.delete(callback);
  };
}

/**
 * Actualiza el estatus de un pedido ('pendiente' | 'aprobado' | 'entregado' | 'cancelado').
 *
 * @param {string} docId - ID del documento en Firestore
 * @param {'pendiente' | 'aprobado' | 'entregado' | 'cancelado'} nuevoEstatus
 */
export async function actualizarEstatusPedido(docId, nuevoEstatus) {
  if (db) {
    const pedidoRef = doc(db, COLECCION_PEDIDOS, docId);
    await updateDoc(pedidoRef, { estatus: nuevoEstatus });
    return;
  }

  // Modo Demo Local
  const pedidos = leerPedidosLocales();
  const idx = pedidos.findIndex((p) => p.docId === docId || p.id_pedido === docId);
  if (idx !== -1) {
    pedidos[idx].estatus = nuevoEstatus;
    localStorage.setItem(LS_PEDIDOS_KEY, JSON.stringify(pedidos));
    notificarCambioPedidosLocal();
    syncChannel?.postMessage({ type: "PEDIDOS_UPDATED" });
  }
}

/**
 * Genera un código único de seguimiento en formato ORD-XXXX (4 dígitos).
 * @returns {string}
 */
export function generarCodigoPedido() {
  const numero = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${numero}`;
}
