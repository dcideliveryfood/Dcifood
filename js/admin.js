/**
 * Lógica del Panel de Administración / Dashboard (admin.js)
 * - Panel de control de estados ('abierto' | 'en_camino' | 'en_clase' | 'cerrado') y aviso público
 * - Tablero Kanban reactivo en tiempo real ("Pendientes por validar", "En preparación", "Completados")
 * - Botones directos para cambiar estatus a "Aprobado", "Entregado" o "Cancelado"
 * - Módulo de métricas: Total en caja ($ del día), órdenes y ranking de productos más vendidos
 * - Exportación de pedidos del día en formato JSON y CSV
 */

import {
  escucharConfigTienda,
  actualizarConfigTienda,
  escucharPedidos,
  actualizarEstatusPedido,
  isDemoMode
} from "./firebase-config.js";
import {
  obtenerCredencialesTelegram,
  guardarCredencialesTelegram,
  enviarNotificacionTelegram,
  sincronizarCredencialesDesdeConfig
} from "./telegram.js";

let configActual = {
  estado: "abierto",
  aviso_personalizado: "",
  hora_corte: "13:30"
};

let listaPedidos = [];
let filtroBusqueda = "";
let incluirCancelados = false;

const dom = {
  connectionPill: document.getElementById("admin-connection-pill"),
  toastGuardado: document.getElementById("toast-guardado"),
  statusSwitchBtns: document.querySelectorAll(".status-switch-btn"),
  formConfigTienda: document.getElementById("form-config-tienda"),
  inputAvisoPublico: document.getElementById("input-aviso-publico"),
  inputHoraCorte: document.getElementById("input-hora-corte"),
  presetNoticeBtns: document.querySelectorAll(".preset-notice-btn"),

  // Métricas
  kpiTotalCaja: document.getElementById("kpi-total-caja"),
  kpiPendienteValidarMonto: document.getElementById("kpi-pendiente-validar-monto"),
  kpiTotalOrdenes: document.getElementById("kpi-total-ordenes"),
  kpiDesgloseOrdenes: document.getElementById("kpi-desglose-ordenes"),
  kpiTotalUnidades: document.getElementById("kpi-total-unidades"),
  topProductosLista: document.getElementById("top-productos-lista"),
  btnExportarCsv: document.getElementById("btn-exportar-csv"),
  btnExportarJson: document.getElementById("btn-exportar-json"),

  // Kanban
  chkMostrarCancelados: document.getElementById("chk-mostrar-cancelados"),
  inputBuscarKanban: document.getElementById("input-buscar-kanban"),
  countColPendiente: document.getElementById("count-col-pendiente"),
  countColAprobado: document.getElementById("count-col-aprobado"),
  countColCompletado: document.getElementById("count-col-completado"),
  colPendiente: document.getElementById("col-pendiente"),
  colAprobado: document.getElementById("col-aprobado"),
  colCompletado: document.getElementById("col-completado"),

  // Modal Telegram
  btnAbrirModalTelegram: document.getElementById("btn-abrir-modal-telegram"),
  modalTelegramConfig: document.getElementById("modal-telegram-config"),
  btnCerrarModalTg: document.getElementById("btn-cerrar-modal-tg"),
  formTelegramConfig: document.getElementById("form-telegram-config"),
  inputTgToken: document.getElementById("input-tg-token"),
  inputTgChatId: document.getElementById("input-tg-chatid"),
  tgTestFeedback: document.getElementById("tg-test-feedback"),
  btnProbarTelegram: document.getElementById("btn-probar-telegram"),

  // Seguridad PIN y Acciones Telegram
  btnBloquearPanel: document.getElementById("btn-bloquear-panel"),
  pinLockOverlay: document.getElementById("pin-lock-overlay"),
  formPinLogin: document.getElementById("form-pin-login"),
  inputPinAcceso: document.getElementById("input-pin-acceso"),
  pinErrorMsg: document.getElementById("pin-error-msg"),
  telegramActionBanner: document.getElementById("telegram-action-banner"),
  telegramActionTitle: document.getElementById("telegram-action-title"),
  telegramActionDesc: document.getElementById("telegram-action-desc"),
  btnCerrarBannerTelegram: document.getElementById("btn-cerrar-banner-telegram"),

  // Modal Visor de Comprobante
  modalVisorComprobante: document.getElementById("modal-visor-comprobante"),
  visorComprobanteTitulo: document.getElementById("visor-comprobante-titulo"),
  visorComprobanteSubtitulo: document.getElementById("visor-comprobante-subtitulo"),
  visorComprobanteImg: document.getElementById("visor-comprobante-img"),
  btnDescargarComprobante: document.getElementById("btn-descargar-comprobante"),
  btnCerrarVisorComprobante: document.getElementById("btn-cerrar-visor-comprobante"),
  btnCerrarVisorFooter: document.getElementById("btn-cerrar-visor-footer")
};

const PIN_STORAGE_KEY = "costco_admin_pin";
const SESSION_UNLOCKED_KEY = "costco_admin_unlocked";
const PIN_POR_DEFECTO = "2026";
let accionTelegramPendienteProcesada = false;

function estaDesbloqueado() {
  return sessionStorage.getItem(SESSION_UNLOCKED_KEY) === "true";
}

function verificarPinBloqueo() {
  if (estaDesbloqueado()) {
    dom.pinLockOverlay.classList.add("hidden");
  } else {
    dom.pinLockOverlay.classList.remove("hidden");
    dom.inputPinAcceso.value = "";
    dom.pinErrorMsg.classList.add("hidden");
    setTimeout(() => dom.inputPinAcceso?.focus(), 300);
  }
}

function bloquearPanel() {
  sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
  verificarPinBloqueo();
}

/**
 * Procesa acciones automáticas enviadas desde los botones de Telegram
 * Ej: admin.html?accion=aprobar&id=ORD-7391
 */
async function procesarAccionTelegram() {
  if (accionTelegramPendienteProcesada) return;

  const urlParams = new URLSearchParams(window.location.search);
  const accion = urlParams.get("accion");
  const idPedido = urlParams.get("id");
  const buscar = urlParams.get("buscar");

  if (buscar && dom.inputBuscarKanban) {
    dom.inputBuscarKanban.value = buscar;
    filtroBusqueda = buscar;
    renderizarTableroKanban();
  }

  if (idPedido && (accion === "aprobar" || accion === "entregar")) {
    const pedido = listaPedidos.find(
      (p) => (p.id_pedido || "").toUpperCase() === idPedido.toUpperCase()
    );

    if (pedido) {
      accionTelegramPendienteProcesada = true;
      const nuevoEstatus = accion === "aprobar" ? "aprobado" : "entregado";

      try {
        await actualizarEstatusPedido(pedido.docId, nuevoEstatus);
        mostrarBannerAccionTelegram(
          `⚡ Pedido ${pedido.id_pedido} marcado como ${nuevoEstatus.toUpperCase()}`,
          `Cliente: ${pedido.cliente?.nombre || ""} (${pedido.cliente?.facultad_edificio || ""}) • Total: $${pedido.total}`
        );
      } catch (err) {
        console.error("Error ejecutando acción de Telegram:", err);
      }

      // Limpiar URL para evitar reejecutar al refrescar
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }
}

function mostrarBannerAccionTelegram(titulo, desc) {
  if (!dom.telegramActionBanner) return;
  dom.telegramActionTitle.textContent = titulo;
  dom.telegramActionDesc.textContent = desc;
  dom.telegramActionBanner.classList.remove("hidden");
  dom.telegramActionBanner.scrollIntoView({ behavior: "smooth", block: "start" });
}

function iniciarAdmin() {
  verificarPinBloqueo();

  if (isDemoMode) {
    dom.connectionPill.textContent = "Modo Demo Local (Sincronizado)";
    dom.connectionPill.className =
      "text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/40";
  }

  registrarEventosAdmin();

  // 1. Escuchar 'config/tienda' en tiempo real
  escucharConfigTienda((cfg) => {
    configActual = cfg;
    sincronizarCredencialesDesdeConfig(cfg);
    renderizarControlesEstado(cfg);
  });

  // 2. Escuchar colección 'pedidos' en tiempo real
  escucharPedidos((pedidos) => {
    listaPedidos = pedidos;
    renderizarMetricasDelDia();
    renderizarTableroKanban();
    procesarAccionTelegram();
  });
}

/**
 * Muestra notificación breve de guardado exitoso
 */
function mostrarToastGuardado() {
  dom.toastGuardado.classList.remove("hidden");
  clearTimeout(mostrarToastGuardado._timer);
  mostrarToastGuardado._timer = setTimeout(() => {
    dom.toastGuardado.classList.add("hidden");
  }, 2600);
}

/**
 * Actualiza visualmente los switches de estado y los campos de texto
 */
function renderizarControlesEstado(cfg) {
  const estilosActivos = {
    abierto: "border-emerald-600 bg-emerald-50 text-emerald-950 shadow-sm ring-2 ring-emerald-500/20",
    en_camino: "border-costcoBlue bg-blue-50 text-blue-950 shadow-sm ring-2 ring-costcoBlue/20",
    en_clase: "border-amber-500 bg-amber-50 text-amber-950 shadow-sm ring-2 ring-amber-500/20",
    entregando: "border-rose-600 bg-rose-50 text-rose-950 shadow-sm ring-2 ring-rose-500/20",
    cerrado: "border-indigo-600 bg-indigo-50 text-indigo-950 shadow-sm ring-2 ring-indigo-500/20"
  };

  const estiloInactivo =
    "border-slate-200 bg-slate-50/70 hover:bg-slate-100 text-slate-600";

  dom.statusSwitchBtns.forEach((btn) => {
    const est = btn.dataset.estado;
    btn.className = `status-switch-btn rounded-2xl border-2 p-3.5 text-left transition flex items-start gap-3 ${
      est === cfg.estado ? estilosActivos[est] || estilosActivos.abierto : estiloInactivo
    }`;
  });

  if (document.activeElement !== dom.inputAvisoPublico) {
    dom.inputAvisoPublico.value = cfg.aviso_personalizado || "";
  }
  if (document.activeElement !== dom.inputHoraCorte) {
    dom.inputHoraCorte.value = cfg.hora_corte || "13:30";
  }
}

/**
 * Verifica si un timestamp pertenece al día de hoy (hora local)
 */
function esPedidoDeHoy(pedido) {
  if (!pedido.timestampMs) return true;
  const fechaPedido = new Date(pedido.timestampMs);
  const hoy = new Date();
  return (
    fechaPedido.getFullYear() === hoy.getFullYear() &&
    fechaPedido.getMonth() === hoy.getMonth() &&
    fechaPedido.getDate() === hoy.getDate()
  );
}

/**
 * Calcula y renderiza las métricas del día:
 * - Total en caja ($ de órdenes aprobadas + entregadas)
 * - Monto pendiente por validar
 * - Número de órdenes y desglose de productos más vendidos
 */
function renderizarMetricasDelDia() {
  const pedidosHoy = listaPedidos.filter(esPedidoDeHoy);

  let totalEnCaja = 0;
  let montoPendienteValidar = 0;
  let ordenesValidas = 0;
  let ordenesEntregadas = 0;
  let ordenesActivas = 0;

  const conteoProductos = new Map(); // id -> { nombre, cantidad, ingresos }
  let totalUnidadesVendidas = 0;

  pedidosHoy.forEach((p) => {
    const monto = Number(p.total || 0);
    if (p.estatus === "pendiente") {
      montoPendienteValidar += monto;
      ordenesActivas++;
      ordenesValidas++;
    } else if (p.estatus === "aprobado") {
      totalEnCaja += monto;
      ordenesActivas++;
      ordenesValidas++;
    } else if (p.estatus === "entregado") {
      totalEnCaja += monto;
      ordenesEntregadas++;
      ordenesValidas++;
    }

    // Contabilizar productos de pedidos no cancelados
    if (p.estatus !== "cancelado" && Array.isArray(p.items)) {
      p.items.forEach((item) => {
        const key = item.id || item.nombre;
        const actual = conteoProductos.get(key) || {
          nombre: item.nombre,
          cantidad: 0,
          ingresos: 0
        };
        actual.cantidad += Number(item.cantidad || 0);
        actual.ingresos += Number(item.subtotal || 0);
        conteoProductos.set(key, actual);
        totalUnidadesVendidas += Number(item.cantidad || 0);
      });
    }
  });

  dom.kpiTotalCaja.textContent = `$${totalEnCaja.toLocaleString("es-MX")}`;
  dom.kpiPendienteValidarMonto.textContent =
    montoPendienteValidar > 0
      ? `+$${montoPendienteValidar.toLocaleString("es-MX")} en pendientes por validar`
      : "Sin pagos pendientes por validar";

  dom.kpiTotalOrdenes.textContent = String(ordenesValidas);
  const pedidosManana = pedidosHoy.filter((p) => p.programacion_entrega === "manana").length;
  const pedidosHoySurtido = pedidosHoy.length - pedidosManana;
  dom.kpiDesgloseOrdenes.textContent = `${ordenesEntregadas} entregadas • ${ordenesActivas} activas (⚡ ${pedidosHoySurtido} hoy / 📅 ${pedidosManana} mañana)`;
  dom.kpiTotalUnidades.textContent = `${totalUnidadesVendidas} pzas`;

  // Ranking de productos más vendidos
  const ranking = Array.from(conteoProductos.values()).sort(
    (a, b) => b.cantidad - a.cantidad
  );

  dom.topProductosLista.innerHTML = "";
  if (ranking.length === 0) {
    dom.topProductosLista.innerHTML = `
      <p class="text-xs text-slate-400 py-6 text-center">
        Aún no hay productos vendidos en el corte de hoy.
      </p>
    `;
    return;
  }

  const maxCantidad = ranking[0].cantidad || 1;
  ranking.forEach((prod, index) => {
    const porcentaje = Math.max(8, Math.round((prod.cantidad / maxCantidad) * 100));
    const itemDiv = document.createElement("div");
    itemDiv.className = "text-xs space-y-1";
    itemDiv.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <span class="font-bold text-slate-800 truncate">
          <span class="text-slate-400 font-mono-code mr-1">#${index + 1}</span>${prod.nombre}
        </span>
        <span class="shrink-0 font-mono-code font-bold text-slate-700">
          ${prod.cantidad} pzas <span class="text-slate-400">($${prod.ingresos})</span>
        </span>
      </div>
      <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div class="h-full bg-costcoRed rounded-full" style="width: ${porcentaje}%"></div>
      </div>
    `;
    dom.topProductosLista.appendChild(itemDiv);
  });
}

/**
 * Formatea el timestamp del pedido a HH:MM
 */
function formatearHora(timestampMs) {
  if (!timestampMs) return "--:--";
  return new Date(timestampMs).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

/**
 * Crea el elemento HTML de una tarjeta de pedido para el Kanban
 */
function crearTarjetaPedidoKanban(pedido) {
  const card = document.createElement("article");
  const esCancelado = pedido.estatus === "cancelado";

  card.className = `bg-white rounded-2xl border ${
    esCancelado ? "border-rose-200 opacity-75" : "border-slate-200"
  } p-4 shadow-sm space-y-3 transition`;

  const hora = formatearHora(pedido.timestampMs);
  const telefonoLimpio = (pedido.cliente?.whatsapp || "").replace(/\D/g, "");
  const textoWa = encodeURIComponent(
    `¡Hola ${pedido.cliente?.nombre || ""}! Te escribimos de *Costco Express DCI* sobre tu pedido *${pedido.id_pedido}* ($${pedido.total}) para entregar en *${pedido.cliente?.facultad_edificio}*.`
  );
  const urlWhatsapp = telefonoLimpio
    ? `https://wa.me/52${telefonoLimpio}?text=${textoWa}`
    : "#";

  const itemsHtml = (pedido.items || [])
    .map(
      (i) => `
      <li class="flex items-start justify-between gap-2 text-xs py-1">
        <span class="font-semibold text-slate-800 break-words min-w-0 flex-1"><strong class="font-mono-code text-costcoRed">${i.cantidad}x</strong> ${i.nombre}</span>
        <span class="font-mono-code text-slate-500 shrink-0">$${i.subtotal}</span>
      </li>
    `
    )
    .join("");

  let badgeEstatus = "";
  if (pedido.estatus === "pendiente") {
    badgeEstatus = `<span class="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-100 text-amber-900">Por validar</span>`;
  } else if (pedido.estatus === "aprobado") {
    badgeEstatus = `<span class="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-blue-100 text-blue-900">Aprobado</span>`;
  } else if (pedido.estatus === "entregado") {
    badgeEstatus = `<span class="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900">Entregado</span>`;
  } else {
    badgeEstatus = `<span class="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-rose-100 text-rose-900">Cancelado</span>`;
  }

  // Botones directos de acción según estatus actual
  let botonesAccionHtml = "";
  if (pedido.estatus === "pendiente") {
    botonesAccionHtml = `
      <button
        type="button"
        data-doc-id="${pedido.docId}"
        data-new-status="aprobado"
        class="flex-1 rounded-xl bg-costcoBlue hover:bg-blue-800 text-white text-xs font-extrabold py-2 px-3 transition"
      >
        ✓ Aprobar Pago
      </button>
      <button
        type="button"
        data-doc-id="${pedido.docId}"
        data-new-status="entregado"
        class="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-2.5 transition"
        title="Marcar directamente como Entregado"
      >
        Entregado
      </button>
      <button
        type="button"
        data-doc-id="${pedido.docId}"
        data-new-status="cancelado"
        class="rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold py-2 px-2.5 transition"
        title="Cancelar pedido"
      >
        ✕
      </button>
    `;
  } else if (pedido.estatus === "aprobado") {
    botonesAccionHtml = `
      <button
        type="button"
        data-doc-id="${pedido.docId}"
        data-new-status="entregado"
        class="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold py-2 px-3 transition"
      >
        🚀 Marcar Entregado
      </button>
      <button
        type="button"
        data-doc-id="${pedido.docId}"
        data-new-status="pendiente"
        class="rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold py-2 px-2.5 transition"
        title="Regresar a Pendiente"
      >
        ↩
      </button>
      <button
        type="button"
        data-doc-id="${pedido.docId}"
        data-new-status="cancelado"
        class="rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold py-2 px-2.5 transition"
        title="Cancelar pedido"
      >
        ✕
      </button>
    `;
  } else {
    // Completados ('entregado' o 'cancelado')
    botonesAccionHtml = `
      <button
        type="button"
        data-doc-id="${pedido.docId}"
        data-new-status="aprobado"
        class="flex-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-1.5 px-3 transition"
      >
        ↩ Reabrir a Preparación
      </button>
      ${
        pedido.estatus !== "entregado"
          ? `<button
               type="button"
               data-doc-id="${pedido.docId}"
               data-new-status="entregado"
               class="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-1.5 px-3 transition"
             >
               Entregado
             </button>`
          : `<button
               type="button"
               data-doc-id="${pedido.docId}"
               data-new-status="cancelado"
               class="rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold py-1.5 px-2.5 transition"
             >
               Cancelar
             </button>`
      }
    `;
  }

  const esParaManana = pedido.programacion_entrega === "manana";
  const badgeProgramacion = esParaManana
    ? `<span class="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-purple-100 text-purple-900 border border-purple-200" title="${pedido.programacion_motivo || 'Programado para surtir mañana'}"><span>📅</span><span>Para Mañana</span></span>`
    : `<span class="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-200" title="${pedido.programacion_motivo || 'Para surtir hoy'}"><span>⚡</span><span>Para Hoy</span></span>`;

  card.innerHTML = `
    <div class="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
      <div class="flex items-center gap-1.5 flex-wrap">
        <span class="font-mono-code font-black text-sm text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg">
          ${pedido.id_pedido}
        </span>
        ${badgeProgramacion}
        ${badgeEstatus}
      </div>
      <span class="text-xs font-mono-code text-slate-400">🕒 ${hora}</span>
    </div>

    <div class="space-y-1 text-xs">
      <div class="flex items-center justify-between gap-2">
        <p class="font-extrabold text-slate-900 text-sm">${pedido.cliente?.nombre || "Sin nombre"}</p>
        ${
          telefonoLimpio
            ? `<a
                 href="${urlWhatsapp}"
                 target="_blank"
                 rel="noopener noreferrer"
                 class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-lg transition"
               >
                 <span>📱 ${telefonoLimpio}</span>
               </a>`
            : ""
        }
      </div>
      <p class="text-slate-600 font-medium">
        📍 ${pedido.cliente?.facultad_edificio || "Sin ubicación"}
      </p>
      ${
        pedido.clave_rastreo
          ? `<p class="text-[11px] font-mono-code text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mt-1">
               🧾 Ref/Rastreo: <strong>${pedido.clave_rastreo}</strong>
             </p>`
          : ""
      }
    </div>

    <ul class="bg-slate-50 rounded-xl p-2.5 border border-slate-100 divide-y divide-slate-200/60">
      ${itemsHtml}
    </ul>

    ${
      pedido.comprobante_url
        ? `<div class="flex items-center justify-between gap-2 bg-emerald-50/80 border border-emerald-200 rounded-xl p-2">
             <div class="flex items-center gap-2 min-w-0">
               <img src="${pedido.comprobante_url}" alt="Comprobante" class="w-10 h-10 object-cover rounded-lg border border-slate-200 shrink-0 cursor-pointer btn-abrir-comprobante" data-img="${encodeURIComponent(pedido.comprobante_url)}" data-codigo="${pedido.id_pedido}" data-cliente="${pedido.cliente?.nombre || ''}" data-total="$${pedido.total}" />
               <div class="min-w-0 text-left">
                 <p class="text-[11px] font-bold text-slate-900 truncate">Comprobante adjunto</p>
                 <p class="text-[10px] text-emerald-700 font-semibold">Captura disponible</p>
               </div>
             </div>
             <button
               type="button"
               class="btn-abrir-comprobante shrink-0 text-xs font-extrabold bg-white hover:bg-emerald-600 hover:text-white text-emerald-800 border border-emerald-300 px-2.5 py-1.5 rounded-lg transition shadow-sm cursor-pointer"
               data-img="${encodeURIComponent(pedido.comprobante_url)}"
               data-codigo="${pedido.id_pedido}"
               data-cliente="${pedido.cliente?.nombre || ''}"
               data-total="$${pedido.total}"
             >
               📸 Ver
             </button>
           </div>`
        : `<div class="text-[11px] text-slate-400 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5">
             <span>⚠️</span><span>Sin captura adjunta</span>
           </div>`
    }

    <div class="flex items-center justify-between pt-1">
      <span class="text-xs font-bold uppercase text-slate-400">Total Orden</span>
      <span class="text-base font-black text-costcoRed">$${pedido.total}</span>
    </div>

    <div class="flex items-center gap-2 pt-2 border-t border-slate-100">
      ${botonesAccionHtml}
    </div>
  `;

  return card;
}

/**
 * Renderiza las 3 columnas del Kanban filtradas por búsqueda
 */
function renderizarTableroKanban() {
  const termino = filtroBusqueda.trim().toLowerCase();

  const filtrados = listaPedidos.filter((p) => {
    if (!termino) return true;
    const codigo = (p.id_pedido || "").toLowerCase();
    const nombre = (p.cliente?.nombre || "").toLowerCase();
    const ubicacion = (p.cliente?.facultad_edificio || "").toLowerCase();
    const rastreo = (p.clave_rastreo || "").toLowerCase();
    return (
      codigo.includes(termino) ||
      nombre.includes(termino) ||
      ubicacion.includes(termino) ||
      rastreo.includes(termino)
    );
  });

  const pendientes = filtrados.filter((p) => p.estatus === "pendiente");
  const aprobados = filtrados.filter((p) => p.estatus === "aprobado");
  const completados = filtrados.filter((p) =>
    incluirCancelados
      ? p.estatus === "entregado" || p.estatus === "cancelado"
      : p.estatus === "entregado"
  );

  dom.countColPendiente.textContent = String(pendientes.length);
  dom.countColAprobado.textContent = String(aprobados.length);
  dom.countColCompletado.textContent = String(completados.length);

  renderizarColumna(
    dom.colPendiente,
    pendientes,
    "No hay pedidos pendientes de validar pago."
  );
  renderizarColumna(
    dom.colAprobado,
    aprobados,
    "No hay pedidos en preparación actualmente."
  );
  renderizarColumna(
    dom.colCompletado,
    completados,
    "Aún no hay pedidos completados."
  );
}

function renderizarColumna(contenedor, pedidos, mensajeVacio) {
  contenedor.innerHTML = "";
  if (pedidos.length === 0) {
    contenedor.innerHTML = `
      <div class="border-2 border-dashed border-slate-300/70 rounded-2xl p-6 text-center text-xs text-slate-400 font-medium">
        ${mensajeVacio}
      </div>
    `;
    return;
  }
  pedidos.forEach((pedido) => {
    contenedor.appendChild(crearTarjetaPedidoKanban(pedido));
  });
}

/**
 * Exporta los pedidos del día en formato JSON o CSV
 */
function exportarPedidosDelDia(formato) {
  const pedidosHoy = listaPedidos.filter(esPedidoDeHoy);
  const fechaStr = new Date().toISOString().slice(0, 10);

  if (formato === "json") {
    const datosExportar = pedidosHoy.map((p) => ({
      id_pedido: p.id_pedido,
      fecha_hora: new Date(p.timestampMs || Date.now()).toISOString(),
      estatus: p.estatus,
      cliente: p.cliente,
      clave_rastreo: p.clave_rastreo || "",
      items: p.items,
      total: p.total
    }));

    const blob = new Blob([JSON.stringify(datosExportar, null, 2)], {
      type: "application/json;charset=utf-8"
    });
    descargarArchivo(blob, `pedidos-costco-${fechaStr}.json`);
    return;
  }

  // Formato CSV compatible con Excel (UTF-8 con BOM)
  const encabezados = [
    "id_pedido",
    "hora",
    "estatus",
    "cliente_nombre",
    "cliente_whatsapp",
    "facultad_edificio",
    "clave_rastreo",
    "resumen_items",
    "total_mxn"
  ];

  const escaparCsv = (valor) => {
    const str = String(valor ?? "").replace(/"/g, '""');
    return `"${str}"`;
  };

  const filas = pedidosHoy.map((p) => {
    const resumenItems = (p.items || [])
      .map((i) => `${i.cantidad}x ${i.nombre} ($${i.subtotal})`)
      .join(" | ");

    return [
      p.id_pedido,
      formatearHora(p.timestampMs),
      p.estatus,
      p.cliente?.nombre || "",
      p.cliente?.whatsapp || "",
      p.cliente?.facultad_edificio || "",
      p.clave_rastreo || "",
      resumenItems,
      p.total || 0
    ]
      .map(escaparCsv)
      .join(",");
  });

  const contenidoCsv = "\uFEFF" + [encabezados.join(","), ...filas].join("\r\n");
  const blob = new Blob([contenidoCsv], { type: "text/csv;charset=utf-8" });
  descargarArchivo(blob, `pedidos-costco-${fechaStr}.csv`);
}

function descargarArchivo(blob, nombreArchivo) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Registra todos los eventos del Dashboard Administrativo
 */
function registrarEventosAdmin() {
  // Switches de Estado: Abierto / En camino a Costco / En clase / Cerrado
  dom.statusSwitchBtns.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const nuevoEstado = btn.dataset.estado;
      await actualizarConfigTienda({ estado: nuevoEstado });
      mostrarToastGuardado();
    });
  });

  // Guardar Aviso Personalizado y Hora de Corte
  dom.formConfigTienda.addEventListener("submit", async (e) => {
    e.preventDefault();
    await actualizarConfigTienda({
      aviso_personalizado: dom.inputAvisoPublico.value.trim(),
      hora_corte: dom.inputHoraCorte.value || "13:30"
    });
    mostrarToastGuardado();
  });

  // Botones de avisos predeterminados rápidos
  dom.presetNoticeBtns.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const aviso = btn.dataset.presetNotice;
      dom.inputAvisoPublico.value = aviso;
      await actualizarConfigTienda({ aviso_personalizado: aviso });
      mostrarToastGuardado();
    });
  });

  // Delegación de clics para cambiar estatus de pedidos en las 3 columnas Kanban
  const manejarClickColumna = async (e) => {
    const btn = e.target.closest("button[data-new-status]");
    if (!btn) return;
    const docId = btn.dataset.docId;
    const nuevoEstatus = btn.dataset.newStatus;
    btn.disabled = true;
    try {
      await actualizarEstatusPedido(docId, nuevoEstatus);
    } catch (err) {
      console.error("Error cambiando estatus:", err);
      alert("No se pudo actualizar el estatus del pedido.");
    } finally {
      btn.disabled = false;
    }
  };

  dom.colPendiente.addEventListener("click", manejarClickColumna);
  dom.colAprobado.addEventListener("click", manejarClickColumna);
  dom.colCompletado.addEventListener("click", manejarClickColumna);

  // Visor de Comprobantes de Pago
  const abrirVisorComprobante = (imgSrc, codigo, cliente, total) => {
    if (!dom.modalVisorComprobante) return;
    dom.visorComprobanteTitulo.textContent = `Comprobante de ${codigo}`;
    dom.visorComprobanteSubtitulo.textContent = `${cliente} • Total: ${total}`;
    dom.visorComprobanteImg.src = imgSrc;
    dom.btnDescargarComprobante.href = imgSrc;
    dom.btnDescargarComprobante.download = `comprobante-${codigo}.jpg`;
    dom.modalVisorComprobante.showModal();
  };

  const cerrarVisor = () => dom.modalVisorComprobante?.close();
  dom.btnCerrarVisorComprobante?.addEventListener("click", cerrarVisor);
  dom.btnCerrarVisorFooter?.addEventListener("click", cerrarVisor);

  // Delegar clic de ver comprobante en las 3 columnas
  const manejarClickVerComprobante = (e) => {
    const trigger = e.target.closest(".btn-abrir-comprobante");
    if (!trigger) return;
    const imgSrc = decodeURIComponent(trigger.dataset.img || "");
    const codigo = trigger.dataset.codigo || "";
    const cliente = trigger.dataset.cliente || "";
    const total = trigger.dataset.total || "";
    if (imgSrc) {
      abrirVisorComprobante(imgSrc, codigo, cliente, total);
    }
  };

  dom.colPendiente.addEventListener("click", manejarClickVerComprobante);
  dom.colAprobado.addEventListener("click", manejarClickVerComprobante);
  dom.colCompletado.addEventListener("click", manejarClickVerComprobante);

  // Filtros del Kanban
  dom.inputBuscarKanban.addEventListener("input", () => {
    filtroBusqueda = dom.inputBuscarKanban.value;
    renderizarTableroKanban();
  });

  dom.chkMostrarCancelados.addEventListener("change", () => {
    incluirCancelados = dom.chkMostrarCancelados.checked;
    renderizarTableroKanban();
  });

  // Exportar CSV y JSON
  dom.btnExportarCsv.addEventListener("click", () => exportarPedidosDelDia("csv"));
  dom.btnExportarJson.addEventListener("click", () => exportarPedidosDelDia("json"));

  // Modal de Configuración de Telegram
  dom.btnAbrirModalTelegram.addEventListener("click", () => {
    const creds = obtenerCredencialesTelegram();
    dom.inputTgToken.value =
      creds.botToken === "TU_TELEGRAM_BOT_TOKEN" ? "" : creds.botToken;
    dom.inputTgChatId.value =
      creds.chatId === "TU_TELEGRAM_CHAT_ID" ? "" : creds.chatId;
    dom.tgTestFeedback.classList.add("hidden");
    dom.modalTelegramConfig.showModal();
  });

  dom.btnCerrarModalTg.addEventListener("click", () => {
    dom.modalTelegramConfig.close();
  });

  dom.formTelegramConfig.addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = dom.inputTgToken.value.trim();
    const chatId = dom.inputTgChatId.value.trim();
    guardarCredencialesTelegram(token, chatId);
    await actualizarConfigTienda({
      tg_bot_token: token,
      tg_chat_id: chatId
    });
    dom.tgTestFeedback.className =
      "rounded-xl p-3 font-bold bg-emerald-50 text-emerald-800 border border-emerald-200";
    dom.tgTestFeedback.textContent =
      "✓ Credenciales guardadas y sincronizadas con la tienda (sin exponerlas en el código de GitHub).";
    dom.tgTestFeedback.classList.remove("hidden");
  });

  dom.btnProbarTelegram.addEventListener("click", async () => {
    if (dom.inputTgToken.value.trim() && dom.inputTgChatId.value.trim()) {
      guardarCredencialesTelegram(dom.inputTgToken.value, dom.inputTgChatId.value);
    }

    const pedidoPrueba = {
      id_pedido: "ORD-9999",
      cliente: {
        nombre: "Estudiante Prueba",
        whatsapp: "5512345678",
        facultad_edificio: "Facultad de Ingeniería"
      },
      items: [
        { nombre: "Rebanada de Pizza (Pepperoni / Queso)", cantidad: 2, subtotal: 110 },
        { nombre: "Chicken Bake Original", cantidad: 1, subtotal: 100 }
      ],
      total: 210
    };

    const res = await enviarNotificacionTelegram(pedidoPrueba);
    dom.tgTestFeedback.classList.remove("hidden");
    if (res.ok && !res.simulated) {
      dom.tgTestFeedback.className =
        "rounded-xl p-3 font-medium bg-emerald-50 text-emerald-900 border border-emerald-200 whitespace-pre-line";
      dom.tgTestFeedback.textContent = `✅ ¡Mensaje enviado a tu Telegram!\n\n${res.message}`;
    } else if (res.simulated) {
      dom.tgTestFeedback.className =
        "rounded-xl p-3 font-medium bg-amber-50 text-amber-900 border border-amber-200 whitespace-pre-line";
      dom.tgTestFeedback.textContent = `ℹ️ Modo Simulación (ingresa Token y Chat ID reales para envío en vivo):\n\n${res.message}`;
    } else {
      dom.tgTestFeedback.className =
        "rounded-xl p-3 font-medium bg-rose-50 text-rose-900 border border-rose-200 whitespace-pre-line";
      dom.tgTestFeedback.textContent = `❌ Error de Telegram API: ${res.message}`;
    }
  });

  // Eventos de Seguridad PIN
  dom.formPinLogin?.addEventListener("submit", (e) => {
    e.preventDefault();
    const pinIngresado = dom.inputPinAcceso.value.trim();
    const pinConfigurado = localStorage.getItem(PIN_STORAGE_KEY) || PIN_POR_DEFECTO;

    if (pinIngresado === pinConfigurado) {
      sessionStorage.setItem(SESSION_UNLOCKED_KEY, "true");
      dom.pinErrorMsg.classList.add("hidden");
      dom.pinLockOverlay.classList.add("hidden");
      procesarAccionTelegram();
    } else {
      dom.pinErrorMsg.classList.remove("hidden");
      dom.inputPinAcceso.value = "";
      dom.inputPinAcceso.focus();
    }
  });

  dom.btnBloquearPanel?.addEventListener("click", () => {
    bloquearPanel();
  });

  dom.btnCerrarBannerTelegram?.addEventListener("click", () => {
    dom.telegramActionBanner.classList.add("hidden");
  });
}

iniciarAdmin();
