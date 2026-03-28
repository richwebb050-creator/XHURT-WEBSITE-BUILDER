import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1';

const chatWindow = document.getElementById('chat-window');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');
const typingIndicator = document.getElementById('typing-indicator');

let generator = null;

// Initialize the model
async function initAI() {
    if (generator) return;
    typingIndicator.textContent = "Loading AI Core...";
    typingIndicator.style.display = 'block';
    
    try {
        // Using a tiny but capable model for speed
        generator = await pipeline('text2text-generation', 'Xenova/LaMini-Flan-T5-77M');
        typingIndicator.style.display = 'none';
        addMessage("AI Core Loaded. I am now fully intelligent.", "ai");
    } catch (err) {
        console.error("AI Initialization failed:", err);
        typingIndicator.textContent = "AI Initialization failed. Falling back to basic logic.";
        setTimeout(() => typingIndicator.style.display = 'none', 3000);
    }
}

function toggleChat() {
    chatWindow.style.display = chatWindow.style.display === 'flex' ? 'none' : 'flex';
    if (chatWindow.style.display === 'flex') {
        chatInput.focus();
        initAI(); // Init on first open
    }
}

async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    addMessage(text, 'user');
    chatInput.value = '';

    typingIndicator.textContent = "AI is thinking...";
    typingIndicator.style.display = 'block';
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (generator) {
        try {
            const output = await generator(text, { max_new_tokens: 100, temperature: 0.7 });
            typingIndicator.style.display = 'none';
            addMessage(output[0].generated_text, 'ai');
        } catch (err) {
            addMessage("Error generating response: " + err.message, "ai");
        }
    } else {
        // Fallback
        setTimeout(() => {
            typingIndicator.style.display = 'none';
            addMessage("I'm still warming up my circuits. Please try again in a few seconds.", 'ai');
        }, 1000);
    }
}

function addMessage(text, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}`;
    msgDiv.textContent = text;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Allow Enter to send
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});
