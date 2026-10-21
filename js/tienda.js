/**
 * Lógica de la Tienda Pública (tienda.js)
 * - Escucha reactiva a 'config/tienda' en tiempo real
 * - Catálogo interactivo con selección de condimentos y refresco de combo
 * - Carrito con cálculo en tiempo real y desglose de personalización
 * - Checkout con validación de WhatsApp (10 dígitos)
 * - Modal de pago CoDi / CLABE con copiado interactivo y código ORD-XXXX
 * - Registro en Firestore + disparo de notificación a Telegram + pantalla de espera en vivo
 */

import {
  escucharConfigTienda,
  crearPedidoEnFirestore,
  escucharPedidoPorCodigo,
  generarCodigoPedido,
  isDemoMode
} from "./firebase-config.js";
import {
  CATALOGO_PRODUCTOS,
  CATEGORIAS,
  PUNTOS_ENTREGA_SUGERIDOS,
  CONDIMENTOS_DISPONIBLES,
  REFRESCOS_600ML,
  DATOS_PAGO
} from "./productos.js";
import {
  enviarNotificacionTelegram,
  formatearHoraPedido,
  sincronizarCredencialesDesdeConfig
} from "./telegram.js";

// Estado local de la tienda y del carrito
let configTiendaActual = {
  estado: "abierto",
  aviso_personalizado: "",
  hora_corte: "13:30"
};

let categoriaActiva = "todos";

/**
 * Selecciones temporales de condimentos y refresco en cada tarjeta del catálogo:
 * prodId -> { bebida: string, condimentos: Set<string>, mostrarPanelCondimentos: boolean }
 */
const seleccionesTarjeta = new Map();

/**
 * Carrito de compras:
 * cartKey -> {
 *   cartKey: string,
 *   id: string,
 *   nombreBase: string,
 *   nombre: string, // Incluye bebida de combo y condimentos para Firestore y Telegram
 *   precio_unitario: number,
 *   cantidad: number,
 *   bebida: string | null,
 *   condimentos: string[]
 * }
 */
const carrito = new Map();

let borradorCheckout = null;
let cancelarSuscripcionPedidoEspera = null;

// Referencias del DOM
const dom = {
  statusBanner: document.getElementById("status-banner"),
  statusBadgeLabel: document.getElementById("status-badge-label"),
  statusCustomNotice: document.getElementById("status-custom-notice"),
  statusCutoffTime: document.getElementById("status-cutoff-time"),
  demoModePill: document.getElementById("demo-mode-pill"),

  closedOverlay: document.getElementById("closed-store-overlay"),
  closedIconBox: document.getElementById("closed-icon-box"),
  closedTitleBadge: document.getElementById("closed-title-badge"),
  closedHeading: document.getElementById("closed-heading"),
  closedMessageDetail: document.getElementById("closed-message-detail"),

  categoryTabs: document.getElementById("category-tabs"),
  productsGrid: document.getElementById("products-grid"),
  catalogCountBadge: document.getElementById("catalog-count-badge"),

  btnVaciarCarrito: document.getElementById("btn-vaciar-carrito"),
  cartEmptyState: document.getElementById("cart-empty-state"),
  cartItemsList: document.getElementById("cart-items-list"),
  cartTotalsBox: document.getElementById("cart-totals-box"),
  cartTotalItemsLabel: document.getElementById("cart-total-items-label"),
  cartTotalAmount: document.getElementById("cart-total-amount"),

  checkoutCard: document.getElementById("checkout-card"),
  checkoutForm: document.getElementById("checkout-form"),
  inputNombre: document.getElementById("cliente-nombre"),
  inputWhatsapp: document.getElementById("cliente-whatsapp"),
  whatsappError: document.getElementById("whatsapp-error"),
  selectUbicacion: document.getElementById("cliente-ubicacion-select"),
  inputUbicacionDetalle: document.getElementById("cliente-ubicacion-detalle"),
  btnProcederPago: document.getElementById("btn-proceder-pago"),

  floatingCartBar: document.getElementById("floating-cart-bar"),
  floatingCartBadge: document.getElementById("floating-cart-badge"),
  floatingCartTotal: document.getElementById("floating-cart-total"),
  btnIrCheckoutMovil: document.getElementById("btn-ir-checkout-movil"),

  inputRastrearCodigo: document.getElementById("input-rastrear-codigo"),
  btnRastrearPedido: document.getElementById("btn-rastrear-pedido"),

  // Modal de Pago
  modalPago: document.getElementById("modal-pago"),
  btnCerrarModalPago: document.getElementById("btn-cerrar-modal-pago"),
  btnCancelarModalPago: document.getElementById("btn-cancelar-modal-pago"),
  modalCodigoOrden: document.getElementById("modal-codigo-orden"),
  btnCopiarCodigo: document.getElementById("btn-copiar-codigo"),
  modalResumenCliente: document.getElementById("modal-resumen-cliente"),
  modalMontoTotal: document.getElementById("modal-monto-total"),
  codiQrContainer: document.getElementById("codi-qr-container"),
  modalBancoNombre: document.getElementById("modal-banco-nombre"),
  modalBeneficiarioNombre: document.getElementById("modal-beneficiario-nombre"),
  modalClabeTexto: document.getElementById("modal-clabe-texto"),
  btnCopiarClabe: document.getElementById("btn-copiar-clabe"),
  labelCopiarClabe: document.getElementById("label-copiar-clabe"),
  inputClaveRastreo: document.getElementById("input-clave-rastreo"),
  btnConfirmarPago: document.getElementById("btn-confirmar-pago"),

  // Comprobante y Anti-Bots
  inputHoneypot: document.getElementById("input-honeypot"),
  inputComprobanteArchivo: document.getElementById("input-comprobante-archivo"),
  comprobanteStatusBadge: document.getElementById("comprobante-status-badge"),
  comprobantePromptBox: document.getElementById("comprobante-prompt-box"),
  comprobantePreviewBox: document.getElementById("comprobante-preview-box"),
  imgComprobantePreview: document.getElementById("img-comprobante-preview"),
  comprobanteFilename: document.getElementById("comprobante-filename"),
  comprobanteFilesize: document.getElementById("comprobante-filesize"),
  btnCambiarComprobante: document.getElementById("btn-cambiar-comprobante"),
  canvasCaptcha: document.getElementById("canvas-captcha"),
  inputCaptchaRespuesta: document.getElementById("input-captcha-respuesta"),
  btnRefrescarCaptcha: document.getElementById("btn-refrescar-captcha"),

  // Modal de Espera en Vivo
  modalEspera: document.getElementById("modal-espera"),
  btnCerrarModalEspera: document.getElementById("btn-cerrar-modal-espera"),
  btnNuevoPedidoEspera: document.getElementById("btn-nuevo-pedido-espera"),
  esperaCodigoTitulo: document.getElementById("espera-codigo-titulo"),
  esperaStatusCard: document.getElementById("espera-status-card"),
  esperaIcono: document.getElementById("espera-icono"),
  esperaEstatusPill: document.getElementById("espera-estatus-pill"),
  esperaMensajePrincipal: document.getElementById("espera-mensaje-principal"),
  esperaMensajeSecundario: document.getElementById("espera-mensaje-secundario"),
  stepPendiente: document.getElementById("step-pendiente"),
  stepAprobado: document.getElementById("step-aprobado"),
  stepEntregado: document.getElementById("step-entregado"),
  esperaClienteNombre: document.getElementById("espera-cliente-nombre"),
  esperaClienteUbicacion: document.getElementById("espera-cliente-ubicacion"),
  esperaItemsLista: document.getElementById("espera-items-lista"),
  esperaTotalMonto: document.getElementById("espera-total-monto"),
  btnWhatsappComprobante: document.getElementById("btn-whatsapp-comprobante")
};

/**
 * Obtiene o inicializa el estado de personalización de una tarjeta de producto
 */
function obtenerSeleccionTarjeta(prod) {
  if (!seleccionesTarjeta.has(prod.id)) {
    seleccionesTarjeta.set(prod.id, {
      bebida: prod.permiteElegirRefresco ? REFRESCOS_600ML[0] : null,
      condimentos: new Set(),
      mostrarPanelCondimentos: Boolean(prod.permiteCondimentos)
    });
  }
  return seleccionesTarjeta.get(prod.id);
}

/**
 * Determina si el estado actual de la tienda permite crear nuevos pedidos.
 */
function permiteNuevosPedidos(estado) {
  return estado === "abierto" || estado === "en_camino";
}

/**
 * Inicialización general
 */
function iniciarTienda() {
  if (isDemoMode) {
    dom.demoModePill.classList.remove("hidden");
  }

  cargarPuntosDeEntrega();
  cargarDatosBancariosModal();
  renderizarTabsCategorias();
  renderizarCatalogo();
  actualizarVistaCarrito();
  registrarEventos();

  // Escucha reactiva en tiempo real a 'config/tienda'
  escucharConfigTienda((config) => {
    configTiendaActual = config;
    sincronizarCredencialesDesdeConfig(config);
    renderizarEstadoTienda(config);
    renderizarCatalogo();
    actualizarEstadoBotonCheckout();
  });
}

/**
 * Pobla las opciones sugeridas de facultades/edificios
 */
function cargarPuntosDeEntrega() {
  const opcionOtro = dom.selectUbicacion.querySelector('option[value="OTRO"]');
  PUNTOS_ENTREGA_SUGERIDOS.forEach((punto, idx) => {
    const opt = document.createElement("option");
    opt.value = punto;
    opt.textContent = `📍 ${punto}`;
    if (idx === 0) opt.selected = true;
    dom.selectUbicacion.insertBefore(opt, opcionOtro);
  });
}

/**
 * Carga los datos bancarios estáticos de DATOS_PAGO
 */
function cargarDatosBancariosModal() {
  dom.modalBancoNombre.textContent = DATOS_PAGO.banco;
  dom.modalBeneficiarioNombre.textContent = DATOS_PAGO.beneficiario;
  dom.modalClabeTexto.textContent = DATOS_PAGO.clabe;
}

/**
 * Actualiza el banner superior y el bloqueo de pedidos según 'config/tienda'
 */
function renderizarEstadoTienda(config) {
  const { estado, aviso_personalizado, hora_corte } = config;
  dom.statusCutoffTime.textContent = hora_corte || "--:--";
  dom.statusCustomNotice.textContent =
    aviso_personalizado || "Bienvenido a Costco Express DCI";

  dom.statusBanner.classList.remove(
    "bg-emerald-600",
    "bg-costcoBlue",
    "bg-amber-600",
    "bg-rose-700"
  );

  if (estado === "abierto") {
    dom.statusBanner.classList.add("bg-emerald-600");
    dom.statusBadgeLabel.textContent = "🟢 ABIERTO";
    dom.closedOverlay.classList.add("hidden");
  } else if (estado === "en_camino") {
    dom.statusBanner.classList.add("bg-costcoBlue");
    dom.statusBadgeLabel.textContent = "🚗 EN CAMINO A COSTCO";
    dom.closedOverlay.classList.add("hidden");
  } else if (estado === "en_clase") {
    dom.statusBanner.classList.add("bg-amber-600");
    dom.statusBadgeLabel.textContent = "📚 EN CLASE (PAUSADO)";
    dom.closedOverlay.classList.remove("hidden");
    dom.closedIconBox.textContent = "📚";
    dom.closedTitleBadge.textContent = "En clase temporalmente";
    dom.closedHeading.textContent =
      aviso_personalizado || "En clase en este momento — regresamos pronto";
    dom.closedMessageDetail.textContent = `Los pedidos están pausados mientras estamos en clase. Hora de corte del día: ${
      hora_corte || "--:--"
    }.`;
  } else {
    dom.statusBanner.classList.add("bg-rose-700");
    dom.statusBadgeLabel.textContent = "🔴 CERRADO";
    dom.closedOverlay.classList.remove("hidden");
    dom.closedIconBox.textContent = "🔒";
    dom.closedTitleBadge.textContent = "Tienda Cerrada";
    dom.closedHeading.textContent =
      aviso_personalizado || "La recepción de pedidos de hoy ha concluido";
    dom.closedMessageDetail.textContent = `No es posible registrar nuevos pedidos en este momento (Hora de corte: ${
      hora_corte || "--:--"
    }).`;
  }
}

/**
 * Renderiza las pestañas de categorías
 */
function renderizarTabsCategorias() {
  dom.categoryTabs.innerHTML = "";
  CATEGORIAS.forEach((cat) => {
    const activa = cat.id === categoriaActiva;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = activa
      ? "shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold bg-slate-900 text-white shadow-sm transition"
      : "shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white text-slate-600 hover:bg-slate-100 border border-slate-200 transition";
    btn.innerHTML = `<span>${cat.icono}</span><span>${cat.nombre}</span>`;
    btn.addEventListener("click", () => {
      categoriaActiva = cat.id;
      renderizarTabsCategorias();
      renderizarCatalogo();
    });
    dom.categoryTabs.appendChild(btn);
  });
}

/**
 * Cuenta cuántas unidades de un producto base hay en el carrito (sumando sus variantes)
 */
function contarUnidadesProductoEnCarrito(idProd) {
  let suma = 0;
  carrito.forEach((entry) => {
    if (entry.id === idProd) {
      suma += entry.cantidad;
    }
  });
  return suma;
}

/**
 * Construye la llave única de carrito y el nombre descriptivo con bebida y condimentos
 */
function construirVarianteCarrito(prod, bebida, condimentosSet) {
  const listaCondimentos = CONDIMENTOS_DISPONIBLES.map((c) => c.nombre).filter((nombre) =>
    condimentosSet.has(nombre)
  );

  const keyBebida = bebida || "";
  const keyCond = listaCondimentos.join(",");
  const cartKey = `${prod.id}|${keyBebida}|${keyCond}`;

  let nombreCompuesto = prod.nombre;
  if (bebida) {
    nombreCompuesto = `Hot Dog Kirkland + ${bebida} 600 ml`;
  }

  if (prod.permiteCondimentos) {
    if (listaCondimentos.length > 0) {
      nombreCompuesto += ` (Con: ${listaCondimentos.join(", ")})`;
    } else {
      nombreCompuesto += ` (Sin condimentos)`;
    }
  }

  return {
    cartKey,
    nombreCompuesto,
    listaCondimentos
  };
}

/**
 * Renderiza el grid de productos del catálogo con selectores de bebida y condimentos
 */
function renderizarCatalogo() {
  const productosFiltrados =
    categoriaActiva === "todos"
      ? CATALOGO_PRODUCTOS
      : CATALOGO_PRODUCTOS.filter((p) => p.categoria === categoriaActiva);

  dom.catalogCountBadge.textContent = `${productosFiltrados.length} productos`;
  dom.productsGrid.innerHTML = "";

  const habilitado = permiteNuevosPedidos(configTiendaActual.estado);

  productosFiltrados.forEach((prod) => {
    const sel = obtenerSeleccionTarjeta(prod);
    const totalProductoEnCarrito = contarUnidadesProductoEnCarrito(prod.id);

    const card = document.createElement("article");
    card.className = `bg-white rounded-2xl border ${
      totalProductoEnCarrito > 0
        ? "border-costcoRed ring-2 ring-costcoRed/15"
        : "border-slate-200"
    } p-4 shadow-sm hover:shadow-md transition flex flex-col justify-between min-w-0 overflow-hidden`;

    // Selector de Refresco de 600 ml (exclusivo para el Hot Dog + Refresco)
    let selectorRefrescoHtml = "";
    if (prod.permiteElegirRefresco) {
      const opcionesRefresco = REFRESCOS_600ML.map(
        (ref) =>
          `<option value="${ref}" ${sel.bebida === ref ? "selected" : ""}>🥤 ${ref} (600 ml)</option>`
      ).join("");

      selectorRefrescoHtml = `
        <div class="mt-3 pt-2.5 border-t border-slate-100">
          <label class="block text-[11px] font-extrabold uppercase tracking-wider text-costcoBlue mb-1">
            1. Elige tu refresco de 600 ml:
          </label>
          <select
            data-role="select-bebida"
            data-id="${prod.id}"
            ${!habilitado ? "disabled" : ""}
            class="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 focus:bg-white focus:border-costcoBlue focus:outline-none"
          >
            ${opcionesRefresco}
          </select>
        </div>
      `;
    }

    // Sección de Condimentos (Mayonesa, Mostaza, Cátsup, Cebolla, Jalapeños, Chile quebrado)
    let seccionCondimentosHtml = "";
    if (prod.permiteCondimentos) {
      const listaNombres = prod.condimentosSugeridos || CONDIMENTOS_DISPONIBLES.map((c) => c.nombre);
      const todosSeleccionados = listaNombres.every((c) => sel.condimentos.has(c));

      const chipsHtml = listaNombres
        .map((nombreCond) => {
          const activo = sel.condimentos.has(nombreCond);
          return `
            <button
              type="button"
              data-role="toggle-condimento"
              data-id="${prod.id}"
              data-condimento="${nombreCond}"
              ${!habilitado ? "disabled" : ""}
              class="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition select-none ${
                activo
                  ? "bg-amber-500 text-white border-amber-600 shadow-sm"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
              }"
            >
              ${activo ? "✓ " : "+ "}${nombreCond}
            </button>
          `;
        })
        .join("");

      seccionCondimentosHtml = `
        <div class="mt-3 pt-2.5 border-t border-slate-100">
          <div class="flex items-center justify-between gap-2 mb-1.5">
            <span class="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
              ${prod.permiteElegirRefresco ? "2. Condimentos (gratis):" : "🧂 Condimentos (opcional):"}
            </span>
            <button
              type="button"
              data-role="toggle-todos-condimentos"
              data-id="${prod.id}"
              ${!habilitado ? "disabled" : ""}
              class="text-[11px] font-extrabold text-costcoBlue hover:underline"
            >
              ${todosSeleccionados ? "Quitar todos" : "Poner todos"}
            </button>
          </div>
          <div class="flex flex-wrap gap-1.5">
            ${chipsHtml}
          </div>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="min-w-0">
        <div class="flex items-start justify-between gap-3">
          <div class="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br ${prod.colorBg} flex items-center justify-center text-2xl sm:text-3xl shrink-0 border border-slate-100 p-2.5">
            ${prod.emoji}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              ${
                prod.badge
                  ? `<span class="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-red-50 text-costcoRed border border-red-200">${prod.badge}</span>`
                  : ""
              }
              ${
                totalProductoEnCarrito > 0
                  ? `<span class="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">En carrito: ${totalProductoEnCarrito}</span>`
                  : ""
              }
            </div>
            <h3 class="text-sm sm:text-base font-extrabold text-slate-900 leading-snug mt-1 break-words">
              ${prod.nombre}
            </h3>
          </div>
        </div>
        <p class="text-xs text-slate-500 mt-2 leading-relaxed break-words">
          ${prod.descripcion}
        </p>

        ${selectorRefrescoHtml}
        ${seccionCondimentosHtml}
      </div>

      <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
        <div>
          <span class="text-[10px] uppercase font-bold text-slate-400 block">Entrega incluida</span>
          <span class="text-lg font-black text-slate-900">$${prod.precio_unitario}</span>
        </div>

        ${
          !habilitado
            ? `<button type="button" disabled class="px-3.5 py-2.5 rounded-xl bg-slate-100 text-slate-400 text-xs font-bold cursor-not-allowed">
                 No disponible
               </button>`
            : `<button
                 type="button"
                 data-action="add-custom"
                 data-id="${prod.id}"
                 class="px-4 py-2.5 rounded-xl bg-costcoBlue hover:bg-blue-800 active:scale-95 text-white text-xs font-extrabold shadow-sm transition flex items-center gap-1.5 shrink-0"
               >
                 <span>+ Agregar al pedido</span>
               </button>`
        }
      </div>
    `;

    dom.productsGrid.appendChild(card);
  });
}

/**
 * Agrega al carrito el producto con la bebida y los condimentos seleccionados en su tarjeta
 */
function agregarProductoPersonalizadoAlCarrito(idProducto) {
  if (!permiteNuevosPedidos(configTiendaActual.estado)) return;

  const prod = CATALOGO_PRODUCTOS.find((p) => p.id === idProducto);
  if (!prod) return;

  const sel = obtenerSeleccionTarjeta(prod);
  const { cartKey, nombreCompuesto, listaCondimentos } = construirVarianteCarrito(
    prod,
    sel.bebida,
    sel.condimentos
  );

  const existente = carrito.get(cartKey);
  if (existente) {
    existente.cantidad += 1;
  } else {
    carrito.set(cartKey, {
      cartKey,
      id: prod.id,
      nombreBase: prod.nombre,
      nombre: nombreCompuesto,
      precio_unitario: prod.precio_unitario,
      cantidad: 1,
      bebida: sel.bebida || null,
      condimentos: listaCondimentos
    });
  }

  renderizarCatalogo();
  actualizarVistaCarrito();
}

/**
 * Modifica la cantidad de un item específico del carrito por su cartKey
 */
function modificarCantidadPorCartKey(cartKey, delta) {
  if (!permiteNuevosPedidos(configTiendaActual.estado)) return;
  const entry = carrito.get(cartKey);
  if (!entry) return;

  entry.cantidad += delta;
  if (entry.cantidad <= 0) {
    carrito.delete(cartKey);
  }
  renderizarCatalogo();
  actualizarVistaCarrito();
}

/**
 * Calcula los items estructurados y el total del carrito
 * Devuelve exactamente la estructura requerida para Firestore:
 * items: [{ id, nombre, cantidad, precio_unitario, subtotal, condimentos, bebida }]
 */
function obtenerResumenCarrito() {
  const items = [];
  let total = 0;
  let totalPiezas = 0;

  carrito.forEach((entry) => {
    if (entry.cantidad > 0) {
      const subtotal = entry.cantidad * entry.precio_unitario;
      items.push({
        cartKey: entry.cartKey,
        id: entry.id,
        nombre: entry.nombre,
        nombreBase: entry.nombreBase,
        cantidad: entry.cantidad,
        precio_unitario: entry.precio_unitario,
        subtotal,
        bebida: entry.bebida,
        condimentos: entry.condimentos
      });
      total += subtotal;
      totalPiezas += entry.cantidad;
    }
  });

  return { items, total, totalPiezas };
}

/**
 * Actualiza el panel lateral de carrito y la barra flotante móvil
 */
function actualizarVistaCarrito() {
  const { items, total, totalPiezas } = obtenerResumenCarrito();

  if (items.length === 0) {
    dom.cartEmptyState.classList.remove("hidden");
    dom.cartItemsList.classList.add("hidden");
    dom.cartTotalsBox.classList.add("hidden");
    dom.btnVaciarCarrito.classList.add("hidden");
    dom.floatingCartBar.classList.add("hidden");
  } else {
    dom.cartEmptyState.classList.add("hidden");
    dom.cartItemsList.classList.remove("hidden");
    dom.cartTotalsBox.classList.remove("hidden");
    dom.btnVaciarCarrito.classList.remove("hidden");
    dom.floatingCartBar.classList.remove("hidden");

    dom.cartItemsList.innerHTML = "";
    items.forEach((item) => {
      const row = document.createElement("div");
      row.className =
        "flex items-start justify-between gap-2 bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-xs min-w-0";

      const detalleBebida = item.bebida
        ? `<span class="inline-block text-[10px] font-bold bg-blue-50 text-costcoBlue border border-blue-200 px-1.5 py-0.5 rounded mt-1 mr-1">🥤 ${item.bebida}</span>`
        : "";

      const detalleCondimentos =
        item.condimentos && item.condimentos.length > 0
          ? `<span class="inline-block text-[10px] font-semibold bg-amber-50 text-amber-900 border border-amber-200 px-1.5 py-0.5 rounded mt-1">🧂 ${item.condimentos.join(", ")}</span>`
          : "";

      row.innerHTML = `
        <div class="min-w-0 flex-1">
          <p class="font-bold text-slate-800 break-words leading-snug">${item.nombreBase}</p>
          <div>${detalleBebida}${detalleCondimentos}</div>
          <p class="text-slate-500 mt-1">$${item.precio_unitario} c/u • Subtotal: <strong class="text-slate-800">$${item.subtotal}</strong></p>
        </div>
        <div class="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-1 shrink-0">
          <button type="button" data-cart-action="dec" data-cart-key="${encodeURIComponent(item.cartKey)}" class="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 font-bold text-slate-700">−</button>
          <span class="font-mono-code font-bold px-1">${item.cantidad}</span>
          <button type="button" data-cart-action="inc" data-cart-key="${encodeURIComponent(item.cartKey)}" class="w-6 h-6 rounded bg-slate-900 hover:bg-slate-700 font-bold text-white">+</button>
        </div>
      `;
      dom.cartItemsList.appendChild(row);
    });

    dom.cartTotalItemsLabel.textContent = `${totalPiezas} ${
      totalPiezas === 1 ? "pieza" : "piezas"
    }`;
    dom.cartTotalAmount.textContent = `$${total}`;
    dom.floatingCartBadge.textContent = String(totalPiezas);
    dom.floatingCartTotal.textContent = `$${total}`;
  }

  actualizarEstadoBotonCheckout();
}

/**
 * Habilita o deshabilita el botón de proceder al pago según tienda abierta y carrito
 */
function actualizarEstadoBotonCheckout() {
  const { items } = obtenerResumenCarrito();
  const abierta = permiteNuevosPedidos(configTiendaActual.estado);

  if (!abierta) {
    dom.btnProcederPago.disabled = true;
    dom.btnProcederPago.innerHTML = `<span>🔒 Tienda Cerrada (${configTiendaActual.estado.toUpperCase()})</span>`;
    return;
  }

  if (items.length === 0) {
    dom.btnProcederPago.disabled = true;
    dom.btnProcederPago.innerHTML = `<span>Agrega productos para continuar</span>`;
    return;
  }

  dom.btnProcederPago.disabled = false;
  dom.btnProcederPago.innerHTML = `<span>Proceder al Pago (CoDi / SPEI)</span><span>→</span>`;
}

/**
 * Genera un código QR determinista en SVG para CoDi con el código de pedido y monto
 */
function generarSvgQrCodi(textoSemilla) {
  const size = 21;
  let hash = 2166136261;
  for (let i = 0; i < textoSemilla.length; i++) {
    hash ^= textoSemilla.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  const esPatronPosicion = (r, c) => {
    const topL = r < 7 && c < 7;
    const topR = r < 7 && c >= size - 7;
    const botL = r >= size - 7 && c < 7;
    return topL || topR || botL;
  };

  const celdaPatronPosicion = (r, c, r0, c0) => {
    const dr = r - r0;
    const dc = c - c0;
    if (dr === 0 || dr === 6 || dc === 0 || dc === 6) return true;
    if (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4) return true;
    return false;
  };

  let rects = "";
  let estado = Math.abs(hash) || 1234567;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      let pintado = false;
      if (esPatronPosicion(r, c)) {
        if (r < 7 && c < 7) pintado = celdaPatronPosicion(r, c, 0, 0);
        else if (r < 7 && c >= size - 7) pintado = celdaPatronPosicion(r, c, 0, size - 7);
        else if (r >= size - 7 && c < 7) pintado = celdaPatronPosicion(r, c, size - 7, 0);
      } else {
        estado = (estado * 1664525 + 1013904223) % 4294967296;
        pintado = (estado & 1) === 1;
      }

      if (pintado) {
        rects += `<rect x="${c}" y="${r}" width="1" height="1" fill="#0f172a" />`;
      }
    }
  }

  return `
    <svg viewBox="0 0 ${size} ${size}" class="w-full h-full" shape-rendering="crispEdges" role="img" aria-label="Código QR CoDi">
      <rect width="${size}" height="${size}" fill="#ffffff" />
      ${rects}
    </svg>
  `;
}

let comprobanteProcesado = null; // { file, blob, base64, sizeKb }
let captchaRespuestaEsperada = null;

/**
 * Genera un desafío matemático sobre Canvas con ruido para evitar bots y scrapers
 */
function generarCaptchaAntiBots() {
  if (!dom.canvasCaptcha) return;
  const ctx = dom.canvasCaptcha.getContext("2d");
  const w = dom.canvasCaptcha.width;
  const h = dom.canvasCaptcha.height;

  // Fondo
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, w, h);

  // Operación matemática aleatoria
  const n1 = Math.floor(Math.random() * 16) + 4;
  const n2 = Math.floor(Math.random() * 10) + 2;
  const esSuma = Math.random() > 0.35;
  const textoOperacion = esSuma ? `${n1} + ${n2} = ?` : `${n1 + n2} - ${n2} = ?`;
  captchaRespuestaEsperada = esSuma ? n1 + n2 : n1;

  // Ruido de líneas
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = `rgba(100, 116, 139, ${Math.random() * 0.35 + 0.15})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.random() * w, Math.random() * h);
    ctx.lineTo(Math.random() * w, Math.random() * h);
    ctx.stroke();
  }

  // Ruido de puntos
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = `rgba(148, 163, 184, ${Math.random() * 0.4 + 0.2})`;
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, 1, 0, Math.PI * 2);
    ctx.fill();
  }

  // Dibujar texto inclinado
  ctx.font = "bold 18px 'JetBrains Mono', monospace";
  ctx.fillStyle = "#0f172a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate((Math.random() - 0.5) * 0.08);
  ctx.fillText(textoOperacion, 0, 0);
  ctx.restore();

  if (dom.inputCaptchaRespuesta) {
    dom.inputCaptchaRespuesta.value = "";
  }
  actualizarEstadoBotonConfirmarPago();
}

/**
 * Procesa y comprime la imagen del comprobante de pago en el cliente
 */
function procesarComprobante(file) {
  if (!file || !file.type.startsWith("image/")) {
    alert("Por favor selecciona un archivo de imagen válido (captura de pantalla, JPG o PNG).");
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 900;
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        const base64 = canvas.toDataURL("image/jpeg", 0.72);
        canvas.toBlob(
          (blob) => {
            const sizeKb = Math.round((blob.size / 1024) * 10) / 10;
            resolve({ file, blob, base64, sizeKb });
          },
          "image/jpeg",
          0.72
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Valida si el comprobante está adjunto y el captcha resuelto para habilitar el botón
 */
function actualizarEstadoBotonConfirmarPago() {
  const tieneComprobante = Boolean(comprobanteProcesado);
  const captchaIngresado = Number(dom.inputCaptchaRespuesta?.value?.trim());
  const captchaValido =
    captchaRespuestaEsperada !== null &&
    !isNaN(captchaIngresado) &&
    dom.inputCaptchaRespuesta?.value?.trim() !== "" &&
    captchaIngresado === captchaRespuestaEsperada;

  if (!tieneComprobante) {
    dom.btnConfirmarPago.disabled = true;
    dom.btnConfirmarPago.className =
      "sm:w-2/3 rounded-xl bg-slate-300 text-slate-500 cursor-not-allowed font-black py-3.5 px-4 text-sm shadow-md transition flex items-center justify-center gap-2";
    dom.btnConfirmarPago.innerHTML = `<span>📸 Adjunta tu comprobante para confirmar</span>`;
    return;
  }

  if (!captchaValido) {
    dom.btnConfirmarPago.disabled = true;
    dom.btnConfirmarPago.className =
      "sm:w-2/3 rounded-xl bg-slate-300 text-slate-500 cursor-not-allowed font-black py-3.5 px-4 text-sm shadow-md transition flex items-center justify-center gap-2";
    dom.btnConfirmarPago.innerHTML = `<span>🛡️ Resuelve el reto anti-bots</span>`;
    return;
  }

  dom.btnConfirmarPago.disabled = false;
  dom.btnConfirmarPago.className =
    "sm:w-2/3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-black py-3.5 px-4 text-sm shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2 cursor-pointer";
  dom.btnConfirmarPago.innerHTML = `<span>✅ Ya pagué • Confirmar pedido</span>`;
}

/**
 * Abre el modal de pago con el código ORD-XXXX generado
 */
function abrirModalPago(datosCliente) {
  const { items, total } = obtenerResumenCarrito();
  if (items.length === 0) return;

  const idPedido = generarCodigoPedido();
  borradorCheckout = {
    id_pedido: idPedido,
    cliente: datosCliente,
    items: items.map((i) => ({
      id: i.id,
      nombre: i.nombre,
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
      subtotal: i.subtotal,
      condimentos: i.condimentos || [],
      bebida: i.bebida || null
    })),
    total
  };

  dom.modalCodigoOrden.textContent = idPedido;
  dom.modalResumenCliente.textContent = `${datosCliente.nombre} • ${datosCliente.facultad_edificio}`;
  dom.modalMontoTotal.textContent = `$${total}`;
  dom.inputClaveRastreo.value = "";

  // Reiniciar estado del comprobante y captcha
  comprobanteProcesado = null;
  if (dom.inputComprobanteArchivo) dom.inputComprobanteArchivo.value = "";
  if (dom.comprobanteStatusBadge) {
    dom.comprobanteStatusBadge.textContent = "Pendiente de adjuntar";
    dom.comprobanteStatusBadge.className =
      "text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md";
  }
  if (dom.comprobantePromptBox) dom.comprobantePromptBox.classList.remove("hidden");
  if (dom.comprobantePreviewBox) dom.comprobantePreviewBox.classList.add("hidden");
  if (dom.imgComprobantePreview) dom.imgComprobantePreview.src = "";

  if (DATOS_PAGO.qrImagen) {
    dom.codiQrContainer.innerHTML = `<img src="${DATOS_PAGO.qrImagen}" alt="QR CoDi" class="w-full h-full object-contain rounded-lg" />`;
  } else {
    dom.codiQrContainer.innerHTML = generarSvgQrCodi(
      `CODI|${DATOS_PAGO.clabe}|${idPedido}|${total}`
    );
  }

  generarCaptchaAntiBots();
  actualizarEstadoBotonConfirmarPago();
  dom.modalPago.showModal();
}

/**
 * Registra el pedido en Firestore, envía el mensaje a Telegram y muestra la pantalla de espera
 */
async function confirmarPagoYRegistrarPedido() {
  if (!borradorCheckout) return;

  // Verificación de Honeypot anti-bots
  if (dom.inputHoneypot?.value) {
    console.warn("Intento de bot bloqueado por honeypot.");
    return;
  }

  // Verificación obligatoria de comprobante
  if (!comprobanteProcesado) {
    alert("Es obligatorio adjuntar la captura de pantalla de tu comprobante de pago para validar tu pedido.");
    return;
  }

  // Verificación obligatoria de captcha
  const respCaptcha = Number(dom.inputCaptchaRespuesta?.value?.trim());
  if (isNaN(respCaptcha) || respCaptcha !== captchaRespuestaEsperada) {
    alert("La respuesta del reto anti-bots es incorrecta. Hemos generado un nuevo reto.");
    generarCaptchaAntiBots();
    return;
  }

  const btn = dom.btnConfirmarPago;
  const textoOriginal = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span>⏳ Subiendo comprobante y registrando...</span>`;

  try {
    const claveRastreo = dom.inputClaveRastreo.value.trim();
    const horaLegible = formatearHoraPedido(new Date());

    const datosCompletos = {
      ...borradorCheckout,
      clave_rastreo: claveRastreo,
      comprobante_url: comprobanteProcesado.base64,
      hora_legible: horaLegible
    };

    // 1. Guardar en Firestore (colección 'pedidos') con la URL/base64 del comprobante
    const pedidoGuardado = await crearPedidoEnFirestore(datosCompletos);

    // 2. Enviar notificación a Telegram Bot API (con la foto del comprobante adjunta)
    enviarNotificacionTelegram({
      ...pedidoGuardado,
      hora_legible: horaLegible,
      comprobanteBlob: comprobanteProcesado.blob
    }).catch((err) => console.warn("Aviso Telegram:", err));

    // 3. Limpiar carrito y formulario
    carrito.clear();
    dom.checkoutForm.reset();
    renderizarCatalogo();
    actualizarVistaCarrito();

    // 4. Cerrar modal de pago y abrir pantalla de espera reactiva
    dom.modalPago.close();
    abrirPantallaEsperaEnTiempoReal(pedidoGuardado.id_pedido);
    borradorCheckout = null;
    comprobanteProcesado = null;
  } catch (error) {
    console.error("Error al registrar pedido:", error);
    alert("Ocurrió un error al registrar tu pedido. Intenta nuevamente.");
  } finally {
    btn.disabled = false;
    btn.innerHTML = textoOriginal;
  }
}

/**
 * Abre la pantalla de espera y se suscribe en tiempo real al pedido por su código ORD-XXXX
 */
function abrirPantallaEsperaEnTiempoReal(idPedido) {
  if (cancelarSuscripcionPedidoEspera) {
    cancelarSuscripcionPedidoEspera();
    cancelarSuscripcionPedidoEspera = null;
  }

  const codigo = idPedido.trim().toUpperCase();
  dom.esperaCodigoTitulo.textContent = codigo;
  dom.modalEspera.showModal();

  cancelarSuscripcionPedidoEspera = escucharPedidoPorCodigo(codigo, (pedido) => {
    if (!pedido) {
      dom.esperaIcono.textContent = "🔍";
      dom.esperaEstatusPill.textContent = "No encontrado";
      dom.esperaEstatusPill.className =
        "inline-block text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full bg-slate-200 text-slate-800";
      dom.esperaMensajePrincipal.textContent = `No encontramos un pedido con el código ${codigo}`;
      dom.esperaMensajeSecundario.textContent =
        "Verifica que hayas escrito bien los 4 dígitos de tu orden.";
      dom.esperaClienteNombre.textContent = "-";
      dom.esperaClienteUbicacion.textContent = "-";
      dom.esperaItemsLista.innerHTML = "";
      dom.esperaTotalMonto.textContent = "$0";
      return;
    }

    dom.esperaClienteNombre.textContent = pedido.cliente?.nombre || "-";
    dom.esperaClienteUbicacion.textContent = pedido.cliente?.facultad_edificio || "-";
    dom.esperaTotalMonto.textContent = `$${pedido.total || 0}`;

    dom.esperaItemsLista.innerHTML = (pedido.items || [])
      .map(
        (i) =>
          `<div class="flex justify-between gap-2 border-b border-slate-100 pb-1 last:border-0"><span class="break-words min-w-0 flex-1">${i.cantidad}x ${i.nombre}</span><span class="shrink-0 font-mono-code font-bold">$${i.subtotal}</span></div>`
      )
      .join("");

    const mensajeWa = encodeURIComponent(
      `¡Hola! Te envío el comprobante de mi pedido *${pedido.id_pedido}* por *$${pedido.total}* a nombre de ${pedido.cliente?.nombre} (${pedido.cliente?.facultad_edificio}).`
    );
    dom.btnWhatsappComprobante.href = `https://wa.me/${DATOS_PAGO.whatsappVendedor}?text=${mensajeWa}`;

    const estatus = pedido.estatus || "pendiente";

    const claseInactiva =
      "p-2 rounded-xl border border-slate-200 bg-slate-50 font-semibold text-slate-400";
    dom.stepPendiente.className = claseInactiva;
    dom.stepAprobado.className = claseInactiva;
    dom.stepEntregado.className = claseInactiva;

    if (estatus === "pendiente") {
      dom.esperaStatusCard.className =
        "rounded-2xl p-4 sm:p-5 border-2 border-amber-300 bg-amber-50 text-center";
      dom.esperaIcono.textContent = "⏳";
      dom.esperaEstatusPill.className =
        "inline-block text-[11px] sm:text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full bg-amber-200 text-amber-950";
      dom.esperaEstatusPill.textContent = "Pendiente por validar";
      dom.esperaMensajePrincipal.textContent =
        "Tu pedido fue registrado. Estamos verificando tu transferencia...";
      dom.esperaMensajeSecundario.textContent =
        "En cuanto validemos tu pago con el concepto " +
        pedido.id_pedido +
        ", pasará a preparación.";
      dom.stepPendiente.className =
        "p-2 rounded-xl border-2 border-amber-500 bg-amber-100 font-extrabold text-amber-950";
    } else if (estatus === "aprobado") {
      dom.esperaStatusCard.className =
        "rounded-2xl p-4 sm:p-5 border-2 border-blue-300 bg-blue-50 text-center";
      dom.esperaIcono.textContent = "🍕";
      dom.esperaEstatusPill.className =
        "inline-block text-[11px] sm:text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full bg-blue-200 text-blue-950";
      dom.esperaEstatusPill.textContent = "Pago Aprobado • En Preparación";
      dom.esperaMensajePrincipal.textContent =
        "¡Pago confirmado! Tu orden está lista para entregarse en tu facultad.";
      dom.esperaMensajeSecundario.textContent = `Nos vemos en: ${pedido.cliente?.facultad_edificio}`;
      dom.stepPendiente.className =
        "p-2 rounded-xl border border-emerald-300 bg-emerald-50 font-bold text-emerald-800";
      dom.stepAprobado.className =
        "p-2 rounded-xl border-2 border-costcoBlue bg-blue-100 font-extrabold text-blue-950";
    } else if (estatus === "entregado") {
      dom.esperaStatusCard.className =
        "rounded-2xl p-4 sm:p-5 border-2 border-emerald-400 bg-emerald-50 text-center";
      dom.esperaIcono.textContent = "🎉";
      dom.esperaEstatusPill.className =
        "inline-block text-[11px] sm:text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full bg-emerald-200 text-emerald-950";
      dom.esperaEstatusPill.textContent = "¡Pedido Entregado!";
      dom.esperaMensajePrincipal.textContent =
        "¡Gracias por tu compra! Que disfrutes tu comida de Costco.";
      dom.esperaMensajeSecundario.textContent =
        "Tu pedido ha sido marcado como entregado satisfactoriamente.";
      dom.stepPendiente.className =
        "p-2 rounded-xl border border-emerald-300 bg-emerald-50 font-bold text-emerald-800";
      dom.stepAprobado.className =
        "p-2 rounded-xl border border-emerald-300 bg-emerald-50 font-bold text-emerald-800";
      dom.stepEntregado.className =
        "p-2 rounded-xl border-2 border-emerald-600 bg-emerald-100 font-extrabold text-emerald-950";
    } else if (estatus === "cancelado") {
      dom.esperaStatusCard.className =
        "rounded-2xl p-4 sm:p-5 border-2 border-rose-300 bg-rose-50 text-center";
      dom.esperaIcono.textContent = "❌";
      dom.esperaEstatusPill.className =
        "inline-block text-[11px] sm:text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full bg-rose-200 text-rose-950";
      dom.esperaEstatusPill.textContent = "Pedido Cancelado";
      dom.esperaMensajePrincipal.textContent =
        "Este pedido fue cancelado o no se pudo validar el pago.";
      dom.esperaMensajeSecundario.textContent =
        "Si ya realizaste tu transferencia, envíanos tu comprobante por WhatsApp.";
    }
  });
}

/**
 * Registra todos los listeners de eventos de la interfaz
 */
function registrarEventos() {
  // Cambios de select de bebida en tarjetas del catálogo
  dom.productsGrid.addEventListener("change", (e) => {
    const selectBebida = e.target.closest('select[data-role="select-bebida"]');
    if (!selectBebida) return;
    const prod = CATALOGO_PRODUCTOS.find((p) => p.id === selectBebida.dataset.id);
    if (!prod) return;
    const sel = obtenerSeleccionTarjeta(prod);
    sel.bebida = selectBebida.value;
  });

  // Delegación de clics en el catálogo (condimentos y botón agregar)
  dom.productsGrid.addEventListener("click", (e) => {
    // 1. Toggle de un condimento individual
    const btnCond = e.target.closest('button[data-role="toggle-condimento"]');
    if (btnCond) {
      const prod = CATALOGO_PRODUCTOS.find((p) => p.id === btnCond.dataset.id);
      if (!prod) return;
      const sel = obtenerSeleccionTarjeta(prod);
      const nombreCond = btnCond.dataset.condimento;
      if (sel.condimentos.has(nombreCond)) {
        sel.condimentos.delete(nombreCond);
      } else {
        sel.condimentos.add(nombreCond);
      }
      renderizarCatalogo();
      return;
    }

    // 2. Toggle de "Poner todos / Quitar todos" los condimentos
    const btnTodos = e.target.closest('button[data-role="toggle-todos-condimentos"]');
    if (btnTodos) {
      const prod = CATALOGO_PRODUCTOS.find((p) => p.id === btnTodos.dataset.id);
      if (!prod) return;
      const sel = obtenerSeleccionTarjeta(prod);
      const lista = prod.condimentosSugeridos || CONDIMENTOS_DISPONIBLES.map((c) => c.nombre);
      const todosActivos = lista.every((c) => sel.condimentos.has(c));
      if (todosActivos) {
        sel.condimentos.clear();
      } else {
        lista.forEach((c) => sel.condimentos.add(c));
      }
      renderizarCatalogo();
      return;
    }

    // 3. Botón Agregar al pedido
    const btnAdd = e.target.closest('button[data-action="add-custom"]');
    if (btnAdd) {
      agregarProductoPersonalizadoAlCarrito(btnAdd.dataset.id);
    }
  });

  // Delegación de clics en la lista del carrito
  dom.cartItemsList.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-cart-action]");
    if (!btn) return;
    const cartKey = decodeURIComponent(btn.dataset.cartKey);
    const action = btn.dataset.cartAction;
    modificarCantidadPorCartKey(cartKey, action === "inc" ? 1 : -1);
  });

  // Vaciar carrito
  dom.btnVaciarCarrito.addEventListener("click", () => {
    carrito.clear();
    renderizarCatalogo();
    actualizarVistaCarrito();
  });

  // Barra flotante móvil -> desplazar al formulario de checkout
  dom.btnIrCheckoutMovil.addEventListener("click", () => {
    dom.checkoutCard.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => dom.inputNombre.focus(), 450);
  });

  // Limpiar caracteres no numéricos en WhatsApp
  dom.inputWhatsapp.addEventListener("input", () => {
    dom.inputWhatsapp.value = dom.inputWhatsapp.value.replace(/\D/g, "").slice(0, 10);
    if (dom.inputWhatsapp.value.length === 10) {
      dom.whatsappError.classList.add("hidden");
    }
  });

  // Si elige "OTRO" en punto de entrega, hacer obligatorio el detalle
  dom.selectUbicacion.addEventListener("change", () => {
    if (dom.selectUbicacion.value === "OTRO") {
      dom.inputUbicacionDetalle.required = true;
      dom.inputUbicacionDetalle.focus();
    } else {
      dom.inputUbicacionDetalle.required = false;
    }
  });

  // Envío del formulario de Checkout -> Abre Modal de Pago
  dom.checkoutForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!permiteNuevosPedidos(configTiendaActual.estado)) return;

    const nombre = dom.inputNombre.value.trim();
    const whatsapp = dom.inputWhatsapp.value.replace(/\D/g, "");
    const seleccionUbicacion = dom.selectUbicacion.value;
    const detalleUbicacion = dom.inputUbicacionDetalle.value.trim();

    if (whatsapp.length !== 10) {
      dom.whatsappError.classList.remove("hidden");
      dom.inputWhatsapp.focus();
      return;
    }
    dom.whatsappError.classList.add("hidden");

    let facultadEdificio = seleccionUbicacion;
    if (seleccionUbicacion === "OTRO") {
      facultadEdificio = detalleUbicacion || "Campus Universitario";
    } else if (detalleUbicacion) {
      facultadEdificio = `${seleccionUbicacion} (${detalleUbicacion})`;
    }

    abrirModalPago({
      nombre,
      whatsapp,
      facultad_edificio: facultadEdificio
    });
  });

  // Copiar CLABE al portapapeles
  dom.btnCopiarClabe.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(DATOS_PAGO.clabe);
      dom.labelCopiarClabe.textContent = "¡CLABE Copiada!";
      dom.btnCopiarClabe.classList.replace("bg-costcoBlue", "bg-emerald-600");
      setTimeout(() => {
        dom.labelCopiarClabe.textContent = "Copiar CLABE";
        dom.btnCopiarClabe.classList.replace("bg-emerald-600", "bg-costcoBlue");
      }, 2200);
    } catch {
      alert(`CLABE: ${DATOS_PAGO.clabe}`);
    }
  });

  // Copiar Código ORD-XXXX al portapapeles
  dom.btnCopiarCodigo.addEventListener("click", async () => {
    const codigo = dom.modalCodigoOrden.textContent.trim();
    try {
      await navigator.clipboard.writeText(codigo);
      dom.btnCopiarCodigo.textContent = "¡Código copiado!";
      setTimeout(() => {
        dom.btnCopiarCodigo.textContent = "Copiar código";
      }, 2000);
    } catch {
      alert(`Código: ${codigo}`);
    }
  });

  // Cerrar modal de pago
  const cerrarPago = () => dom.modalPago.close();
  dom.btnCerrarModalPago.addEventListener("click", cerrarPago);
  dom.btnCancelarModalPago.addEventListener("click", cerrarPago);

  // Confirmar pago -> Guardar en Firestore + Telegram + Pantalla de espera
  dom.btnConfirmarPago.addEventListener("click", confirmarPagoYRegistrarPedido);

  // Adjuntar comprobante de pago
  if (dom.inputComprobanteArchivo) {
    dom.inputComprobanteArchivo.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (dom.comprobanteStatusBadge) {
        dom.comprobanteStatusBadge.textContent = "Procesando...";
        dom.comprobanteStatusBadge.className =
          "text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md";
      }

      const resultado = await procesarComprobante(file);
      if (!resultado) {
        dom.inputComprobanteArchivo.value = "";
        comprobanteProcesado = null;
        if (dom.comprobanteStatusBadge) {
          dom.comprobanteStatusBadge.textContent = "Pendiente de adjuntar";
          dom.comprobanteStatusBadge.className =
            "text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md";
        }
        actualizarEstadoBotonConfirmarPago();
        return;
      }

      comprobanteProcesado = resultado;
      if (dom.imgComprobantePreview) {
        dom.imgComprobantePreview.src = resultado.base64;
      }
      if (dom.comprobanteFilename) {
        dom.comprobanteFilename.textContent = file.name;
      }
      if (dom.comprobanteFilesize) {
        dom.comprobanteFilesize.textContent = `${resultado.sizeKb} KB`;
      }
      if (dom.comprobanteStatusBadge) {
        dom.comprobanteStatusBadge.textContent = "Listo para verificar";
        dom.comprobanteStatusBadge.className =
          "text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md";
      }
      if (dom.comprobantePromptBox) dom.comprobantePromptBox.classList.add("hidden");
      if (dom.comprobantePreviewBox) dom.comprobantePreviewBox.classList.remove("hidden");

      actualizarEstadoBotonConfirmarPago();
    });
  }

  // Cambiar / eliminar comprobante
  if (dom.btnCambiarComprobante) {
    dom.btnCambiarComprobante.addEventListener("click", () => {
      comprobanteProcesado = null;
      if (dom.inputComprobanteArchivo) dom.inputComprobanteArchivo.value = "";
      if (dom.imgComprobantePreview) dom.imgComprobantePreview.src = "";
      if (dom.comprobanteStatusBadge) {
        dom.comprobanteStatusBadge.textContent = "Pendiente de adjuntar";
        dom.comprobanteStatusBadge.className =
          "text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md";
      }
      if (dom.comprobantePromptBox) dom.comprobantePromptBox.classList.remove("hidden");
      if (dom.comprobantePreviewBox) dom.comprobantePreviewBox.classList.add("hidden");

      actualizarEstadoBotonConfirmarPago();
    });
  }

  // Refrescar captcha anti-bots
  if (dom.btnRefrescarCaptcha) {
    dom.btnRefrescarCaptcha.addEventListener("click", () => {
      generarCaptchaAntiBots();
    });
  }

  // Input respuesta captcha anti-bots
  if (dom.inputCaptchaRespuesta) {
    dom.inputCaptchaRespuesta.addEventListener("input", () => {
      actualizarEstadoBotonConfirmarPago();
    });
  }

  // Cerrar modal de espera
  const cerrarEspera = () => {
    if (cancelarSuscripcionPedidoEspera) {
      cancelarSuscripcionPedidoEspera();
      cancelarSuscripcionPedidoEspera = null;
    }
    dom.modalEspera.close();
  };
  dom.btnCerrarModalEspera.addEventListener("click", cerrarEspera);
  dom.btnNuevoPedidoEspera.addEventListener("click", cerrarEspera);

  // Buscador de pedido por código ORD-XXXX
  const ejecutarBusquedaCodigo = () => {
    let val = dom.inputRastrearCodigo.value.trim().toUpperCase();
    if (!val) return;
    if (/^\d{4}$/.test(val)) {
      val = `ORD-${val}`;
      dom.inputRastrearCodigo.value = val;
    }
    abrirPantallaEsperaEnTiempoReal(val);
  };

  dom.btnRastrearPedido.addEventListener("click", ejecutarBusquedaCodigo);
  dom.inputRastrearCodigo.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      ejecutarBusquedaCodigo();
    }
  });
}

iniciarTienda();
