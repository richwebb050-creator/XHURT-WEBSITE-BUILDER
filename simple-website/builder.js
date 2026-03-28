const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');
const typingIndicator = document.getElementById('typing-indicator');
const previewFrame = document.getElementById('preview-frame');
const modelStatus = document.getElementById('model-status');

let generator = null;

// Initial template for the preview
const DEFAULT_HTML = `
<html>
<head>
    <style>
        body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f0f0f0; }
        .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; }
    </style>
</head>
<body>
    <div class="card">
        <h1>Your AI Preview</h1>
        <p>Type in the chat to generate a website!</p>
    </div>
</body>
</html>
`;

previewFrame.srcdoc = DEFAULT_HTML;

async function initAI() {
    if (generator) return;
    modelStatus.textContent = "Status: Initializing AI Core...";
    
    try {
        // Using global 'transformers' from the script tag
        const { pipeline } = await transformers;
        generator = await pipeline('text2text-generation', 'Xenova/LaMini-Flan-T5-77M');
        modelStatus.textContent = "Status: AI Ready";
        addMessage("Welcome! I'm your AI Builder. Tell me what kind of page you want to create and I'll generate the code and preview it for you.", "ai");
    } catch (err) {
        modelStatus.textContent = "Status: Initialization Failed";
        console.error(err);
        addMessage("Failed to load AI Core. This might be due to browser security restrictions on local files. Try running this through a local server.", "ai");
    }
}

async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    addMessage(text, 'user');
    chatInput.value = '';

    typingIndicator.style.display = 'block';
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (generator) {
        try {
            const prompt = `Generate a simple HTML and CSS web page snippet for: ${text}. Include internal <style> tags.`;
            const output = await generator(prompt, { max_new_tokens: 500, temperature: 0.7 });
            
            const generatedText = output[0].generated_text;
            typingIndicator.style.display = 'none';
            
            processGeneration(generatedText);
        } catch (err) {
            addMessage("Generation Error: " + err.message, "ai");
        }
    } else {
        setTimeout(() => {
            typingIndicator.style.display = 'none';
            if (!generator && modelStatus.textContent.includes('Initializing')) {
                addMessage("AI is still loading. This usually takes about 30 seconds for the first time.", "ai");
            }
        }, 1000);
    }
}

function processGeneration(text) {
    let htmlContent = text;
    if (!text.includes('<html') && !text.includes('<div') && !text.includes('<style')) {
        htmlContent = `
        <html>
        <body style="font-family: sans-serif; padding: 2rem;">
            <h1>Generated Result</h1>
            <p>${text}</p>
        </body>
        </html>`;
    }

    addMessage("Page generated! Check the preview.", "ai");
    updatePreview(htmlContent);
}

function updatePreview(code) {
    previewFrame.srcdoc = code;
}

function addMessage(text, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}`;
    msgDiv.textContent = text;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

window.sendMessage = sendMessage;
window.setDevice = (mode) => {
    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    
    if (mode === 'mobile') {
        previewFrame.style.width = '375px';
    } else {
        previewFrame.style.width = '100%';
    }
};

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

initAI();
