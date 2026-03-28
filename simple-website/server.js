const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

let config = {};
try {
    config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
} catch (e) {
    console.error("❌ Could not load config.json:", e.message);
}

let CLAUDE_KEY = config.anthropic_key || "";
let GEMINI_KEY = config.gemini_key || "";
let OPENROUTER_KEY = config.openrouter_key || "";

console.log(`🔑 Claude key: ${CLAUDE_KEY ? CLAUDE_KEY.slice(0, 20) + '...' : 'NOT SET'}`);
console.log(`🔑 Gemini key: ${GEMINI_KEY ? GEMINI_KEY.slice(0, 20) + '...' : 'NOT SET'}`);
console.log(`🔑 OpenRouter: ${OPENROUTER_KEY ? OPENROUTER_KEY.slice(0, 20) + '...' : 'NOT SET (free models still work with key)'}`);

const MIME_TYPES = {
    '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

const SYSTEM_PROMPT = "You are an expert web developer. Generate a beautiful, modern, single-file HTML5 website with embedded CSS and JS. Return ONLY the raw HTML starting with <!DOCTYPE html> and ending with </html>. No markdown, no backticks, no code fences, no explanations.";

// =========== CLAUDE (Paid) ===========
function callClaude(prompt, res) {
    const postData = JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }]
    });
    const options = {
        hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
        headers: { 'x-api-key': CLAUDE_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'content-length': Buffer.byteLength(postData) }
    };
    console.log(`[Claude] Sending...`);
    const apiReq = https.request(options, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => {
            console.log(`[Claude] ${apiRes.statusCode}`);
            if (apiRes.statusCode === 200) {
                const parsed = JSON.parse(data);
                let code = parsed.content[0].text.trim();
                if (code.startsWith('```')) code = code.replace(/^```html\n?|```$/g, '').trim();
                sendSuccess(res, code);
            } else {
                let errMsg = 'Claude error'; try { errMsg = JSON.parse(data).error?.message || errMsg; } catch(e) {}
                sendError(res, apiRes.statusCode, errMsg);
            }
        });
    });
    apiReq.on('error', (e) => sendError(res, 500, e.message));
    apiReq.write(postData);
    apiReq.end();
}

// =========== GEMINI (Google) ===========
function callGemini(prompt, res) {
    const postData = JSON.stringify({
        contents: [{ parts: [{ text: SYSTEM_PROMPT + "\n\nUser request: " + prompt }] }],
        generationConfig: { maxOutputTokens: 8192 }
    });
    const options = {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(postData) }
    };
    console.log(`[Gemini] Sending...`);
    const apiReq = https.request(options, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => {
            console.log(`[Gemini] ${apiRes.statusCode}`);
            if (apiRes.statusCode === 200) {
                const parsed = JSON.parse(data);
                let code = parsed.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
                if (code.startsWith('```')) code = code.replace(/^```html\n?|```$/g, '').trim();
                sendSuccess(res, code);
            } else {
                let errMsg = 'Gemini error'; try { errMsg = JSON.parse(data).error?.message || errMsg; } catch(e){}
                sendError(res, apiRes.statusCode, errMsg);
            }
        });
    });
    apiReq.on('error', (e) => sendError(res, 500, e.message));
    apiReq.write(postData);
    apiReq.end();
}

// =========== OPENROUTER (Free models with free key) ===========
function callOpenRouter(modelId, label, prompt, res) {
    const postData = JSON.stringify({
        model: modelId,
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: prompt }
        ],
        max_tokens: 4096
    });

    const headers = {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(postData),
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'XHURT Studio'
    };
    // Add key if we have one
    if (OPENROUTER_KEY) {
        headers['Authorization'] = `Bearer ${OPENROUTER_KEY}`;
    }

    const options = {
        hostname: 'openrouter.ai', path: '/api/v1/chat/completions', method: 'POST', headers
    };

    console.log(`[${label}] Sending via OpenRouter...`);
    const apiReq = https.request(options, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => {
            console.log(`[${label}] ${apiRes.statusCode}`);
            if (apiRes.statusCode === 200) {
                try {
                    const parsed = JSON.parse(data);
                    let code = parsed.choices?.[0]?.message?.content?.trim() || "";
                    if (code.startsWith('```')) code = code.replace(/^```html\n?|```$/g, '').trim();
                    sendSuccess(res, code);
                } catch(e) { sendError(res, 500, 'Parse error'); }
            } else {
                let errMsg = `${label} error`;
                try { errMsg = JSON.parse(data).error?.message || errMsg; } catch(e) {}
                // If no key, suggest getting one
                if (apiRes.statusCode === 401 || apiRes.statusCode === 403) {
                    errMsg = `OpenRouter requires a free API key. Get one at openrouter.ai/keys → paste via ⚙️ Key button. (${errMsg})`;
                }
                sendError(res, apiRes.statusCode, errMsg);
            }
        });
    });
    apiReq.on('error', (e) => sendError(res, 500, e.message));
    apiReq.write(postData);
    apiReq.end();
}

// =========== HELPERS ===========
function sendSuccess(res, html) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ html }));
}
function sendError(res, status, message) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message } }));
}

// =========== HTTP SERVER ===========
const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (req.url === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, claude: !!CLAUDE_KEY, gemini: !!GEMINI_KEY, openrouter: !!OPENROUTER_KEY }));
        return;
    }

    if (req.url === '/api/setkey' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const p = JSON.parse(body);
                if (p.anthropic_key) { CLAUDE_KEY = p.anthropic_key.trim(); config.anthropic_key = CLAUDE_KEY; }
                if (p.gemini_key) { GEMINI_KEY = p.gemini_key.trim(); config.gemini_key = GEMINI_KEY; }
                if (p.openrouter_key) { OPENROUTER_KEY = p.openrouter_key.trim(); config.openrouter_key = OPENROUTER_KEY; }
                if (p.netlify_token) { config.netlify_token = p.netlify_token.trim(); }
                fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 4));
                console.log('🔑 Keys updated!');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    if (req.url === '/api/generate' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            let p;
            try { p = JSON.parse(body); } catch (e) {
                return sendError(res, 400, 'Invalid JSON');
            }
            switch (p.model) {
                case 'claude':    callClaude(p.prompt, res); break;
                case 'gemini':    callGemini(p.prompt, res); break;
                case 'llama':     callOpenRouter('meta-llama/llama-3.3-70b-instruct:free', 'Llama 3.3 70B', p.prompt, res); break;
                case 'mistral':   callOpenRouter('mistralai/mistral-small-3.1-24b-instruct:free', 'Mistral Small', p.prompt, res); break;
                case 'qwen':      callOpenRouter('qwen/qwen3-coder:free', 'Qwen3 Coder', p.prompt, res); break;
                case 'nemotron':  callOpenRouter('nvidia/nemotron-3-super-120b-a12b:free', 'Nemotron 120B', p.prompt, res); break;
                case 'hermes':    callOpenRouter('nousresearch/hermes-3-llama-3.1-405b:free', 'Hermes 405B', p.prompt, res); break;
                default:          callOpenRouter('meta-llama/llama-3.3-70b-instruct:free', 'Llama 3.3', p.prompt, res);
            }
        });
        return;
    }

    // Publish site
    if (req.url === '/api/publish' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const p = JSON.parse(body);
                const html = p.html || '';
                const name = (p.name || 'site').toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
                const slug = name + '-' + Date.now().toString(36);
                const sitesDir = path.join(__dirname, 'sites');
                if (!fs.existsSync(sitesDir)) fs.mkdirSync(sitesDir);
                fs.writeFileSync(path.join(sitesDir, slug + '.html'), html);
                const url = `http://localhost:${PORT}/sites/${slug}`;
                console.log(`📦 Published: ${url}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, url, slug }));
            } catch (e) {
                sendError(res, 400, e.message);
            }
        });
        return;
    }

    // Deploy to Netlify
    if (req.url === '/api/publish-netlify' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const p = JSON.parse(body);
                const html = p.html || '';
                const netlifyToken = config.netlify_token || '';
                if (!netlifyToken) {
                    sendError(res, 400, 'No Netlify token set. Click ⚙️ Key → type 3 → paste your token from app.netlify.com/user/applications#personal-access-tokens');
                    return;
                }

                const crypto = require('crypto');
                const sha1 = crypto.createHash('sha1').update(html).digest('hex');

                // Step 1: Create deploy with file manifest
                console.log('[Netlify] Creating deploy...');
                const deployData = JSON.stringify({
                    files: { '/index.html': sha1 }
                });

                const deployResult = await new Promise((resolve, reject) => {
                    const req2 = https.request({
                        hostname: 'api.netlify.com',
                        path: '/api/v1/sites',
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${netlifyToken}`,
                            'content-type': 'application/json',
                            'content-length': Buffer.byteLength(deployData)
                        }
                    }, (r) => {
                        let d = '';
                        r.on('data', c => d += c);
                        r.on('end', () => {
                            if (r.statusCode === 201 || r.statusCode === 200) resolve(JSON.parse(d));
                            else reject(new Error(`Netlify create site: ${r.statusCode} - ${d.slice(0, 200)}`));
                        });
                    });
                    req2.on('error', reject);
                    req2.write(deployData);
                    req2.end();
                });

                const siteId = deployResult.id;
                const siteUrl = deployResult.ssl_url || deployResult.url;
                console.log(`[Netlify] Site created: ${siteId}`);

                // Step 2: Create deploy with file hashes
                const deployBody = JSON.stringify({ files: { '/index.html': sha1 } });
                const deploy = await new Promise((resolve, reject) => {
                    const req3 = https.request({
                        hostname: 'api.netlify.com',
                        path: `/api/v1/sites/${siteId}/deploys`,
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${netlifyToken}`,
                            'content-type': 'application/json',
                            'content-length': Buffer.byteLength(deployBody)
                        }
                    }, (r) => {
                        let d = '';
                        r.on('data', c => d += c);
                        r.on('end', () => {
                            if (r.statusCode === 200 || r.statusCode === 201) resolve(JSON.parse(d));
                            else reject(new Error(`Netlify deploy: ${r.statusCode} - ${d.slice(0, 200)}`));
                        });
                    });
                    req3.on('error', reject);
                    req3.write(deployBody);
                    req3.end();
                });

                const deployId = deploy.id;
                console.log(`[Netlify] Deploy created: ${deployId}, uploading file...`);

                // Step 3: Upload the HTML file
                const fileData = Buffer.from(html, 'utf8');
                await new Promise((resolve, reject) => {
                    const req4 = https.request({
                        hostname: 'api.netlify.com',
                        path: `/api/v1/deploys/${deployId}/files/index.html`,
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${netlifyToken}`,
                            'content-type': 'application/octet-stream',
                            'content-length': fileData.length
                        }
                    }, (r) => {
                        let d = '';
                        r.on('data', c => d += c);
                        r.on('end', () => {
                            if (r.statusCode === 200 || r.statusCode === 201) resolve(d);
                            else reject(new Error(`Netlify upload: ${r.statusCode} - ${d.slice(0, 200)}`));
                        });
                    });
                    req4.on('error', reject);
                    req4.write(fileData);
                    req4.end();
                });

                console.log(`[Netlify] ✅ Deployed! ${siteUrl}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, url: siteUrl, admin: `https://app.netlify.com/sites/${deployResult.name}` }));

            } catch (e) {
                console.error('[Netlify] Error:', e.message);
                sendError(res, 500, e.message);
            }
        });
        return;
    }

    // List published sites
    if (req.url === '/api/sites') {
        const sitesDir = path.join(__dirname, 'sites');
        let sites = [];
        if (fs.existsSync(sitesDir)) {
            sites = fs.readdirSync(sitesDir)
                .filter(f => f.endsWith('.html'))
                .map(f => ({
                    slug: f.replace('.html', ''),
                    url: `http://localhost:${PORT}/sites/${f.replace('.html', '')}`,
                    created: fs.statSync(path.join(sitesDir, f)).mtime
                }))
                .sort((a, b) => new Date(b.created) - new Date(a.created));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ sites }));
        return;
    }

    // Serve published sites
    if (req.url.startsWith('/sites/')) {
        const slug = req.url.replace('/sites/', '').replace(/[^a-z0-9\-]/g, '');
        const filePath = path.join(__dirname, 'sites', slug + '.html');
        if (fs.existsSync(filePath)) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(fs.readFileSync(filePath));
        } else {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end('<h1>Site not found</h1>');
        }
        return;
    }

    // Static files
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    if (!filePath.startsWith(__dirname)) { res.writeHead(403); res.end(); return; }
    const ext = path.extname(filePath);
    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not Found'); return; }
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/plain' });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`\n🚀 XHURT AI Studio is running!`);
    console.log(`   Open: http://localhost:${PORT}`);
    console.log(`   Models: Claude 4, Gemini 2.0, DeepSeek V3, Llama 4, Mistral, Qwen3`);
    console.log(`   Free models need an OpenRouter key (free): openrouter.ai/keys\n`);
});
