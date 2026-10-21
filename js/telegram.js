/**
 * Módulo de Integración con Telegram Bot API (telegram.js)
 * Construye y envía notificaciones en tiempo real al crear un nuevo pedido,
 * incluyendo botones interactivos inline para aprobar, marcar como entregado
 * o contactar al cliente por WhatsApp directamente desde Telegram.
 */

export const TELEGRAM_CONFIG = {
  BOT_TOKEN: "8660178719:AAFJe9pzrZ0Pz7Sme8xMM3H8icKY7Zk_-mA",
  CHAT_ID: "1175712408"
};

const STORAGE_KEY_TG = "costco_uni_telegram_creds";
const BASE_ADMIN_URL = "https://dcideliveryfood.github.io/Dcifood/admin.html";

let credencialesRemotasConfig = { botToken: "", chatId: "" };

/**
 * Permite sincronizar las credenciales de Telegram almacenadas en 'config/tienda'
 * si existieran en Firestore, o usar las predeterminadas.
 */
export function sincronizarCredencialesDesdeConfig(configTienda) {
  if (configTienda?.tg_bot_token && configTienda?.tg_chat_id) {
    credencialesRemotasConfig = {
      botToken: String(configTienda.tg_bot_token).trim(),
      chatId: String(configTienda.tg_chat_id).trim()
    };
  }
}

/**
 * Obtiene las credenciales activas.
 */
export function obtenerCredencialesTelegram() {
  if (credencialesRemotasConfig.botToken && credencialesRemotasConfig.chatId) {
    return credencialesRemotasConfig;
  }
  try {
    const guardadas = localStorage.getItem(STORAGE_KEY_TG);
    if (guardadas) {
      const parsed = JSON.parse(guardadas);
      if (parsed.botToken && parsed.chatId) {
        return { botToken: parsed.botToken.trim(), chatId: parsed.chatId.trim() };
      }
    }
  } catch (e) {
    console.warn("No se pudieron leer credenciales locales de Telegram:", e);
  }
  return {
    botToken: TELEGRAM_CONFIG.BOT_TOKEN,
    chatId: TELEGRAM_CONFIG.CHAT_ID
  };
}

/**
 * Guarda credenciales de Telegram desde el panel de administración.
 */
export function guardarCredencialesTelegram(botToken, chatId) {
  localStorage.setItem(
    STORAGE_KEY_TG,
    JSON.stringify({ botToken: botToken.trim(), chatId: chatId.trim() })
  );
}

/**
 * Formatea la hora actual en formato HH:MM (24 hrs).
 * @param {Date} [fecha]
 * @returns {string}
 */
export function formatearHoraPedido(fecha = new Date()) {
  return fecha.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

/**
 * Construye el mensaje estructurado para Telegram:
 * "🔔 Nuevo Pedido: ORD-XXXX
 * 👤 Cliente: [Nombre] ([Ubicación])
 * 🍕 Items: [Resumen de productos]
 * 💰 Total: $[Monto]
 * 🕒 Hora: [HH:MM]"
 *
 * @param {Object} pedido - Objeto del pedido creado
 * @returns {string}
 */
export function construirMensajeTelegram(pedido) {
  const idPedido = pedido.id_pedido || "ORD-0000";
  const nombreCliente = pedido.cliente?.nombre || "Cliente";
  const ubicacion = pedido.cliente?.facultad_edificio || "Sin ubicación";

  const resumenItems = Array.isArray(pedido.items)
    ? pedido.items.map((item) => `${item.cantidad}x ${item.nombre}`).join(", ")
    : "Sin productos";

  const montoTotal = Number(pedido.total || 0).toFixed(2).replace(/\.00$/, "");
  const hora = pedido.hora_legible || formatearHoraPedido(new Date());

  const lineas = [
    `🔔 Nuevo Pedido: ${idPedido}`,
    `👤 Cliente: ${nombreCliente} (${ubicacion})`,
    `🍕 Items: ${resumenItems}`,
    `💰 Total: $${montoTotal}`,
    `🕒 Hora: ${hora}`
  ];

  if (pedido.clave_rastreo) {
    lineas.push(`🧾 Clave/Ref: ${pedido.clave_rastreo}`);
  }
  if (pedido.cliente?.whatsapp) {
    lineas.push(`📱 WhatsApp: ${pedido.cliente.whatsapp}`);
  }

  return lineas.join("\n");
}

/**
 * Construye el teclado inline interactivo de Telegram (reply_markup)
 * con botones directos para Aprobar Pago, Marcar Entregado,
 * abrir WhatsApp del cliente o ver en el Panel de Administración.
 *
 * @param {Object} pedido
 * @returns {Object} reply_markup de Telegram
 */
export function construirTecladoInlineTelegram(pedido) {
  const idPedido = pedido.id_pedido || "ORD-0000";
  const telCliente = (pedido.cliente?.whatsapp || "").replace(/\D/g, "");
  const nombreCliente = pedido.cliente?.nombre || "";
  const ubicacion = pedido.cliente?.facultad_edificio || "";

  // Botón para aprobar el pedido en 1 toque desde Telegram
  const urlAprobar = `${BASE_ADMIN_URL}?accion=aprobar&id=${encodeURIComponent(idPedido)}`;
  const urlEntregar = `${BASE_ADMIN_URL}?accion=entregar&id=${encodeURIComponent(idPedido)}`;
  const urlVerEnPanel = `${BASE_ADMIN_URL}?buscar=${encodeURIComponent(idPedido)}`;

  const mensajeWhatsApp = encodeURIComponent(
    `¡Hola ${nombreCliente}! Te escribo de Costco Express DCI sobre tu pedido ${idPedido} para entregar en ${ubicacion}.`
  );
  const urlWhatsApp = telCliente
    ? `https://wa.me/52${telCliente}?text=${mensajeWhatsApp}`
    : urlVerEnPanel;

  return {
    inline_keyboard: [
      [
        {
          text: "✅ Aprobar Pago",
          url: urlAprobar
        },
        {
          text: "🚀 Entregar",
          url: urlEntregar
        }
      ],
      [
        {
          text: "💬 WhatsApp Cliente",
          url: urlWhatsApp
        },
        {
          text: "📋 Ver en Panel Admin",
          url: urlVerEnPanel
        }
      ]
    ]
  };
}

/**
 * Envía el payload a la API de Telegram Bot:
 * https://api.telegram.org/bot<TOKEN>/sendMessage
 * con el texto formateado y los botones interactivos (reply_markup).
 *
 * @param {Object} pedido - Documento del pedido
 * @returns {Promise<{ok: boolean, simulated?: boolean, message: string, response?: any}>}
 */
export async function enviarNotificacionTelegram(pedido) {
  const textoMensaje = construirMensajeTelegram(pedido);
  const { botToken, chatId } = obtenerCredencialesTelegram();
  const replyMarkup = construirTecladoInlineTelegram(pedido);

  const noConfigurado =
    !botToken ||
    !chatId ||
    botToken === "TU_TELEGRAM_BOT_TOKEN" ||
    chatId === "TU_TELEGRAM_CHAT_ID";

  if (noConfigurado) {
    console.info(
      "ℹ️ [Telegram Simulación] Credenciales no configuradas:\n" + textoMensaje
    );
    return {
      ok: true,
      simulated: true,
      message: textoMensaje
    };
  }

  // Si el pedido incluye la captura del comprobante, enviar como foto con sendPhoto
  const comprobante = pedido.comprobanteBlob || pedido.comprobanteFile;
  if (comprobante) {
    try {
      const endpointPhoto = `https://api.telegram.org/bot${botToken}/sendPhoto`;
      const formData = new FormData();
      formData.append("chat_id", chatId);
      formData.append("photo", comprobante, `${pedido.id_pedido || "comprobante"}.jpg`);
      formData.append("caption", textoMensaje);
      formData.append("reply_markup", JSON.stringify(replyMarkup));

      const responsePhoto = await fetch(endpointPhoto, {
        method: "POST",
        body: formData
      });
      const dataPhoto = await responsePhoto.json();

      if (responsePhoto.ok && dataPhoto.ok) {
        return {
          ok: true,
          simulated: false,
          message: textoMensaje,
          response: dataPhoto
        };
      }
      console.warn("sendPhoto con comprobante rechazado por Telegram, enviando como texto:", dataPhoto);
    } catch (errFoto) {
      console.warn("Error enviando comprobante a Telegram con sendPhoto:", errFoto);
    }
  }

  const endpoint = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: textoMensaje,
    reply_markup: replyMarkup
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      console.error("❌ Error en respuesta de Telegram API:", data);
      return {
        ok: false,
        message: data.description || "Error al enviar mensaje a Telegram",
        response: data
      };
    }

    return {
      ok: true,
      simulated: false,
      message: textoMensaje,
      response: data
    };
  } catch (error) {
    console.error("❌ Error de red al conectar con Telegram API:", error);
    return {
      ok: false,
      message: error.message || "Error de conexión con Telegram API"
    };
  }
}
