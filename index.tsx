/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from '@google/genai';
import markdownit from 'markdown-it';
import { sanitizeHtml } from 'safevalues';
import { setElementInnerHtml } from 'safevalues/dom';

const md = markdownit({
    html: true,
    linkify: true,
    typographer: true,
});

// --- DOM elements ---
const chatContainer = document.getElementById('chat-container')!;
const chatMessages = document.getElementById('chat-messages')!;
const suggestionChipsContainer = document.getElementById('suggestion-chips')!;
const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement;
const sendButton = document.getElementById('send-btn') as HTMLButtonElement;
const imageUpload = document.getElementById('image-upload') as HTMLInputElement;
const imagePreviewContainer = document.getElementById('image-preview-container')!;
const imagePreview = document.getElementById('image-preview') as HTMLImageElement;
const removeImageButton = document.getElementById('remove-image-btn') as HTMLButtonElement;

// --- App State ---
let attachedImage: {
  base64: string;
  mimeType: string;
} | null = null;
let isLoading = false;

// --- Gemini AI Setup ---
let ai: GoogleGenAI;
let systemInstruction = '';

async function initializeAI() {
    try {
        const metadataResponse = await fetch('metadata.json');
        const appMetadata = await metadataResponse.json();
        systemInstruction = appMetadata.prompt;
        if (document.title && appMetadata.name) {
            document.title = appMetadata.name;
        }
        const h1 = document.querySelector('.app-header h1');
        if(h1 && appMetadata.name) {
            h1.textContent = appMetadata.name;
        }
         const p = document.querySelector('.app-header p');
        if(p && appMetadata.description) {
            p.textContent = appMetadata.description;
        }
        
        ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    } catch (e) {
        console.error('Failed to initialize AI', e);
        addMessage('model', 'Way shaqayn weyday. Fadlan hubi furahaaga (API key) iyo faylka metadata.json.');
    }
}


// --- UI Functions ---

function addMessage(role: 'user' | 'model', text: string, imageUrl: string | null = null) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}-message`;
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'content';
  
  let contentHtml = '';
  if (imageUrl) {
      const safeImageUrl = imageUrl.replace(/"/g, '&quot;');
      contentHtml += `<img src="${safeImageUrl}" alt="user upload" style="max-width: 200px; border-radius: 8px; margin-bottom: 8px; display: block;" />`;
  }
  
  if (role === 'user') {
      const textNode = document.createTextNode(text);
      const p = document.createElement('p');
      p.style.margin = '0';
      p.appendChild(textNode);
      contentHtml += p.outerHTML;
  } else {
      contentHtml += md.render(text);
  }
  
  setElementInnerHtml(contentDiv, sanitizeHtml(contentHtml));
  messageDiv.appendChild(contentDiv);

  chatMessages.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  return messageDiv;
}

function startLoading() {
    isLoading = true;
    updateSendButtonState();
    setElementInnerHtml(sendButton, sanitizeHtml('<div class="spinner"></div>'));

    const messageDiv = document.createElement('div');
    messageDiv.className = `message model-message loading`;
    const contentDiv = document.createElement('div');
    contentDiv.className = 'content';
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    contentDiv.appendChild(spinner);
    messageDiv.appendChild(contentDiv);

    chatMessages.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    return messageDiv;
}

function renderMarkdown(messageElement: HTMLElement, text: string) {
    const contentDiv = messageElement.querySelector('.content')!;
    const renderedHtml = md.render(text || "Waan ka xumahay, jawaab ma aanan soo saari karin.");
    setElementInnerHtml(contentDiv, sanitizeHtml(renderedHtml));
    messageElement.classList.remove('loading');
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function addQuickReplies(messageElement: HTMLElement, suggestions: string[]) {
    const repliesContainer = document.createElement('div');
    repliesContainer.className = 'quick-replies-container';

    suggestions.forEach(suggestionText => {
        const button = document.createElement('button');
        button.className = 'quick-reply-chip';
        button.textContent = suggestionText;
        button.onclick = () => {
            promptInput.value = suggestionText;
            adjustTextareaHeight();
            updateSendButtonState();
            promptInput.focus();
        };
        repliesContainer.appendChild(button);
    });
    
    messageElement.appendChild(repliesContainer);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}


function stopLoading(loadingMessage: HTMLElement, newText: string) {
    isLoading = false;
    updateSendButtonState();
    setElementInnerHtml(sendButton, sanitizeHtml('<i class="fa-solid fa-arrow-up"></i>'));
    
    try {
        const parsedResponse = JSON.parse(newText);
        
        if (parsedResponse.response) {
            renderMarkdown(loadingMessage, parsedResponse.response);
        } else {
            renderMarkdown(loadingMessage, "Waan ka xumahay, jawaab ma aanan helin.");
        }

        if (Array.isArray(parsedResponse.suggestions) && parsedResponse.suggestions.length > 0) {
            addQuickReplies(loadingMessage, parsedResponse.suggestions);
        }

    } catch (e) {
        console.error("Failed to parse model response as JSON:", e);
        renderMarkdown(loadingMessage, newText);
    }
}

function clearInput() {
  promptInput.value = '';
  attachedImage = null;
  imageUpload.value = '';
  imagePreviewContainer.style.display = 'none';
  adjustTextareaHeight();
}

function adjustTextareaHeight() {
    promptInput.style.height = 'auto';
    promptInput.style.height = `${Math.min(promptInput.scrollHeight, 100)}px`;
}

function updateSendButtonState() {
  sendButton.disabled = isLoading || (!promptInput.value.trim() && !attachedImage);
}


// --- Event Listeners ---

sendButton.addEventListener('click', () => handleSend());
promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
});

promptInput.addEventListener('input', () => {
    adjustTextareaHeight();
    updateSendButtonState();
});

imageUpload.addEventListener('change', (event) => {
  const files = (event.target as HTMLInputElement).files;
  if (files && files[0]) {
    const file = files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target!.result as string).split(',')[1];
      attachedImage = { base64, mimeType: file.type };
      imagePreview.src = e.target!.result as string;
      imagePreviewContainer.style.display = 'block';
      updateSendButtonState();
    };
    reader.readAsDataURL(file);
  }
});

removeImageButton.addEventListener('click', () => {
  attachedImage = null;
  imageUpload.value = '';
  imagePreviewContainer.style.display = 'none';
  updateSendButtonState();
});

suggestionChipsContainer.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('chip')) {
        const chipText = target.textContent || '';
        promptInput.value = chipText;
        adjustTextareaHeight();
        updateSendButtonState();
        promptInput.focus();
    }
});


// --- Core Logic ---
async function handleSend() {
  if (isLoading) return;
  const promptText = promptInput.value.trim();
  if (!promptText && !attachedImage) return;

  addMessage('user', promptText, attachedImage ? imagePreview.src : null);
  const loadingMessage = startLoading();
  const currentImage = attachedImage; // Capture the image for this request
  
  clearInput();
  updateSendButtonState();

  try {
    const parts: Array<{text: string} | {inlineData: {data: string, mimeType: string}}> = [];
    
    if (currentImage) {
        parts.push({
            inlineData: {
                data: currentImage.base64,
                mimeType: currentImage.mimeType,
            },
        });
    }

    if (promptText) {
        parts.push({ text: promptText });
    }

    const responseStream = await ai.models.generateContentStream({
        model: 'gemini-2.5-flash',
        contents: { parts },
        config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    response: { type: Type.STRING },
                    suggestions: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                    }
                }
            }
        }
    });

    let fullResponse = '';
    for await (const chunk of responseStream) {
        fullResponse += chunk.text;
    }
    stopLoading(loadingMessage, fullResponse);

  } catch (error) {
    console.error(error);
    const errorMessage = error instanceof Error ? error.message : 'Cilad aan la garanayn ayaa dhacday.';
    stopLoading(loadingMessage, `{"response": "**Cilad:** ${errorMessage.replace(/"/g, '\\"')}", "suggestions": []}`);
  }
}

// --- Initialization ---
(async () => {
    await initializeAI();
    updateSendButtonState();
    adjustTextareaHeight();
    promptInput.focus();
})();

export {};