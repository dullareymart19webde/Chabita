/**
 * Chabita AI Assistant - Frontend Application
 * Multimodal Vision, Image Generation, Firebase Auth & Firestore Database
 */

// Application State
let conversations = [];
let currentChatId = null;
let isStreaming = false;
let currentMode = 'warm_simple';
let recognition = null;
let isRecording = false;

// Multimodal Image Attachment State
let currentAttachedImage = null; // base64 Data URL

// Firebase & Auth State
let firebaseApp = null;
let firebaseAuth = null;
let firestoreDb = null;
let isFirebaseEnabled = false;
let currentUser = null;
let currentUserId = null;
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
const storageSourceBadge = document.getElementById('storageSourceBadge');
const systemStatusLabel = document.getElementById('systemStatusLabel');

// Multimodal Photo DOM Elements
const attachImageBtn = document.getElementById('attachImageBtn');
const imageFileInput = document.getElementById('imageFileInput');
const generateImageBtn = document.getElementById('generateImageBtn');
const imagePreviewBadge = document.getElementById('imagePreviewBadge');
const imagePreviewImg = document.getElementById('imagePreviewImg');
const imagePreviewName = document.getElementById('imagePreviewName');
const removeImageBtn = document.getElementById('removeImageBtn');

// Lightbox DOM Elements
const lightboxModal = document.getElementById('lightboxModal');
const lightboxImage = document.getElementById('lightboxImage');
const lightboxCloseBtn = document.getElementById('lightboxCloseBtn');
const lightboxDownloadBtn = document.getElementById('lightboxDownloadBtn');

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
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authConfirmPassword = document.getElementById('authConfirmPassword');
const confirmPasswordGroup = document.getElementById('confirmPasswordGroup');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const googleSignInBtn = document.getElementById('googleSignInBtn');
const guestModeBtn = document.getElementById('guestModeBtn');

// Firebase Config Modal DOM Elements
const firebaseConfigBtn = document.getElementById('firebaseConfigBtn');
const firebaseModal = document.getElementById('firebaseModal');
const closeFirebaseModalBtn = document.getElementById('closeFirebaseModalBtn');
const firebaseStatusText = document.getElementById('firebaseStatusText');
const firebaseConfigInput = document.getElementById('firebaseConfigInput');
const saveFirebaseConfigBtn = document.getElementById('saveFirebaseConfigBtn');

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

// --- Application Entry Point ---
document.addEventListener('DOMContentLoaded', async () => {
  loadTheme();
  setupSpeechRecognition();
  setupPhotoAttachmentListeners();
  bindEventListeners();
  autoResizeTextarea();

  // Initialize Firebase (Auth & Firestore)
  await initFirebase();

  // If first time visiting (not logged in and hasn't chosen guest mode), show choice modal
  const hasChosenGuest = localStorage.getItem('chabita_guest_mode');
  if (!currentUser && !hasChosenGuest) {
    setTimeout(() => {
      openAuthModal('login');
    }, 450);
  }
});

// --- Event Listeners ---
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
      const action = card.getAttribute('data-action');
      if (action === 'attach') {
        imageFileInput.click();
        chatInput.value = prompt;
        autoResizeTextarea();
      } else if (action === 'generate') {
        chatInput.value = prompt;
        autoResizeTextarea();
        handleGenerateImageAction(prompt);
      } else if (prompt) {
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

  // Generate Image Button in Input Bar
  if (generateImageBtn) {
    generateImageBtn.addEventListener('click', () => {
      const text = chatInput.value.trim();
      const prompt = text || window.prompt('Describe the image you want Chabita to generate:', 'A dreamy sunset over mountains');
      if (prompt) {
        handleGenerateImageAction(prompt);
      }
    });
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
  googleSignInBtn.addEventListener('click', handleGoogleSignIn);
  guestModeBtn.addEventListener('click', handleGuestMode);

  // Firebase Config Modal
  firebaseConfigBtn.addEventListener('click', openFirebaseModal);
  closeFirebaseModalBtn.addEventListener('click', closeFirebaseModal);
  firebaseModal.addEventListener('click', (e) => {
    if (e.target === firebaseModal) closeFirebaseModal();
  });
  saveFirebaseConfigBtn.addEventListener('click', handleSaveFirebaseConfig);

  // Lightbox Close
  lightboxCloseBtn.addEventListener('click', closeLightbox);
  lightboxModal.addEventListener('click', (e) => {
    if (e.target === lightboxModal) closeLightbox();
  });
}

// --- Multimodal Photo Attachment & Preview ---
function setupPhotoAttachmentListeners() {
  attachImageBtn.addEventListener('click', () => imageFileInput.click());

  imageFileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) handleImageFile(file);
    imageFileInput.value = '';
  });

  removeImageBtn.addEventListener('click', clearAttachedImage);

  // Drag and Drop support on chat input
  const dropZone = document.querySelector('.input-box-wrapper');
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        handleImageFile(file);
      }
    }
  });

  // Clipboard Paste support (Ctrl+V with image)
  document.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
      if (item.type.indexOf('image') === 0) {
        const file = item.getAsFile();
        if (file) {
          handleImageFile(file);
          break;
        }
      }
    }
  });
}

function compressImage(file, maxWidth = 1024, maxHeight = 1024, quality = 0.82) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          if (width / height > maxWidth / maxHeight) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handleImageFile(file) {
  if (!file.type.startsWith('image/')) {
    alert('Please select a valid image file (PNG, JPG, WEBP, GIF).');
    return;
  }

  // Auto-compress to optimal web size (< 300KB) for instant streaming and Firestore storage
  try {
    currentAttachedImage = await compressImage(file);
    imagePreviewImg.src = currentAttachedImage;
    imagePreviewName.textContent = file.name || 'photo.jpg';
    imagePreviewBadge.style.display = 'flex';
    chatInput.focus();
  } catch (err) {
    console.warn('Compression error, fallback to raw data URL:', err);
    const reader = new FileReader();
    reader.onload = (e) => {
      currentAttachedImage = e.target.result;
      imagePreviewImg.src = currentAttachedImage;
      imagePreviewName.textContent = file.name || 'photo.jpg';
      imagePreviewBadge.style.display = 'flex';
      chatInput.focus();
    };
    reader.readAsDataURL(file);
  }
}

function clearAttachedImage() {
  currentAttachedImage = null;
  imagePreviewImg.src = '';
  imagePreviewBadge.style.display = 'none';
}

// Lightbox for full-size viewing
window.openImageLightbox = function(src) {
  lightboxImage.src = src;
  lightboxDownloadBtn.href = src;
  lightboxModal.style.display = 'flex';
};

function closeLightbox() {
  lightboxModal.style.display = 'none';
  lightboxImage.src = '';
}

// Default Firebase project configuration (chabita-ai-app)
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCMRujz_3C36tE1P4Gpb53_gQ2zLUOQorc",
  authDomain: "chabita-ai-app.firebaseapp.com",
  projectId: "chabita-ai-app",
  storageBucket: "chabita-ai-app.firebasestorage.app",
  messagingSenderId: "1054117756725",
  appId: "1:1054117756725:web:778bf73f4214d40e28567c"
};

// --- Firebase Initialization (Auth & Firestore) ---
async function initFirebase() {
  let config = null;

  // 1. Check local storage
  const savedCfg = localStorage.getItem('chabita_firebase_config');
  if (savedCfg) {
    try {
      config = JSON.parse(savedCfg);
    } catch (e) {}
  }

  // 2. Check server /api/firebase-config
  if (!config) {
    try {
      const res = await fetch('/api/firebase-config');
      const data = await res.json();
      if (data.configured && data.config) {
        config = data.config;
      }
    } catch (e) {
      console.warn('Could not fetch server Firebase config:', e);
    }
  }

  // 3. Fallback to default chabita-ai-app config
  if (!config) {
    config = DEFAULT_FIREBASE_CONFIG;
  }

  // 4. Initialize Firebase if config present
  if (config && config.apiKey && typeof firebase !== 'undefined') {
    try {
      if (!firebase.apps.length) {
        firebaseApp = firebase.initializeApp(config);
      } else {
        firebaseApp = firebase.app();
      }
      firebaseAuth = firebase.auth();
      firestoreDb = firebase.firestore();
      isFirebaseEnabled = true;

      storageSourceBadge.textContent = '🔥 Firestore';
      storageSourceBadge.classList.add('firestore');
      storageSourceBadge.title = 'Saved to Google Cloud Firestore';
      firebaseStatusText.textContent = `Connected (${config.projectId})`;

      // Auth state listener
      firebaseAuth.onAuthStateChanged(async (user) => {
        if (user) {
          currentUser = user.displayName || user.email || 'Firebase User';
          currentUserId = user.uid;
          updateAuthUI(currentUser, user.photoURL);
          await loadFirestoreConversations();
        } else {
          currentUser = null;
          currentUserId = null;
          updateAuthUI(null);
          loadHistoryFromLocalStorage();
        }
      });
      return;
    } catch (err) {
      console.error('Firebase initialization error:', err);
      firebaseStatusText.textContent = `Error: ${err.message}`;
    }
  }

  // Fallback to local storage
  isFirebaseEnabled = false;
  storageSourceBadge.textContent = 'Local';
  storageSourceBadge.classList.remove('firestore');
  storageSourceBadge.title = 'Saved locally in browser';
  firebaseStatusText.textContent = 'Not connected (using local storage)';
  loadHistoryFromLocalStorage();
}

function openFirebaseModal() {
  const saved = localStorage.getItem('chabita_firebase_config');
  if (saved) {
    firebaseConfigInput.value = saved;
  }
  firebaseModal.style.display = 'flex';
}

function closeFirebaseModal() {
  firebaseModal.style.display = 'none';
}

async function handleSaveFirebaseConfig() {
  const raw = firebaseConfigInput.value.trim();
  if (!raw) {
    localStorage.removeItem('chabita_firebase_config');
    alert('Firebase configuration cleared. Returning to local storage.');
    closeFirebaseModal();
    location.reload();
    return;
  }

  try {
    let parsed = null;
    if (raw.startsWith('{')) {
      parsed = JSON.parse(raw);
    } else {
      // Regex extract config object if user pasted the JS snippet
      const match = raw.match(/\{[\s\S]*?\}/);
      if (match) {
        parsed = JSON.parse(match[0].replace(/([a-zA-Z0-9]+):/g, '"$1":'));
      }
    }

    if (!parsed || !parsed.apiKey) {
      throw new Error('Missing apiKey or projectId in Firebase configuration.');
    }

    localStorage.setItem('chabita_firebase_config', JSON.stringify(parsed));
    alert('Firebase configuration saved successfully! Reconnecting...');
    closeFirebaseModal();
    location.reload();
  } catch (err) {
    alert('Invalid configuration format: ' + err.message);
  }
}

// --- Firestore Database Syncing ---
async function loadFirestoreConversations() {
  if (!firestoreDb || !currentUserId) return;

  try {
    const snapshot = await firestoreDb
      .collection('users')
      .doc(currentUserId)
      .collection('conversations')
      .orderBy('updatedAt', 'desc')
      .get();

    conversations = [];
    snapshot.forEach(docSnap => {
      conversations.push(docSnap.data());
    });

    const lastId = localStorage.getItem('chabita_current_id');
    currentChatId = lastId && getChat(lastId) ? lastId : (conversations.length > 0 ? conversations[0].id : null);

    if (!currentChatId || !getChat(currentChatId)) {
      createNewChat();
    } else {
      renderCurrentChat();
    }
    renderHistoryList();
  } catch (e) {
    console.error('Error loading chats from Firestore:', e);
    loadHistoryFromLocalStorage();
  }
}

async function saveChatToStorage(chat) {
  // Always update in-memory and local storage backup
  saveHistoryToLocalStorage();

  // If Firebase Firestore is active, sync to Cloud Firestore
  if (isFirebaseEnabled && firestoreDb && currentUserId && chat) {
    try {
      const chatDoc = {
        id: chat.id,
        title: chat.title || 'Untitled conversation',
        updatedAt: new Date().toISOString(),
        messages: chat.messages
      };
      await firestoreDb
        .collection('users')
        .doc(currentUserId)
        .collection('conversations')
        .doc(chat.id)
        .set(chatDoc, { merge: true });
    } catch (err) {
      console.warn('Firestore sync warning:', err);
    }
  }
}

async function deleteChatFromStorage(id) {
  conversations = conversations.filter(c => c.id !== id);
  if (currentChatId === id) {
    currentChatId = conversations.length > 0 ? conversations[0].id : null;
    if (!currentChatId) {
      createNewChat();
      return;
    }
  }

  saveHistoryToLocalStorage();
  renderCurrentChat();

  if (isFirebaseEnabled && firestoreDb && currentUserId) {
    try {
      await firestoreDb
        .collection('users')
        .doc(currentUserId)
        .collection('conversations')
        .doc(id)
        .delete();
    } catch (e) {
      console.warn('Firestore delete warning:', e);
    }
  }
}

// --- Local Storage Fallback ---
function loadHistoryFromLocalStorage() {
  try {
    const saved = localStorage.getItem('chabita_conversations');
    conversations = saved ? JSON.parse(saved) : [];
    const lastId = localStorage.getItem('chabita_current_id');
    currentChatId = lastId || (conversations.length > 0 ? conversations[0].id : null);
  } catch (e) {
    console.error('Error loading local history:', e);
    conversations = [];
    currentChatId = null;
  }
  if (!currentChatId || !getChat(currentChatId)) {
    createNewChat();
  } else {
    renderCurrentChat();
  }
  renderHistoryList();
}

function saveHistoryToLocalStorage() {
  try {
    localStorage.setItem('chabita_conversations', JSON.stringify(conversations));
    if (currentChatId) {
      localStorage.setItem('chabita_current_id', currentChatId);
    }
  } catch (e) {}
  renderHistoryList();
}

function createNewChat() {
  const newChat = {
    id: 'chat_' + Date.now(),
    title: 'New conversation',
    updatedAt: new Date().toISOString(),
    messages: []
  };
  conversations.unshift(newChat);
  currentChatId = newChat.id;
  saveChatToStorage(newChat);
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
      deleteChatFromStorage(chat.id);
    });

    item.appendChild(titleSpan);
    item.appendChild(deleteBtn);

    item.addEventListener('click', () => {
      if (isStreaming) return;
      currentChatId = chat.id;
      saveHistoryToLocalStorage();
      renderCurrentChat();
      if (window.innerWidth <= 768) {
        sidebar.classList.remove('open');
      }
    });

    chatHistoryList.appendChild(item);
  });
}

function clearAllChats() {
  if (confirm('Are you sure you want to clear all conversation history?')) {
    if (isFirebaseEnabled && firestoreDb && currentUserId) {
      conversations.forEach(c => {
        firestoreDb.collection('users').doc(currentUserId).collection('conversations').doc(c.id).delete();
      });
    }
    conversations = [];
    currentChatId = null;
    createNewChat();
  }
}

// --- Google & Email Authentication ---
async function handleGoogleSignIn() {
  if (!isFirebaseEnabled || !firebaseAuth) {
    showAuthError('Please connect your Firebase project first using the Firebase icon in the bottom left!');
    return;
  }

  try {
    authSubmitBtn.disabled = true;
    const provider = new firebase.auth.GoogleAuthProvider();
    await firebaseAuth.signInWithPopup(provider);
    closeAuthModal();
  } catch (err) {
    showAuthError(err.message || 'Google Sign-In failed.');
  } finally {
    authSubmitBtn.disabled = false;
  }
}

async function handleAuthSubmit(e) {
  if (e) e.preventDefault();
  const email = authEmail.value.trim();
  const password = authPassword.value.trim();
  const confirmPassword = authConfirmPassword.value.trim();

  authErrorBanner.style.display = 'none';

  if (!email || !password) {
    showAuthError('Please enter both email and password.');
    return;
  }

  if (authModalMode === 'register' && password !== confirmPassword) {
    showAuthError('Passwords do not match.');
    return;
  }

  if (!isFirebaseEnabled || !firebaseAuth) {
    // Local demo / fallback login
    currentUser = email.split('@')[0];
    currentUserId = 'local_' + currentUser;
    updateAuthUI(currentUser);
    closeAuthModal();
    return;
  }

  try {
    authSubmitBtn.disabled = true;
    authSubmitBtn.textContent = 'Connecting...';

    if (authModalMode === 'register') {
      await firebaseAuth.createUserWithEmailAndPassword(email, password);
    } else {
      await firebaseAuth.signInWithEmailAndPassword(email, password);
    }
    closeAuthModal();
    authForm.reset();
  } catch (err) {
    showAuthError(err.message);
  } finally {
    authSubmitBtn.disabled = false;
    authSubmitBtn.textContent = authModalMode === 'register' ? 'Create Account' : 'Sign In';
  }
}

async function handleGuestMode() {
  localStorage.setItem('chabita_guest_mode', 'true');
  if (isFirebaseEnabled && firebaseAuth) {
    try {
      await firebaseAuth.signInAnonymously();
    } catch (e) {
      console.warn('Anonymous auth note:', e);
    }
  }
  currentUser = null;
  updateAuthUI(null);
  closeAuthModal();
  chatInput.focus();
}

async function handleLogout() {
  if (confirm('Are you sure you want to sign out?')) {
    if (isFirebaseEnabled && firebaseAuth) {
      await firebaseAuth.signOut();
    }
    currentUser = null;
    currentUserId = null;
    updateAuthUI(null);
    loadHistoryFromLocalStorage();
  }
}

function updateAuthUI(username, photoURL = null) {
  if (username) {
    if (photoURL) {
      userProfileAvatar.innerHTML = `<img src="${photoURL}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    } else {
      userProfileAvatar.textContent = username.charAt(0).toUpperCase();
    }
    userProfileName.textContent = username;
    userProfileStatus.textContent = isFirebaseEnabled ? '🔥 Cloud Synced' : 'Signed In';
    authActionBtn.textContent = 'Sign Out';
    navAuthText.textContent = `Sign Out (${username})`;
  } else {
    userProfileAvatar.textContent = '🚀';
    userProfileName.textContent = 'Guest User';
    userProfileStatus.textContent = isFirebaseEnabled ? 'Anonymous Guest' : 'Local Storage';
    authActionBtn.textContent = 'Sign In';
    navAuthText.textContent = 'Sign In';
  }
}

function openAuthModal(mode = 'login') {
  authErrorBanner.style.display = 'none';
  authErrorBanner.textContent = '';
  switchAuthTab(mode);
  authModal.style.display = 'flex';
  authEmail.focus();
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
    authModalSubtitle.textContent = 'Sign in with Google or Firebase to sync your chats';
    confirmPasswordGroup.style.display = 'none';
    authConfirmPassword.removeAttribute('required');
    authSubmitBtn.textContent = 'Sign In';
  } else {
    tabSignUp.classList.add('active');
    tabSignIn.classList.remove('active');
    authModalTitle.textContent = 'Create an Account 🌸';
    authModalSubtitle.textContent = 'Join Chabita for a personalized AI experience';
    confirmPasswordGroup.style.display = 'block';
    authConfirmPassword.setAttribute('required', 'true');
    authSubmitBtn.textContent = 'Create Account';
  }
}

function showAuthError(msg) {
  authErrorBanner.textContent = msg;
  authErrorBanner.style.display = 'block';
}

// --- Chat Rendering ---
function renderCurrentChat() {
  const chat = getChat(currentChatId);
  messagesList.innerHTML = '';

  if (!chat || chat.messages.length === 0) {
    welcomeHero.style.display = 'block';
  } else {
    welcomeHero.style.display = 'none';
    chat.messages.forEach((msg, idx) => {
      appendMessageToDOM(msg.role, msg.content, msg.image, idx);
    });
  }

  scrollToBottom();
  renderHistoryList();
}

function appendMessageToDOM(role, content, image = null, index = null) {
  welcomeHero.style.display = 'none';

  const row = document.createElement('div');
  row.className = `message-row ${role}`;

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

  // Render Attached or Generated Image if present
  if (image) {
    const imgWrapper = document.createElement('div');
    imgWrapper.className = role === 'user' ? 'chat-attached-image-wrapper' : 'generated-image-card';
    imgWrapper.innerHTML = `
      <img src="${image}" class="${role === 'user' ? 'chat-attached-image' : 'generated-image'}" onclick="openImageLightbox(this.src)" alt="Photo in chat">
      ${role === 'assistant' ? `
        <div class="image-card-footer">
          <a href="${image}" target="_blank" download="chabita-generated.jpg" class="image-action-btn">⬇️ Download</a>
          <button onclick="openImageLightbox('${image}')" class="image-action-btn">🔍 Zoom</button>
        </div>` : ''}
    `;
    bubble.appendChild(imgWrapper);
  }

  // Text content
  const textDiv = document.createElement('div');
  textDiv.className = 'message-text-content';
  if (role === 'user') {
    textDiv.textContent = content || '';
  } else {
    textDiv.innerHTML = marked.parse(content || '');
  }
  bubble.appendChild(textDiv);
  contentWrapper.appendChild(bubble);

  // Actions for assistant message
  if (role === 'assistant') {
    const actions = document.createElement('div');
    actions.className = 'message-actions';

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
  return { bubble, textDiv };
}

// --- Image Generation Handler ---
async function handleGenerateImageAction(promptText) {
  const chat = getChat(currentChatId);
  if (!chat || isStreaming) return;

  chat.messages.push({ role: 'user', content: `🎨 Generate an image: "${promptText}"` });
  chatInput.value = '';
  autoResizeTextarea();
  renderCurrentChat();

  isStreaming = true;
  sendBtn.disabled = true;

  const { bubble, textDiv } = appendMessageToDOM('assistant', 'Generating your image, give me just a moment... 🎨');
  scrollToBottom();

  try {
    const res = await fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: promptText })
    });
    const data = await res.json();

    if (!res.ok || !data.image_url) {
      throw new Error(data.detail || 'Could not generate image');
    }

    // Replace assistant response with final image
    const successText = `Here is your generated image for: **"${promptText}"** 🌸`;
    textDiv.innerHTML = marked.parse(successText);

    // Add generated image card
    const card = document.createElement('div');
    card.className = 'generated-image-card';
    card.innerHTML = `
      <img src="${data.image_url}" class="generated-image" onclick="openImageLightbox(this.src)" alt="${promptText}">
      <div class="image-card-footer">
        <a href="${data.image_url}" target="_blank" download="chabita-generated.jpg" class="image-action-btn">⬇️ Download Image</a>
        <button onclick="openImageLightbox('${data.image_url}')" class="image-action-btn">🔍 View Fullscreen</button>
      </div>
    `;
    bubble.insertBefore(card, textDiv);

    chat.messages.push({
      role: 'assistant',
      content: successText,
      image: data.image_url
    });
    await saveChatToStorage(chat);
  } catch (err) {
    textDiv.innerHTML = `<p style="color: #ef4444;">Sorry, I encountered an issue generating your image: ${err.message}</p>`;
    chat.messages.push({ role: 'assistant', content: `Error generating image: ${err.message}` });
    await saveChatToStorage(chat);
  } finally {
    isStreaming = false;
    sendBtn.disabled = false;
    scrollToBottom();
  }
}

// --- Multimodal Chat Streaming ---
async function handleSendMessage() {
  const text = chatInput.value.trim();
  const photoToSend = currentAttachedImage;

  if ((!text && !photoToSend) || isStreaming) return;

  const chat = getChat(currentChatId);
  if (!chat) return;

  // Check for image generation commands
  const lower = text.toLowerCase();
  if (!photoToSend && (lower.startsWith('generate image') || lower.startsWith('draw a') || lower.startsWith('create an image of'))) {
    const prompt = text.replace(/^(generate image of|generate image|draw a|draw|create an image of)/i, '').trim();
    if (prompt) {
      handleGenerateImageAction(prompt);
      return;
    }
  }

  // Add User Message (Text + Photo)
  chat.messages.push({
    role: 'user',
    content: text || (photoToSend ? 'Please analyze this image.' : ''),
    image: photoToSend || null
  });

  if (chat.messages.length === 1) {
    chat.title = text ? (text.slice(0, 30) + (text.length > 30 ? '...' : '')) : 'Photo Analysis';
  }

  // Clear Input & Attached Photo
  chatInput.value = '';
  clearAttachedImage();
  autoResizeTextarea();
  await saveChatToStorage(chat);
  renderCurrentChat();

  // Assistant Streaming Bubble
  isStreaming = true;
  sendBtn.disabled = true;

  const { bubble, textDiv } = appendMessageToDOM('assistant', '');
  const typingCursor = document.createElement('span');
  typingCursor.className = 'typing-cursor';
  textDiv.appendChild(typingCursor);
  scrollToBottom();

  let accumulatedText = '';

  try {
    const payload = {
      messages: chat.messages.map(m => ({
        role: m.role,
        content: m.content,
        image: m.image
      })),
      mode: currentMode,
      temperature: 0.7
    };

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
        buffer = lines.pop();

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
            textDiv.innerHTML = marked.parse(accumulatedText);
            textDiv.appendChild(typingCursor);
            scrollToBottom();
          } catch (jsonErr) {}
        }
      }
    }

    // Finalize
    typingCursor.remove();
    textDiv.innerHTML = marked.parse(accumulatedText || 'I am ready for your next request!');
    chat.messages.push({ role: 'assistant', content: accumulatedText });
    await saveChatToStorage(chat);
    renderCurrentChat();

  } catch (error) {
    console.error('Chat error:', error);
    typingCursor.remove();
    const errorMsg = 'Oops! I had trouble reaching the AI server. Please make sure the API key is active and try again.';
    textDiv.innerHTML = `<p style="color: #ef4444;">${errorMsg}</p>`;
    chat.messages.push({ role: 'assistant', content: errorMsg });
    await saveChatToStorage(chat);
  } finally {
    isStreaming = false;
    sendBtn.disabled = false;
    chatInput.focus();
  }
}

// --- Utilities ---
function autoResizeTextarea() {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + 'px';
}

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

window.copyCodeSnippet = function(button) {
  const codeBlock = button.closest('.code-block-wrapper').querySelector('code');
  if (codeBlock) {
    navigator.clipboard.writeText(codeBlock.innerText).then(() => {
      const originalText = button.textContent;
      button.textContent = 'Copied!';
      setTimeout(() => button.textContent = originalText, 2000);
    });
  }
};

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

  const cleanText = (text || '').replace(/[#*`_~\[\]]/g, '').replace(/\(.*?\)/g, '').trim();
  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.rate = 1.0;
  utterance.pitch = 1.05;

  const span = btn.querySelector('span');
  span.textContent = 'Stop';
  utterance.onend = () => span.textContent = 'Listen';
  utterance.onerror = () => span.textContent = 'Listen';

  window.speechSynthesis.speak(utterance);
}

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
    } catch (e) {}
  }
}

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
    md += `### ${roleName}\n\n`;
    if (m.image) md += `![Attached Image](${m.image})\n\n`;
    if (m.content) md += `${m.content}\n\n`;
    md += `---\n\n`;
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
