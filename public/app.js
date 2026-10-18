/**
 * Chabita AI Assistant - Frontend Application
 */

// State
let conversations = [];
let currentChatId = null;
let isStreaming = false;
let currentMode = 'warm_simple';
let recognition = null;
let isRecording = false;

// Auth State
let authToken = localStorage.getItem('chabita_auth_token') || null;
let currentUser = null;
let authModalMode = 'login'; // 'login' or 'register'

// DOM Elements
const chatContainer = document.getElementById('chatContainer');
const messagesList = document.getElementById('messagesList');
const welcomeHero = document.getElementById('welcomeHero');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const voiceInputBtn = document.getElementById('voiceInputBtn');
const newChatBtn = document.getElementById('newChatBtn');
const chatHistoryList = document.getElementById('chatHistoryList');
const clearAllChatsBtn = document.getElementById('clearAllChatsBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeIcon = document.getElementById('themeIcon');
const personaModeSelect = document.getElementById('personaModeSelect');
const currentModeLabel = document.getElementById('currentModeLabel');
const exportChatBtn = document.getElementById('exportChatBtn');
const sidebar = document.getElementById('sidebar');
const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
const closeSidebarBtn = document.getElementById('closeSidebarBtn');

// Auth DOM Elements
const userProfileCard = document.getElementById('userProfileCard');
const userProfileAvatar = document.getElementById('userProfileAvatar');
const userProfileName = document.getElementById('userProfileName');
const userProfileStatus = document.getElementById('userProfileStatus');
const authActionBtn = document.getElementById('authActionBtn');
const navAuthBtn = document.getElementById('navAuthBtn');
const navAuthText = document.getElementById('navAuthText');

const authModal = document.getElementById('authModal');
const closeAuthModalBtn = document.getElementById('closeAuthModalBtn');
const authModalTitle = document.getElementById('authModalTitle');
const authModalSubtitle = document.getElementById('authModalSubtitle');
const tabSignIn = document.getElementById('tabSignIn');
const tabSignUp = document.getElementById('tabSignUp');
const authForm = document.getElementById('authForm');
const authErrorBanner = document.getElementById('authErrorBanner');
const authUsername = document.getElementById('authUsername');
const authPassword = document.getElementById('authPassword');
const authConfirmPassword = document.getElementById('authConfirmPassword');
const confirmPasswordGroup = document.getElementById('confirmPasswordGroup');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const demoLoginBtn = document.getElementById('demoLoginBtn');
const guestModeBtn = document.getElementById('guestModeBtn');

// Initialize Marked & Highlight.js
if (typeof marked !== 'undefined') {
  marked.setOptions({
    breaks: true,
    gfm: true,
    highlight: function(code, lang) {
      if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value;
        } catch (e) {}
      }
      return typeof hljs !== 'undefined' ? hljs.highlightAuto(code).value : code;
    }
  });
}

// Custom renderer for code blocks with copy header
const renderer = new marked.Renderer();
renderer.code = function(code, language) {
  const lang = language || 'code';
  const highlighted = (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang))
    ? hljs.highlight(code, { language: lang }).value
    : (typeof hljs !== 'undefined' ? hljs.highlightAuto(code).value : code);

  return `
    <div class="code-block-wrapper">
      <div class="code-header">
        <span>${lang}</span>
        <button class="copy-code-btn" onclick="copyCodeSnippet(this)">Copy code</button>
      </div>
      <pre><code class="hljs language-${lang}">${highlighted}</code></pre>
    </div>
  `;
};

marked.use({ renderer });

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  loadTheme();
  checkAuthStatus();
  loadHistoryFromStorage();
  setupSpeechRecognition();
  bindEventListeners();
  autoResizeTextarea();

  if (!currentChatId || !getChat(currentChatId)) {
    createNewChat();
  } else {
    renderCurrentChat();
  }

  // If first time visiting (not logged in and hasn't chosen guest mode), show choice modal
  const hasChosenGuest = localStorage.getItem('chabita_guest_mode');
  if (!authToken && !hasChosenGuest) {
    setTimeout(() => {
      openAuthModal('login');
    }, 400);
  }
});

// Event Listeners
function bindEventListeners() {
  // Sending messages
  sendBtn.addEventListener('click', handleSendMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  // Auto-resize textarea
  chatInput.addEventListener('input', autoResizeTextarea);

  // New Chat
  newChatBtn.addEventListener('click', () => {
    if (isStreaming) return;
    createNewChat();
  });

  // Mode Selection
  personaModeSelect.addEventListener('change', (e) => {
    currentMode = e.target.value;
    const modeNames = {
      warm_simple: 'Warm & Simple',
      concise: 'Quick & Concise',
      detailed: 'Step-by-Step Deep Dive'
    };
    currentModeLabel.textContent = modeNames[currentMode] || 'Warm & Simple';
  });

  // Export
  exportChatBtn.addEventListener('click', exportConversation);

  // Theme toggle
  themeToggleBtn.addEventListener('click', toggleTheme);

  // Clear history
  clearAllChatsBtn.addEventListener('click', clearAllChats);

  // Mobile sidebar
  if (toggleSidebarBtn) {
    toggleSidebarBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
  }
  if (closeSidebarBtn) {
    closeSidebarBtn.addEventListener('click', () => sidebar.classList.remove('open'));
  }

  // Suggestion Cards
  document.querySelectorAll('.suggestion-card').forEach(card => {
    card.addEventListener('click', () => {
      const prompt = card.getAttribute('data-prompt');
      if (prompt) {
        chatInput.value = prompt;
        autoResizeTextarea();
        handleSendMessage();
      }
    });
  });

  // Voice Input
  if (voiceInputBtn) {
    voiceInputBtn.addEventListener('click', toggleVoiceInput);
  }

  // Auth Modal Triggers
  authActionBtn.addEventListener('click', () => {
    if (currentUser) {
      handleLogout();
    } else {
      openAuthModal('login');
    }
  });

  navAuthBtn.addEventListener('click', () => {
    if (currentUser) {
      handleLogout();
    } else {
      openAuthModal('login');
    }
  });

  closeAuthModalBtn.addEventListener('click', closeAuthModal);
  authModal.addEventListener('click', (e) => {
    if (e.target === authModal) closeAuthModal();
  });

  tabSignIn.addEventListener('click', () => switchAuthTab('login'));
  tabSignUp.addEventListener('click', () => switchAuthTab('register'));

  authForm.addEventListener('submit', handleAuthSubmit);
  demoLoginBtn.addEventListener('click', handleDemoLogin);
  if (guestModeBtn) {
    guestModeBtn.addEventListener('click', handleGuestMode);
  }
}

// --- Authentication Logic ---
async function checkAuthStatus() {
  if (!authToken) {
    updateAuthUI(null);
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (data.authenticated && data.username) {
      currentUser = data.username;
      updateAuthUI(currentUser);
    } else {
      authToken = null;
      localStorage.removeItem('chabita_auth_token');
      updateAuthUI(null);
    }
  } catch (err) {
    console.warn('Could not verify auth token:', err);
    updateAuthUI(null);
  }
}

function updateAuthUI(username) {
  if (username) {
    userProfileAvatar.textContent = username.charAt(0).toUpperCase();
    userProfileName.textContent = username;
    userProfileStatus.textContent = 'Account Active';
    authActionBtn.textContent = 'Log Out';
    navAuthText.textContent = `Sign Out (${username})`;
  } else {
    userProfileAvatar.textContent = '🚀';
    userProfileName.textContent = 'Guest User';
    userProfileStatus.textContent = 'Guest Mode · Local storage';
    authActionBtn.textContent = 'Sign In';
    navAuthText.textContent = 'Sign In';
  }
}

function openAuthModal(mode = 'login') {
  authErrorBanner.style.display = 'none';
  authErrorBanner.textContent = '';
  switchAuthTab(mode);
  authModal.style.display = 'flex';
  authUsername.focus();
}

function closeAuthModal() {
  authModal.style.display = 'none';
}

function switchAuthTab(mode) {
  authModalMode = mode;
  authErrorBanner.style.display = 'none';

  if (mode === 'login') {
    tabSignIn.classList.add('active');
    tabSignUp.classList.remove('active');
    authModalTitle.textContent = 'Welcome Back! 👋';
    authModalSubtitle.textContent = 'Sign in to access your saved conversations';
    confirmPasswordGroup.style.display = 'none';
    authConfirmPassword.removeAttribute('required');
    authSubmitBtn.textContent = 'Sign In';
  } else {
    tabSignUp.classList.add('active');
    tabSignIn.classList.remove('active');
    authModalTitle.textContent = 'Create an Account 🌸';
    authModalSubtitle.textContent = 'Join Chabita for a personalized AI assistant experience';
    confirmPasswordGroup.style.display = 'block';
    authConfirmPassword.setAttribute('required', 'true');
    authSubmitBtn.textContent = 'Create Account';
  }
}

async function handleAuthSubmit(e) {
  if (e) e.preventDefault();
  const username = authUsername.value.trim();
  const password = authPassword.value.trim();
  const confirmPassword = authConfirmPassword.value.trim();

  authErrorBanner.style.display = 'none';

  if (!username || !password) {
    showAuthError('Please fill in both username and password.');
    return;
  }

  if (authModalMode === 'register') {
    if (password !== confirmPassword) {
      showAuthError('Passwords do not match. Please check again.');
      return;
    }
  }

  const endpoint = authModalMode === 'register' ? '/api/auth/register' : '/api/auth/login';

  try {
    authSubmitBtn.disabled = true;
    authSubmitBtn.textContent = 'Please wait...';

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok) {
      showAuthError(data.detail || 'Authentication failed. Please try again.');
      return;
    }

    if (data.token) {
      authToken = data.token;
      currentUser = data.username;
      localStorage.setItem('chabita_auth_token', authToken);
      updateAuthUI(currentUser);
      closeAuthModal();
      authForm.reset();
    }
  } catch (err) {
    showAuthError('Network error connecting to the server. Please check your connection.');
  } finally {
    authSubmitBtn.disabled = false;
    authSubmitBtn.textContent = authModalMode === 'register' ? 'Create Account' : 'Sign In';
  }
}

async function handleDemoLogin() {
  authUsername.value = 'demo';
  authPassword.value = 'chabita123';
  switchAuthTab('login');
  await handleAuthSubmit();
}

function handleGuestMode() {
  localStorage.setItem('chabita_guest_mode', 'true');
  currentUser = null;
  authToken = null;
  updateAuthUI(null);
  closeAuthModal();
  chatInput.focus();
}

async function handleLogout() {
  if (confirm('Are you sure you want to log out?')) {
    try {
      if (authToken) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
      }
    } catch (e) {
      console.warn('Logout request failed:', e);
    }
    authToken = null;
    currentUser = null;
    localStorage.removeItem('chabita_auth_token');
    updateAuthUI(null);
  }
}

function showAuthError(msg) {
  authErrorBanner.textContent = msg;
  authErrorBanner.style.display = 'block';
}

// Textarea auto-resize
function autoResizeTextarea() {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + 'px';
}

// Chat Storage & Management
function loadHistoryFromStorage() {
  try {
    const saved = localStorage.getItem('chabita_conversations');
    conversations = saved ? JSON.parse(saved) : [];
    const lastId = localStorage.getItem('chabita_current_id');
    currentChatId = lastId || (conversations.length > 0 ? conversations[0].id : null);
  } catch (e) {
    console.error('Error loading history:', e);
    conversations = [];
    currentChatId = null;
  }
  renderHistoryList();
}

function saveHistoryToStorage() {
  try {
    localStorage.setItem('chabita_conversations', JSON.stringify(conversations));
    if (currentChatId) {
      localStorage.setItem('chabita_current_id', currentChatId);
    }
  } catch (e) {
    console.error('Error saving history:', e);
  }
  renderHistoryList();
}

function createNewChat() {
  const newChat = {
    id: 'chat_' + Date.now(),
    title: 'New conversation',
    timestamp: new Date().toISOString(),
    messages: []
  };
  conversations.unshift(newChat);
  currentChatId = newChat.id;
  saveHistoryToStorage();
  renderCurrentChat();
  chatInput.focus();
}

function getChat(id) {
  return conversations.find(c => c.id === id);
}

function renderHistoryList() {
  chatHistoryList.innerHTML = '';
  conversations.forEach(chat => {
    const item = document.createElement('div');
    item.className = `history-item ${chat.id === currentChatId ? 'active' : ''}`;
    
    const titleSpan = document.createElement('span');
    titleSpan.className = 'history-item-title';
    titleSpan.textContent = chat.title || 'Untitled conversation';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'history-delete-btn';
    deleteBtn.innerHTML = '✕';
    deleteBtn.title = 'Delete conversation';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteChat(chat.id);
    });

    item.appendChild(titleSpan);
    item.appendChild(deleteBtn);

    item.addEventListener('click', () => {
      if (isStreaming) return;
      currentChatId = chat.id;
      saveHistoryToStorage();
      renderCurrentChat();
      if (window.innerWidth <= 768) {
        sidebar.classList.remove('open');
      }
    });

    chatHistoryList.appendChild(item);
  });
}

function deleteChat(id) {
  conversations = conversations.filter(c => c.id !== id);
  if (currentChatId === id) {
    currentChatId = conversations.length > 0 ? conversations[0].id : null;
    if (!currentChatId) {
      createNewChat();
      return;
    }
  }
  saveHistoryToStorage();
  renderCurrentChat();
}

function clearAllChats() {
  if (confirm('Are you sure you want to clear all conversation history?')) {
    conversations = [];
    currentChatId = null;
    createNewChat();
  }
}

// Rendering Messages
function renderCurrentChat() {
  const chat = getChat(currentChatId);
  messagesList.innerHTML = '';

  if (!chat || chat.messages.length === 0) {
    welcomeHero.style.display = 'block';
  } else {
    welcomeHero.style.display = 'none';
    chat.messages.forEach((msg, idx) => {
      appendMessageToDOM(msg.role, msg.content, idx);
    });
  }

  scrollToBottom();
  renderHistoryList();
}

function appendMessageToDOM(role, content, index) {
  welcomeHero.style.display = 'none';

  const row = document.createElement('div');
  row.className = `message-row ${role}`;
  row.dataset.index = index;

  if (role === 'assistant') {
    const avatar = document.createElement('img');
    avatar.src = 'favicon.svg';
    avatar.alt = 'Chabita';
    avatar.className = 'message-avatar';
    row.appendChild(avatar);
  }

  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'message-content-wrapper';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  if (role === 'user') {
    bubble.textContent = content;
  } else {
    bubble.innerHTML = marked.parse(content || '');
  }

  contentWrapper.appendChild(bubble);

  // Actions for assistant message
  if (role === 'assistant') {
    const actions = document.createElement('div');
    actions.className = 'message-actions';

    // Copy Button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'action-icon-btn';
    copyBtn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      <span>Copy</span>
    `;
    copyBtn.addEventListener('click', () => copyMessageText(content, copyBtn));

    // Read Aloud (TTS) Button
    const ttsBtn = document.createElement('button');
    ttsBtn.className = 'action-icon-btn';
    ttsBtn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
      </svg>
      <span>Listen</span>
    `;
    ttsBtn.addEventListener('click', () => toggleReadAloud(content, ttsBtn));

    actions.appendChild(copyBtn);
    actions.appendChild(ttsBtn);
    contentWrapper.appendChild(actions);
  }

  row.appendChild(contentWrapper);
  messagesList.appendChild(row);
  return bubble;
}

// Send Message Handler
async function handleSendMessage() {
  const text = chatInput.value.trim();
  if (!text || isStreaming) return;

  const chat = getChat(currentChatId);
  if (!chat) return;

  // Add User Message
  chat.messages.push({ role: 'user', content: text });

  // Update conversation title on first message
  if (chat.messages.length === 1) {
    chat.title = text.slice(0, 32) + (text.length > 32 ? '...' : '');
  }

  // Clear Input
  chatInput.value = '';
  autoResizeTextarea();
  saveHistoryToStorage();
  renderCurrentChat();

  // Create empty assistant response row
  isStreaming = true;
  sendBtn.disabled = true;

  const assistantBubble = appendMessageToDOM('assistant', '', chat.messages.length);
  const typingCursor = document.createElement('span');
  typingCursor.className = 'typing-cursor';
  assistantBubble.appendChild(typingCursor);
  scrollToBottom();

  let accumulatedText = '';

  try {
    const payload = {
      messages: chat.messages.map(m => ({ role: m.role, content: m.content })),
      mode: currentMode,
      temperature: 0.7
    };

    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Server returned status ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let done = false;
    let buffer = '';

    while (!done) {
      const { value, done: streamDone } = await reader.read();
      done = streamDone;
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep last incomplete line

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const dataStr = line.slice(5).trim();
          if (dataStr === '[DONE]') {
            done = true;
            break;
          }

          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.error) {
              accumulatedText += `\n\n> ⚠️ *${parsed.error}*`;
            } else if (parsed.text) {
              accumulatedText += parsed.text;
            }
            assistantBubble.innerHTML = marked.parse(accumulatedText);
            assistantBubble.appendChild(typingCursor);
            scrollToBottom();
          } catch (jsonErr) {
            console.warn('Could not parse SSE JSON:', jsonErr);
          }
        }
      }
    }

    // Finalize assistant message
    typingCursor.remove();
    assistantBubble.innerHTML = marked.parse(accumulatedText || 'I am ready for your next request!');
    chat.messages.push({ role: 'assistant', content: accumulatedText });
    saveHistoryToStorage();
    renderCurrentChat();

  } catch (error) {
    console.error('Chat error:', error);
    typingCursor.remove();
    const errorMsg = 'Oops! I had trouble reaching the AI server. Please make sure the API key is active, or check your internet connection and try again.';
    assistantBubble.innerHTML = `<p style="color: #ef4444;">${errorMsg}</p>`;
    chat.messages.push({ role: 'assistant', content: errorMsg });
    saveHistoryToStorage();
  } finally {
    isStreaming = false;
    sendBtn.disabled = false;
    chatInput.focus();
  }
}

// Scroll chat to bottom
function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Copy Code Snippet
window.copyCodeSnippet = function(button) {
  const codeBlock = button.closest('.code-block-wrapper').querySelector('code');
  if (codeBlock) {
    navigator.clipboard.writeText(codeBlock.innerText).then(() => {
      const originalText = button.textContent;
      button.textContent = 'Copied!';
      setTimeout(() => {
        button.textContent = originalText;
      }, 2000);
    });
  }
};

// Copy message text
function copyMessageText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const span = btn.querySelector('span');
    if (span) {
      const orig = span.textContent;
      span.textContent = 'Copied!';
      setTimeout(() => span.textContent = orig, 2000);
    }
  });
}

// Text-to-Speech (TTS)
function toggleReadAloud(text, btn) {
  if (!('speechSynthesis' in window)) {
    alert('Sorry, text-to-speech is not supported by your browser.');
    return;
  }

  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    btn.querySelector('span').textContent = 'Listen';
    return;
  }

  // Strip Markdown symbols for speech
  const cleanText = text
    .replace(/[#*`_~\[\]]/g, '')
    .replace(/\(.*?\)/g, '')
    .trim();

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.rate = 1.0;
  utterance.pitch = 1.05;

  const span = btn.querySelector('span');
  span.textContent = 'Stop';

  utterance.onend = () => {
    span.textContent = 'Listen';
  };
  utterance.onerror = () => {
    span.textContent = 'Listen';
  };

  window.speechSynthesis.speak(utterance);
}

// Speech Recognition (Voice Input)
function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    if (voiceInputBtn) voiceInputBtn.style.display = 'none';
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    isRecording = true;
    voiceInputBtn.classList.add('recording');
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    chatInput.value = (chatInput.value ? chatInput.value + ' ' : '') + transcript;
    autoResizeTextarea();
  };

  recognition.onend = () => {
    isRecording = false;
    voiceInputBtn.classList.remove('recording');
  };

  recognition.onerror = () => {
    isRecording = false;
    voiceInputBtn.classList.remove('recording');
  };
}

function toggleVoiceInput() {
  if (!recognition) return;
  if (isRecording) {
    recognition.stop();
  } else {
    try {
      recognition.start();
    } catch (e) {
      console.warn('Recognition start error:', e);
    }
  }
}

// Export conversation as Markdown
function exportConversation() {
  const chat = getChat(currentChatId);
  if (!chat || chat.messages.length === 0) {
    alert('No messages to export yet.');
    return;
  }

  let md = `# ${chat.title || 'Conversation with Chabita'}\n`;
  md += `*Exported on ${new Date().toLocaleString()}*\n\n---\n\n`;

  chat.messages.forEach(m => {
    const roleName = m.role === 'user' ? '👤 **You**' : '🌸 **Chabita**';
    md += `### ${roleName}\n\n${m.content}\n\n---\n\n`;
  });

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chabita-chat-${Date.now()}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Theme handling
function loadTheme() {
  const savedTheme = localStorage.getItem('chabita_theme') || 'light';
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
    themeIcon.textContent = '☀️';
  } else {
    document.body.classList.remove('dark-mode');
    themeIcon.textContent = '🌙';
  }
}

function toggleTheme() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('chabita_theme', isDark ? 'dark' : 'light');
  themeIcon.textContent = isDark ? '☀️' : '🌙';
}
