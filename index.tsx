/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, Chat } from '@google/genai';

// Note: The API key is defined in the build environment.
const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement;
const sendButton = document.getElementById('send-button') as HTMLButtonElement;
const responseContainer = document.getElementById('response-container') as HTMLDivElement;
const loader = document.getElementById('loader') as HTMLDivElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const fileDisplayContainer = document.getElementById('file-display') as HTMLDivElement;
const fileNameElement = document.getElementById('file-name') as HTMLSpanElement;
const removeFileButton = document.getElementById('remove-file-button') as HTMLButtonElement;
const attachButton = document.getElementById('attach-button') as HTMLLabelElement;
const recommendedPromptsList = document.getElementById('recommended-prompts-list') as HTMLUListElement;
const anonymizeCheckbox = document.getElementById('anonymize-checkbox') as HTMLInputElement;
const chatToggleButton = document.getElementById('chat-toggle-button') as HTMLButtonElement;

// Sidebar elements
const mainLayout = document.getElementById('main-layout') as HTMLDivElement;
const sidebarToggleButton = document.getElementById('sidebar-toggle-button') as HTMLButtonElement;
const sidebarOpenButton = document.getElementById('sidebar-open-button') as HTMLButtonElement;

// New DOM elements for usage tracker
const dailyCreditsTextEl = document.getElementById('daily-credits-text') as HTMLSpanElement;
const dailyProgressBarEl = document.getElementById('daily-progress-bar') as HTMLDivElement;
const weeklyCreditsTextEl = document.getElementById('weekly-credits-text') as HTMLSpanElement;
const weeklyProgressBarEl = document.getElementById('weekly-progress-bar') as HTMLDivElement;
const monthlyCreditsTextEl = document.getElementById('monthly-credits-text') as HTMLSpanElement;
const monthlyProgressBarEl = document.getElementById('monthly-progress-bar') as HTMLDivElement;

// New Modal elements
const aboutButton = document.getElementById('about-button') as HTMLButtonElement;
const aboutModal = document.getElementById('about-modal') as HTMLDivElement;
const modalCloseButton = document.getElementById('modal-close-button') as HTMLButtonElement;


let selectedFile: File | null = null;
let isChatMode = false;
let chat: Chat | null = null;

// State for prompt usage
const promptUsage = {
  daily: { consumed: 0, limit: 50 },
  weekly: { consumed: 0, limit: 250 },
  monthly: { consumed: 0, limit: 1000 },
};

// Function to update the usage display
const updatePromptUsageDisplay = () => {
  // Daily
  if (dailyCreditsTextEl && dailyProgressBarEl) {
    const { consumed, limit } = promptUsage.daily;
    const percentageUsed = limit > 0 ? (consumed / limit) * 100 : 0;
    dailyCreditsTextEl.textContent = `${consumed} / ${limit}`;
    dailyProgressBarEl.style.width = `${percentageUsed}%`;
  }
  
  // Weekly
  if (weeklyCreditsTextEl && weeklyProgressBarEl) {
    const { consumed, limit } = promptUsage.weekly;
    const percentageUsed = limit > 0 ? (consumed / limit) * 100 : 0;
    weeklyCreditsTextEl.textContent = `${consumed} / ${limit}`;
    weeklyProgressBarEl.style.width = `${percentageUsed}%`;
  }

  // Monthly
  if (monthlyCreditsTextEl && monthlyProgressBarEl) {
    const { consumed, limit } = promptUsage.monthly;
    const percentageUsed = limit > 0 ? (consumed / limit) * 100 : 0;
    monthlyCreditsTextEl.textContent = `${consumed} / ${limit}`;
    monthlyProgressBarEl.style.width = `${percentageUsed}%`;
  }
};


const setUiLoading = (isLoading: boolean) => {
  if (isLoading) {
    loader.classList.remove('hidden');
    sendButton.disabled = true;
    chatToggleButton.disabled = true;
    promptInput.disabled = true;
    fileInput.disabled = true;
    anonymizeCheckbox.disabled = true;
    // Visually disable the attach button label
    attachButton.style.cursor = 'not-allowed';
    attachButton.style.opacity = '0.5';

  } else {
    loader.classList.add('hidden');
    sendButton.disabled = false;
    chatToggleButton.disabled = false;
    promptInput.disabled = false;
    fileInput.disabled = false;
    // Only re-enable anonymize checkbox if not in chat mode
    anonymizeCheckbox.disabled = isChatMode;
    attachButton.style.cursor = 'pointer';
    attachButton.style.opacity = '1';
    promptInput.focus();
  }
};

const updateFileDisplay = () => {
  if (selectedFile) {
    fileNameElement.textContent = selectedFile.name;
    fileDisplayContainer.classList.remove('hidden');
  } else {
    fileNameElement.textContent = '';
    fileDisplayContainer.classList.add('hidden');
  }
};

const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    selectedFile = target.files[0];
    updateFileDisplay();
  }
};

const removeFile = () => {
  selectedFile = null;
  fileInput.value = ''; // Reset the file input so the 'change' event fires again
  updateFileDisplay();
};

const fileToGenerativePart = (file: File): Promise<{ inlineData: { data: string; mimeType: string; } }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result !== 'string') {
        return reject(new Error("Failed to read file."));
      }
      // result is "data:[<mediatype>];base64,<data>"
      const base64Data = reader.result.split(',')[1];
      resolve({
        inlineData: {
          data: base64Data,
          mimeType: file.type,
        },
      });
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};

const appendChatMessage = (role: 'user' | 'model', text: string): HTMLElement => {
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('chat-message', `${role}-message`);
  messageDiv.textContent = text;
  responseContainer.appendChild(messageDiv);
  // Ensure the view scrolls to the latest message
  responseContainer.scrollTop = responseContainer.scrollHeight;
  return messageDiv;
};


const handleSingleSend = async () => {
  const prompt = promptInput.value.trim();
  const shouldAnonymize = anonymizeCheckbox.checked && selectedFile;

  responseContainer.textContent = '';
  setUiLoading(true);

  try {
    const parts = [];
    let finalPrompt = prompt;

    if (selectedFile) {
      const filePart = await fileToGenerativePart(selectedFile);
      parts.push(filePart);
    }
    
    if (shouldAnonymize) {
      finalPrompt = `IMPORTANTE: Primeiro, anonimize o conteúdo do documento fornecido, de acordo com a LGPD. Substitua todos os dados pessoais como nomes, CPFs, RGs, endereços, e-mails e números de telefone por placeholders como [NOME], [CPF], [ENDEREÇO], etc. Após a anonimização, e usando apenas o conteúdo anonimizado, responda à seguinte pergunta: "${prompt}"`;
      responseContainer.textContent = 'Anonimizando documento para proteger dados sensíveis antes de responder...';
    }

    if (finalPrompt) {
      parts.push({ text: finalPrompt });
    }
    
    const contents = { parts };

    // Clear loading message before streaming the actual response
    if (shouldAnonymize) {
        await new Promise(resolve => setTimeout(resolve, 500)); // Short delay to show the message
        responseContainer.textContent = '';
    }

    const response = await ai.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: contents,
    });

    for await (const chunk of response) {
      responseContainer.textContent += chunk.text;
    }
  } catch (error) {
    console.error(error);
    responseContainer.textContent = 'Error: Failed to get a response. Please check the console for more details.';
  } finally {
    promptInput.value = '';
    removeFile();
    setUiLoading(false);
  }
};

const handleChatSend = async () => {
  if (!chat) return;

  const prompt = promptInput.value.trim();
  setUiLoading(true);

  try {
    const parts = [];
    if (selectedFile) {
      const filePart = await fileToGenerativePart(selectedFile);
      parts.push(filePart);
    }
    if (prompt) {
      parts.push({ text: prompt });
    }

    // Display user's message immediately
    appendChatMessage('user', prompt);
    promptInput.value = '';
    removeFile();
    
    // Create a container for the model's response and stream into it
    const modelResponseElement = appendChatMessage('model', '');
    
    // FIX: The `sendMessageStream` method expects the content parts to be in a 'message' property.
    const response = await chat.sendMessageStream({ message: parts });

    for await (const chunk of response) {
      modelResponseElement.textContent += chunk.text;
      responseContainer.scrollTop = responseContainer.scrollHeight;
    }

  } catch (error) {
    console.error(error);
    appendChatMessage('model', 'Error: Failed to get a response. Please check the console.');
  } finally {
    setUiLoading(false);
  }
}

const handleSend = async () => {
  const prompt = promptInput.value.trim();
  if (!prompt && !selectedFile) {
    return;
  }
  
  // Increment and update usage before sending
  promptUsage.daily.consumed++;
  promptUsage.weekly.consumed++;
  promptUsage.monthly.consumed++;
  updatePromptUsageDisplay();

  if (isChatMode) {
    await handleChatSend();
  } else {
    await handleSingleSend();
  }
};

const toggleChatMode = () => {
  isChatMode = !isChatMode;
  responseContainer.innerHTML = ''; // Clear previous content

  if (isChatMode) {
    chat = ai.chats.create({ model: 'gemini-2.5-flash' });
    chatToggleButton.classList.add('active');
    responseContainer.classList.add('chat-mode');
    promptInput.placeholder = 'Send a message...';
    anonymizeCheckbox.checked = false;
    anonymizeCheckbox.disabled = true;
  } else {
    chat = null;
    chatToggleButton.classList.remove('active');
    responseContainer.classList.remove('chat-mode');
    promptInput.placeholder = 'Ask me anything...';
    anonymizeCheckbox.disabled = false;
  }
};


const handleRecommendedPromptClick = (event: MouseEvent) => {
  const target = event.target as HTMLElement;
  if (target.tagName === 'LI' && target.parentElement === recommendedPromptsList) {
    const promptText = (target as HTMLLIElement).dataset.prompt || target.textContent || '';
    promptInput.value = promptText;
    promptInput.focus();
  }
};

const toggleSidebar = () => {
  if (mainLayout) {
    mainLayout.classList.toggle('sidebar-collapsed');
  }
};

// Functions to control the modal
const openAboutModal = () => {
  if (aboutModal) {
    aboutModal.classList.remove('hidden');
  }
};

const closeAboutModal = () => {
  if (aboutModal) {
    aboutModal.classList.add('hidden');
  }
};

sendButton.addEventListener('click', handleSend);
chatToggleButton.addEventListener('click', toggleChatMode);

promptInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    handleSend();
  }
});

fileInput.addEventListener('change', handleFileChange);
removeFileButton.addEventListener('click', removeFile);
recommendedPromptsList.addEventListener('click', handleRecommendedPromptClick);

// Modal event listeners
if (aboutButton && aboutModal && modalCloseButton) {
  aboutButton.addEventListener('click', openAboutModal);
  modalCloseButton.addEventListener('click', closeAboutModal);

  // Close modal on overlay click
  aboutModal.addEventListener('click', (event) => {
    if (event.target === aboutModal) {
      closeAboutModal();
    }
  });

  // Close modal on Escape key press
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !aboutModal.classList.contains('hidden')) {
      closeAboutModal();
    }
  });
}

// Sidebar toggle listeners
if (sidebarToggleButton && sidebarOpenButton) {
  sidebarToggleButton.addEventListener('click', toggleSidebar);
  sidebarOpenButton.addEventListener('click', toggleSidebar);
}

// Initial state
setUiLoading(false);
updatePromptUsageDisplay(); // Initial display update