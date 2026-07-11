/**
============================================================================
@project Today-Session
@title WhatsApp Session ID Generator
@author LavvorStudio
@copyright 2026 LavvorStudio. All rights reserved.
@version 1.0.0
@date 09 April 2026
@license MIT
@repository https://github.com/Lavvordev/Today-Session
============================================================================
Generate WhatsApp Session IDs, QR, Pairing Code
One File Customization, Easy Deploy, Fast Setup
============================================================================
@note This software is property of LavvorStudio
@note Developers can use this for their own bot projects
@note But claiming as your own or removing credits is prohibited
@note You may modify and customize for personal use
@note Commercial use requires prior permission
============================================================================
*/
import express from 'express';
import fs from 'fs-extra';
import path from 'path';
import zlib from 'zlib';
import pino from "pino";
import giftedBtns from 'gifted-btns';
const { sendButtons } = giftedBtns;
import config from './config.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const sessionDir = path.join(__dirname, 'auth_info_today');

async function cleanAuthDir(id) {
    const sessionPath = path.join(sessionDir, id);
    if (fs.existsSync(sessionPath)) {
        await fs.remove(sessionPath);
    }
}

router.get('/', async (req, res) => {
    const sessionId = Date.now().toString(36) + Math.random().toString(36).substring(2);
    let phoneNumber = req.query.number;
    let responseSent = false;

    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number required' });
    }
    phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (phoneNumber.length < 10 || phoneNumber.length > 15) {
        return res.status(400).json({ error: 'Invalid phone number length' });
    }
    
    // Default prefix if needed
    

    console.log(`[PAIR] Generating for: ${phoneNumber}`);

    async function generatePairing() {
        const { default: makeWASocket, useMultiFileAuthState, delay, Browsers, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = await import('baileys');
        
        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useMultiFileAuthState(path.join(sessionDir, sessionId));

        try {
            const sock = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" }))
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }),
                browser: Browsers.macOS(config.webName),
                syncFullHistory: false,
                generateHighQualityLinkPreview: true,
                markOnlineOnConnect: true,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000
            });

            if (!sock.authState.creds.registered) {
                await delay(2000);
                const pairingCode = await sock.requestPairingCode(phoneNumber);
                console.log(`[PAIR] Code: ${pairingCode}`);
                
                if (!responseSent && !res.headersSent) {
                    responseSent = true;
                    return res.json({ code: pairingCode });
                }
            }

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on("connection.update", async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === "open") {
                    console.log(`[PAIR] ✅ Connected for ${phoneNumber}`);
                    await delay(10000);

                    let sessionData = null;
                    let attempts = 0;
                    const maxAttempts = 15;

                    while (attempts < maxAttempts && !sessionData) {
                        try {
                            const credsPath = path.join(sessionDir, sessionId, "creds.json");
                            if (fs.existsSync(credsPath)) {
                                const data = fs.readFileSync(credsPath);
                                if (data && data.length > 100) {
                                    sessionData = data;
                                    break;
                                }
                            }
                            await delay(3000);
                            attempts++;
                        } catch (readError) {
                            await delay(2000);
                            attempts++;
                        }
                    }

                    if (!sessionData) {
                        await cleanAuthDir(sessionId);
                        return;
                    }

                    try {
                        const compressedData = zlib.gzipSync(sessionData);
                        const base64Data = compressedData.toString('base64');
                        const fullSession = config.sessionPrefix + base64Data;

                        const userId = sock.user.id;

                        await sendButtons(sock, userId, {
                            title: `✨ ${config.webName.toUpperCase()} ✨`,
                            text: `✅ *Session Generated Successfully!*\n\n📌 *Session ID:*\n\`${fullSession}\`\n\n💡 Click below to copy or visit links`,
                            footer: `👨‍💻 By: ${config.companyName}`,
                            buttons: [
                                {
                                    name: 'cta_copy',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: '📋 Copy Session ID',
                                        copy_code: fullSession
                                    })
                                },
                                {
                                    name: 'cta_url',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: '⭐ GitHub Repo',
                                        url: config.githubRepo
                                    })
                                },
                                {
                                    name: 'cta_url',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: '📢 WhatsApp Channel',
                                        url: config.whatsappChannel
                                    })
                                }
                            ]
                        });

                        console.log(`[PAIR] Session sent with buttons to ${userId}`);
                        await delay(3000);
                    } catch (sendError) {
                        console.error("Send error:", sendError);
                        const compressedData = zlib.gzipSync(sessionData);
                        const base64Data = compressedData.toString('base64');
                        const fullSession = config.sessionPrefix + base64Data;
                        await sock.sendMessage(userId, { 
                            text: `✨ ${config.webName.toUpperCase()} ✨\n\n✅ Session Generated!\n\nSession ID:\n${fullSession}\n\nBy: ${config.companyName}`
                        });
                    } finally {
                        await cleanAuthDir(sessionId);
                        await sock.ws?.close();
                    }
                }

                if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== 401) {
                    console.log("[PAIR] Reconnecting...");
                    await delay(5000);
                    generatePairing();
                }
            });
        } catch (err) {
            console.error("[PAIR] Error:", err);
            if (!responseSent && !res.headersSent) {
                responseSent = true;
                res.status(500).json({ error: 'Service unavailable' });
            }
            await cleanAuthDir(sessionId);
        }
    }
    await generatePairing();
});

export default router;
