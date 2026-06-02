require('dotenv').config();

const { Telegraf } = require('telegraf');
const axios = require('axios');
const fs = require('fs');

const { createPublicClient, http } = require('viem');
const { base } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;
const AUTHORIZED_USER_ID = String(process.env.AUTHORIZED_USER_ID);

if (!TELEGRAM_BOT_TOKEN) throw new Error('Falta TELEGRAM_BOT_TOKEN');
if (!PRIVATE_KEY) throw new Error('Falta WALLET_PRIVATE_KEY');
if (!AUTHORIZED_USER_ID) throw new Error('Falta AUTHORIZED_USER_ID');

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

const publicClient = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org')
});

const account = privateKeyToAccount(`0x${PRIVATE_KEY.replace('0x', '')}`);
const BOT_WALLET_ADDRESS = account.address;

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const OFC = '0x752C5a95d202972E124390F30a50154409d3c858';

const ORDERS_FILE = './orders.json';
const ALERTS_FILE = './alerts.json';

let orders = [];
let alerts = [];
let isChecking = false;

function isAuthorized(ctx) {
    return String(ctx.from.id) === AUTHORIZED_USER_ID;
}

function validateNumber(value) {
    return !isNaN(value) && isFinite(value) && Number(value) > 0;
}

function saveOrders() {
    try {
        fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
    } catch (error) {
        console.error('Error guardando órdenes:', error);
    }
}

function loadOrders() {
    try {
        if (fs.existsSync(ORDERS_FILE)) {
            orders = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
            console.log(`📂 ${orders.length} órdenes cargadas`);
        }
    } catch (error) {
        console.error('Error cargando órdenes:', error);
        orders = [];
    }
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
        if (fs.existsSync(ALERTS_FILE)) {
            alerts = JSON.parse(fs.readFileSync(ALERTS_FILE, 'utf8'));
            console.log(`📂 ${alerts.length} alertas cargadas`);
        }
    } catch (error) {
        console.error('Error cargando alertas:', error);
        alerts = [];
    }
}

async function getPrice() {
    try {
        const response = await axios.get('https://api.dexscreener.com/latest/dex/search?q=OFC%2FUSDC%20base');
        if (response.data && response.data.pairs && response.data.pairs.length > 0) {
            const pair = response.data.pairs.find(p => p.chainId === 'base' && p.baseToken.symbol === 'OFC');
            if (pair) return Number(pair.priceUsd);
        }
        return null;
    } catch (error) {
        console.error('Error precio:', error.message);
        return null;
    }
}

async function checkOrdersAndAlerts() {
    if (isChecking) return;
    isChecking = true;

    try {
        const currentPrice = await getPrice();
        if (!currentPrice) return;

        console.log(`🔄 Precio OFC: ${currentPrice} USDC`);

        for (let i = 0; i < orders.length; i++) {
            const order = orders[i];
            if (order.status !== 'active') continue;

            let shouldNotify = false;
            if (order.type === 'buy' && currentPrice <= order.targetPrice) shouldNotify = true;
            if (order.type === 'sell' && currentPrice >= order.targetPrice) shouldNotify = true;

            if (shouldNotify) {
                order.status = 'executed';
                saveOrders();
                await bot.telegram.sendMessage(order.chatId,
                    `🔔 ORDEN LÍMITE ALCANZADA\n` +
                    `Tipo: ${order.type === 'buy' ? 'COMPRA' : 'VENTA'}\n` +
                    `Cantidad: ${order.amount} ${order.type === 'buy' ? 'USDC' : 'OFC'}\n` +
                    `Precio objetivo: ${order.targetPrice} USDC\n` +
                    `Precio actual: ${currentPrice} USDC`
                );
            }
        }

        for (let i = 0; i < alerts.length; i++) {
            const alert = alerts[i];
            if (alert.status !== 'active') continue;

            if (currentPrice >= alert.targetPrice) {
                alert.status = 'executed';
                saveAlerts();
                await bot.telegram.sendMessage(alert.chatId,
                    `🔔 ALERTA DE PRECIO\nOFC ha alcanzado ${currentPrice} USDC\nObjetivo: ${alert.targetPrice} USDC`
                );
            }
        }

    } catch (error) {
        console.error('Error en check:', error);
    } finally {
        isChecking = false;
    }
}

bot.start((ctx) => {
    if (!isAuthorized(ctx)) return ctx.reply('No autorizado');
    ctx.reply(`🚀 Bot de Alertas OFC/USDC\n\n/limit_buy CANTIDAD PRECIO\n/limit_sell CANTIDAD PRECIO\n/alert PRECIO\n/price\n/orders\n/alerts\n/wallet`);
});

bot.command('wallet', (ctx) => {
    if (!isAuthorized(ctx)) return;
    ctx.reply(`💰 ${BOT_WALLET_ADDRESS}`);
});

bot.command('price', async (ctx) => {
    if (!isAuthorized(ctx)) return;
    const price = await getPrice();
    ctx.reply(price ? `💵 OFC: ${price} USDC` : '❌ Error');
});

bot.command('limit_buy', (ctx) => {
    if (!isAuthorized(ctx)) return;
    const args = ctx.message.text.split(' ');
    if (args.length !== 3) return ctx.reply('Formato: /limit_buy CANTIDAD PRECIO');
    const amount = parseFloat(args[1]);
    const price = parseFloat(args[2]);
    if (!validateNumber(amount) || !validateNumber(price)) return ctx.reply('Valores inválidos');
    orders.push({ id: Date.now(), chatId: ctx.chat.id, type: 'buy', amount, targetPrice: price, status: 'active' });
    saveOrders();
    ctx.reply(`✅ Alerta COMPRA: avisaré cuando OFC baje a ${price}`);
});

bot.command('limit_sell', (ctx) => {
    if (!isAuthorized(ctx)) return;
    const args = ctx.message.text.split(' ');
    if (args.length !== 3) return ctx.reply('Formato: /limit_sell CANTIDAD PRECIO');
    const amount = parseFloat(args[1]);
    const price = parseFloat(args[2]);
    if (!validateNumber(amount) || !validateNumber(price)) return ctx.reply('Valores inválidos');
    orders.push({ id: Date.now(), chatId: ctx.chat.id, type: 'sell', amount, targetPrice: price, status: 'active' });
    saveOrders();
    ctx.reply(`✅ Alerta VENTA: avisaré cuando OFC suba a ${price}`);
});

bot.command('orders', (ctx) => {
    if (!isAuthorized(ctx)) return;
    const active = orders.filter(o => o.status === 'active');
    if (active.length === 0) return ctx.reply('No hay órdenes');
    let msg = '📋 Órdenes:\n';
    active.forEach(o => msg += `${o.id} | ${o.type === 'buy' ? 'COMPRA' : 'VENTA'} | ${o.amount} | ${o.targetPrice}\n`);
    ctx.reply(msg);
});

bot.command('cancel', (ctx) => {
    if (!isAuthorized(ctx)) return;
    const args = ctx.message.text.split(' ');
    if (args.length !== 2) return ctx.reply('/cancel ID');
    const id = parseInt(args[1]);
    const idx = orders.findIndex(o => o.id === id);
    if (idx === -1) return ctx.reply('Orden no encontrada');
    orders.splice(idx, 1);
    saveOrders();
    ctx.reply(`✅ Orden ${id} cancelada`);
});

bot.command('alert', (ctx) => {
    if (!isAuthorized(ctx)) return;
    const args = ctx.message.text.split(' ');
    if (args.length !== 2) return ctx.reply('/alert PRECIO');
    const price = parseFloat(args[1]);
    if (!validateNumber(price)) return ctx.reply('Precio inválido');
    alerts.push({ id: Date.now(), chatId: ctx.chat.id, targetPrice: price, status: 'active' });
    saveAlerts();
    ctx.reply(`✅ Alerta: avisaré cuando OFC llegue a ${price}`);
});

bot.command('alerts', (ctx) => {
    if (!isAuthorized(ctx)) return;
    const active = alerts.filter(a => a.status === 'active');
    if (active.length === 0) return ctx.reply('No hay alertas');
    let msg = '🔔 Alertas:\n';
    active.forEach(a => msg += `${a.id} | Precio: ${a.targetPrice}\n`);
    ctx.reply(msg);
});

bot.command('cancel_alert', (ctx) => {
    if (!isAuthorized(ctx)) return;
    const args = ctx.message.text.split(' ');
    if (args.length !== 2) return ctx.reply('/cancel_alert ID');
    const id = parseInt(args[1]);
    const idx = alerts.findIndex(a => a.id === id);
    if (idx === -1) return ctx.reply('Alerta no encontrada');
    alerts.splice(idx, 1);
    saveAlerts();
    ctx.reply(`✅ Alerta ${id} cancelada`);
});

loadOrders();
loadAlerts();

bot.launch();
console.log('🚀 Bot iniciado');

setInterval(checkOrdersAndAlerts, 30000);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// ===== SERVIDOR HTTP MÍNIMO PARA RENDER =====
const httpServer = require('http');

const PORT = process.env.PORT || 10000;

const server = httpServer.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot de alertas OFC funcionando ✅');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor HTTP escuchando en puerto ${PORT}`);
});