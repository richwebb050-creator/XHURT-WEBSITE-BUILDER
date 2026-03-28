const https = require('https');

// System Prompt
const SYSTEM_PROMPT = "You are an expert web developer. Generate a beautiful, modern, single-file HTML5 website with embedded CSS and JS. Return ONLY raw HTML. Be extremely concise to finish fast.";

const KEYS = {
    anthropic: "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",
    gemini: "AIzaSyCuvCQI8oar6R4zqmWuunp0E1s4rhyoZT8",
    openrouter: "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"
};

exports.handler = async (event) => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };

    const path = event.path.replace(/\/.netlify\/functions\/api/, '').replace(/\/api/, '');

    if (path === '/generate' && event.httpMethod === 'POST') {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Netlify Limit (10s) reached. Use Gemini for faster results.")), 9500));
        
        try {
            const body = JSON.parse(event.body);
            const model = body.model || 'llama';
            const prompt = body.prompt;

            const CLAUDE_KEY = body.keys?.anthropic_key || process.env.ANTHROPIC_KEY || KEYS.anthropic;
            const GEMINI_KEY = body.keys?.gemini_key || process.env.GEMINI_KEY || KEYS.gemini;
            const OPENROUTER_KEY = body.keys?.openrouter_key || process.env.OPENROUTER_KEY || KEYS.openrouter;

            const makeReq = (options, data) => new Promise((resolve, reject) => {
                const req = https.request(options, res => {
                    let d = ''; res.on('data', c => d += c);
                    res.on('end', () => {
                        try { resolve(JSON.parse(d)); } catch(e) { resolve(d); }
                    });
                });
                req.on('error', reject); req.write(data); req.end();
            });

            const generateTask = (async () => {
                if (model === 'claude') {
                    const res = await makeReq({ hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST', headers: { 'x-api-key': CLAUDE_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' } }, JSON.stringify({ model: "claude-3-5-sonnet-20240620", max_tokens: 4096, system: SYSTEM_PROMPT, messages: [{ role: "user", content: prompt }] }));
                    return res.content[0].text.trim();
                }
                if (model === 'gemini') {
                    const res = await makeReq({ hostname: 'generativelanguage.googleapis.com', path: `/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`, method: 'POST', headers: { 'content-type': 'application/json' } }, JSON.stringify({ contents: [{ parts: [{ text: SYSTEM_PROMPT + "\n\nUser: " + prompt }] }] }));
                    return res.candidates[0].content.parts[0].text.trim();
                }
                // OpenRouter
                const mId = model === 'llama' ? 'meta-llama/llama-3.3-70b-instruct:free' : model === 'mistral' ? 'mistralai/mistral-small-3.1-24b-instruct:free' : 'qwen/qwen3-coder:free';
                const res = await makeReq({ hostname: 'openrouter.ai', path: '/api/v1/chat/completions', method: 'POST', headers: { 'Authorization': `Bearer ${OPENROUTER_KEY}`, 'content-type': 'application/json', 'HTTP-Referer': 'https://xhurt.netlify.app' } }, JSON.stringify({ model: mId, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: prompt }], max_tokens: 4096 }));
                if (res.error) throw new Error(res.error.message);
                return res.choices[0].message.content.trim();
            })();

            const html = await Promise.race([generateTask, timeoutPromise]);
            return { statusCode: 200, headers, body: JSON.stringify({ html }) };

        } catch (e) {
            return { statusCode: 200, headers, body: JSON.stringify({ error: { message: e.message } }) };
        }
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: "Endpoint not found" }) };
};
