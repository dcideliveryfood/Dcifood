/**
 * Módulo de Integración con Telegram Bot API (telegram.js)
 * Construye y envía notificaciones en tiempo real al crear un nuevo pedido.
 */

// Reemplaza con tus credenciales de @BotFather y tu Chat ID, o configúralos desde el Panel Admin
export const TELEGRAM_CONFIG = {
  BOT_TOKEN: "TU_TELEGRAM_BOT_TOKEN", // Ej: "7123456789:AAHxyz1234567890abcdef"
  CHAT_ID: "TU_TELEGRAM_CHAT_ID"      // Ej: "123456789" o "-100123456789" para grupos
};

const STORAGE_KEY_TG = "costco_uni_telegram_creds";

let credencialesRemotasConfig = { botToken: "", chatId: "" };

/**
 * Permite sincronizar las credenciales de Telegram almacenadas en 'config/tienda'
 * para que cualquier celular de cliente pueda disparar la notificación sin exponer
 * el token fijo en un repositorio público de GitHub.
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
 * Obtiene las credenciales activas (prioriza config/tienda o localStorage,
 * o usa las constantes de TELEGRAM_CONFIG).
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
 * Guarda credenciales de Telegram desde el panel de administración para pruebas rápidas.
 */
export function guardarCredencialesTelegram(botToken, chatId) {
  localStorage.setItem(
    STORAGE_KEY_TG,
    JSON.stringify({ botToken: botToken.trim(), chatId: chatId.trim() })
  );
}

/**
 * Formatea la hora actual (o un Date recibido) en formato HH:MM (24 hrs).
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
 * Construye el mensaje estructurado exacto requerido para Telegram:
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
 * Envía el payload a la API de Telegram Bot:
 * https://api.telegram.org/bot<TOKEN>/sendMessage
 *
 * @param {Object} pedido - Documento del pedido
 * @returns {Promise<{ok: boolean, simulated?: boolean, message: string, response?: any}>}
 */
export async function enviarNotificacionTelegram(pedido) {
  const textoMensaje = construirMensajeTelegram(pedido);
  const { botToken, chatId } = obtenerCredencialesTelegram();

  const noConfigurado =
    !botToken ||
    !chatId ||
    botToken === "TU_TELEGRAM_BOT_TOKEN" ||
    chatId === "TU_TELEGRAM_CHAT_ID";

  if (noConfigurado) {
    console.info(
      "ℹ️ [Telegram Simulación] Configura BOT_TOKEN y CHAT_ID en js/telegram.js o en Admin.\nMensaje generado:\n" +
        textoMensaje
    );
    return {
      ok: true,
      simulated: true,
      message: textoMensaje
    };
  }

  const endpoint = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: textoMensaje
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
