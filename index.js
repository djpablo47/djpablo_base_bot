require('dotenv').config();

const { Telegraf } = require('telegraf');
const axios = require('axios');
const fs = require('fs');
const http = require('http');

// ==================== CONFIGURACIÓN ====================

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const AUTHORIZED_USER_ID = String(process.env.AUTHORIZED_USER_ID);

if (!TELEGRAM_BOT_TOKEN) throw new Error('Falta TELEGRAM_BOT_TOKEN');
if (!AUTHORIZED_USER_ID) throw new Error('Falta AUTHORIZED_USER_ID');

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// ==================== TOKENS ====================

const TOKENS = {
    OFC: {
        symbol: 'OFC',
        nombre: 'OneFootball Credits',
        web: 'https://onefootball.com',
        desc: 'Fan token de OneFootball'
    },
    MORPHO: {
        symbol: 'MORPHO',
        nombre: 'Morpho',
        web: 'https://morpho.org',
        desc: 'Protocolo de préstamos optimizado'
    },
    VIRTUAL: {
        symbol: 'VIRTUAL',
        nombre: 'Virtuals Protocol',
        web: 'https://virtuals.io',
        desc: 'IA y agentes virtuales en Base'
    },
    AERO: {
        symbol: 'AERO',
        nombre: 'Aerodrome Finance',
        web: 'https://aerodrome.finance',
        desc: 'DEX principal de Base'
    },
    CB_MEGA: {
        symbol: 'CB_MEGA',
        nombre: 'CBMega',
        web: 'https://cbmega.io',
        desc: 'Token de ecosistema Base'
    },
    FC_BARCELONA: {
        symbol: 'FC_BARCELONA',
        nombre: 'FC Barcelona Fan Token',
        web: 'https://socios.com',
        desc: 'Fan Token oficial del Barça'
    },
    CB_LTC: {
        symbol: 'CB_LTC',
        nombre: 'CBLTC',
        web: 'https://cbltc.io',
        desc: 'Token de ecosistema Base'
    }
};

// ==================== ALMACENAMIENTO ====================

const ALERTS_FILE = './alerts.json';
let alerts = [];
let isChecking = false;

// ==================== FUNCIONES AUXILIARES ====================

function isAuthorized(ctx) {
    return String(ctx.from.id) === AUTHORIZED_USER_ID;
}

function validateNumber(value) {
    return !isNaN(value) && isFinite(value) && Number(value) > 0;
}

function saveAlerts() {
    try {
        fs.writeFileSync(ALERTS_FILE, JSON.stringify(alerts, null, 2));
    } catch (error) {
        console.error('Error guardando alertas:', error);
    }
}

function loadAlerts() {
  try {
    if (!fs.existsSync(ALERTS_FILE)) {
      fs.writeFileSync(ALERTS_FILE, '[]');
    }
    alerts = JSON.parse(fs.readFileSync(ALERTS_FILE, 'utf8'));
    console.log(`📂 ${alerts.length} alertas cargadas`);
  } catch (e) {
    console.error('Error cargando alertas:', e);
    alerts = [];
  }
}

// ==================== PRECIOS ====================

async function getPrice(tokenSymbol) {
    try {
        const response = await axios.get(`https://api.dexscreener.com/latest/dex/search?q=${tokenSymbol}%2FUSDC%20base`);
        if (response.data && response.data.pairs && response.data.pairs.length > 0) {
            const pair = response.data.pairs.find(p => p.chainId === 'base' && p.baseToken.symbol === tokenSymbol);
            if (pair) return Number(pair.priceUsd);
        }
        return null;
    } catch (error) {
        console.error(`Error precio ${tokenSymbol}:`, error.message);
        return null;
    }
}

// ==================== MONITOREO ====================

async function checkAlerts() {
    if (isChecking) return;
    isChecking = true;

    try {
        for (let i = 0; i < alerts.length; i++) {
            const alert = alerts[i];
            if (alert.status !== 'active') continue;
            
            const currentPrice = await getPrice(alert.token);
            if (!currentPrice) continue;
            
            console.log(`🔄 ${alert.token}: ${currentPrice} USDC (${alert.direction === 'up' ? '↑ alerta subida' : '↓ alerta bajada'})`);
            
            let condition = false;
            if (alert.direction === 'up') {
                condition = currentPrice >= alert.targetPrice;
            } else {
                condition = currentPrice <= alert.targetPrice;
            }
            
            if (condition) {
                alert.status = 'executed';
                saveAlerts();
                
                const directionText = alert.direction === 'up' ? 'SUBIDA' : 'BAJADA';
                const arrow = alert.direction === 'up' ? '📈' : '📉';
                
                await bot.telegram.sendMessage(alert.chatId,
                    `${arrow} *ALERTA DE ${directionText}* ${arrow}\n\n` +
                    `📊 *Token:* ${alert.token}\n` +
                    `💰 *Precio actual:* ${currentPrice} USDC\n` +
                    `🎯 *Objetivo (${alert.direction === 'up' ? 'subida' : 'bajada'}):* ${alert.targetPrice} USDC\n\n` +
                    `✅ Alerta ejecutada.`,
                    { parse_mode: 'Markdown' }
                );
            }
        }
    } catch (error) {
        console.error('Error en check:', error);
    } finally {
        isChecking = false;
    }
}

// ==================== COMANDOS ====================

bot.start((ctx) => {
    if (!isAuthorized(ctx)) return ctx.reply('No autorizado');
    ctx.reply(`🚀 *Bot de Alertas Multi-Token* 🚀\n\n` +
        `📌 *Comandos:*\n\n` +
        `📈 */alert_up TOKEN PRECIO* - Alerta cuando SUBA\n` +
        `📉 */alert_down TOKEN PRECIO* - Alerta cuando BAJE\n` +
        `📋 */alerts* - Ver alertas activas\n` +
        `❌ */cancel_alert ID* - Cancelar alerta\n` +
        `💰 */price TOKEN* - Precio actual\n` +
        `ℹ️ */info TOKEN* - Info del token\n` +
        `📊 */tokens* - Lista de tokens\n` +
        `🆘 */help* - Ayuda completa`,
        { parse_mode: 'Markdown' });
});

bot.command('help', (ctx) => {
    if (!isAuthorized(ctx)) return;

    ctx.reply(
`📋 <b>COMANDOS DETALLADOS</b>

📈 /alert_up TOKEN PRECIO
   Ej: /alert_up OFC 0.06
   Te avisa cuando el precio SUBA a un valor

📉 /alert_down TOKEN PRECIO
   Ej: /alert_down OFC 0.04
   Te avisa cuando el precio BAJE a un valor

📋 /alerts
   Muestra todas tus alertas activas

❌ /cancel_alert ID
   Ej: /cancel_alert 1734567890

💰 /price TOKEN
   Ej: /price AERO

ℹ️ /info TOKEN
   Ej: /info VIRTUAL

📊 /tokens
   Muestra todos los tokens disponibles

🆘 /help
   Muestra este mensaje`,
        { parse_mode: 'HTML' }
    );
});

bot.command('tokens', (ctx) => {
    if (!isAuthorized(ctx)) return;
    let msg = `📊 *Tokens disponibles:*\n\n`;
    Object.keys(TOKENS).forEach(key => {
        msg += `🔸 *${key}* - ${TOKENS[key].nombre}\n`;
    });
    ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.command('info', (ctx) => {
    if (!isAuthorized(ctx)) return;
    const args = ctx.message.text.split(' ');
    if (args.length !== 2) return ctx.reply('Formato: /info TOKEN (ej: /info MORPHO)');
    
    const token = args[1].toUpperCase();
    if (!TOKENS[token]) {
        return ctx.reply(`Token no soportado. Usa /tokens para ver la lista.`);
    }
    
    const t = TOKENS[token];
    ctx.reply(`📊 *${t.nombre} (${t.symbol})*\n🔗 Web: ${t.web}\n📄 ${t.desc}\n🛠️ Red: Base`, { parse_mode: 'Markdown' });
});

bot.command('price', async (ctx) => {
    if (!isAuthorized(ctx)) return;
    const args = ctx.message.text.split(' ');
    if (args.length !== 2) return ctx.reply('Formato: /price TOKEN (ej: /price AERO)');
    
    const token = args[1].toUpperCase();
    if (!TOKENS[token]) {
        return ctx.reply(`Token no soportado. Usa /tokens para ver la lista.`);
    }
    
    const price = await getPrice(token);
    if (price) {
        ctx.reply(`💰 *${token}:* ${price} USDC`, { parse_mode: 'Markdown' });
    } else {
        ctx.reply(`❌ No se pudo obtener el precio de ${token}`);
    }
});

bot.command('alert_up', (ctx) => {
    if (!isAuthorized(ctx)) return;
    const args = ctx.message.text.split(' ');
    if (args.length !== 3) return ctx.reply('Formato: /alert_up TOKEN PRECIO (ej: /alert_up OFC 0.06)');
    
    const token = args[1].toUpperCase();
    const price = parseFloat(args[2]);
    
    if (!TOKENS[token]) {
        return ctx.reply(`Token no soportado. Tokens disponibles: ${Object.keys(TOKENS).join(', ')}`);
    }
    
    if (!validateNumber(price)) return ctx.reply('Precio inválido');
    
    alerts.push({
        id: Date.now(),
        chatId: ctx.chat.id,
        token: token,
        targetPrice: price,
        direction: 'up',
        status: 'active'
    });
    saveAlerts();
    ctx.reply(`✅ Alerta de *SUBIDA* creada: avisaré cuando *${token}* SUBA a *${price} USDC*`, { parse_mode: 'Markdown' });
});

bot.command('alert_down', (ctx) => {
    if (!isAuthorized(ctx)) return;
    const args = ctx.message.text.split(' ');
    if (args.length !== 3) return ctx.reply('Formato: /alert_down TOKEN PRECIO (ej: /alert_down OFC 0.04)');
    
    const token = args[1].toUpperCase();
    const price = parseFloat(args[2]);
    
    if (!TOKENS[token]) {
        return ctx.reply(`Token no soportado. Tokens disponibles: ${Object.keys(TOKENS).join(', ')}`);
    }
    
    if (!validateNumber(price)) return ctx.reply('Precio inválido');
    
    alerts.push({
        id: Date.now(),
        chatId: ctx.chat.id,
        token: token,
        targetPrice: price,
        direction: 'down',
        status: 'active'
    });
    saveAlerts();
    ctx.reply(`✅ Alerta de *BAJADA* creada: avisaré cuando *${token}* BAJE a *${price} USDC*`, { parse_mode: 'Markdown' });
});

bot.command('alerts', (ctx) => {
    if (!isAuthorized(ctx)) return;

    const active = alerts.filter(a => a.status === 'active');
    if (active.length === 0) return ctx.reply('No hay alertas activas');
    
    let msg = '🔔 <b>Alertas activas:</b>\n\n';

    active.forEach(a => {
        const directionIcon = a.direction === 'up' ? '📈' : '📉';
        const directionText = a.direction === 'up' ? 'Subida' : 'Bajada';

        msg += `${directionIcon} <b>${a.id}</b> | ${a.token} | ${directionText} | 🎯 ${a.targetPrice} USDC\n`;
    });

    ctx.reply(msg, { parse_mode: 'HTML' });
});

bot.command('cancel_alert', (ctx) => {
    if (!isAuthorized(ctx)) return;
    const args = ctx.message.text.split(' ');
    if (args.length !== 2) return ctx.reply('Formato: /cancel_alert ID');
    
    const id = parseInt(args[1]);
    const idx = alerts.findIndex(a => a.id === id);
    if (idx === -1) return ctx.reply('Alerta no encontrada');
    
    alerts.splice(idx, 1);
    saveAlerts();
    ctx.reply(`✅ Alerta ${id} cancelada`);
});

// ==================== INICIALIZACIÓN ====================

loadAlerts();

const startBot = async () => {
  try {
    await bot.telegram.deleteWebhook();

    // MUY IMPORTANTE: reset total de updates
    await bot.telegram.getUpdates({ offset: -1 });

    await bot.launch({
      dropPendingUpdates: true
    });

    console.log('🚀 Bot de Alertas Multi-Token iniciado');
  } catch (err) {
    console.error('Error launching bot:', err);
    process.exit(1);
  }
};

startBot();

// Monitoreo cada 30 segundos
setInterval(checkAlerts, 30000);

// Servidor HTTP para Render
const PORT = process.env.PORT || 10000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot de alertas multi-token funcionando ✅');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor HTTP escuchando en puerto ${PORT}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));