// Blueprint.io Main Application Logic

// --- Constants ---
// No default API key, users must connect their own key in Configuration settings

// --- Elements ---
const chatForm = document.getElementById('chat-form');
const promptInput = document.getElementById('prompt-input');
const c4LevelSelect = document.getElementById('c4-level-select');
const chatHistory = document.getElementById('chat-history');
const loadingIndicator = document.getElementById('loading-indicator');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const drawioIframe = document.getElementById('drawio-iframe');
const diagramEmptyState = document.getElementById('diagram-empty-state');
const xmlOutput = document.getElementById('xml-output');
const copyXmlBtn = document.getElementById('copy-xml-btn');
const diagramToolbar = document.getElementById('diagram-toolbar');
const downloadBtn = document.getElementById('download-btn');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const fullscreenIcon = document.getElementById('fullscreen-icon');
const outputPanel = document.querySelector('.output-panel');

// Follow-up Elements
const savedProjectOverlay = document.getElementById('saved-project-overlay');
const followupPrompt = document.getElementById('followup-prompt');
const btnFollowupYes = document.getElementById('btn-followup-yes');
const btnFollowupNo = document.getElementById('btn-followup-no');

// New Elements for enhancements
const importBtn = document.getElementById('import-btn');
const repoImportInput = document.getElementById('repo-import-input');
const collabBtn = document.getElementById('collab-btn');
const collabPanel = document.getElementById('collab-panel');
const closeCollabBtn = document.getElementById('close-collab-btn');
const startCollabBtn = document.getElementById('start-collab-btn');
const collabStatusDot = document.getElementById('collab-status-dot');
const collabStatusText = document.getElementById('collab-status-text');
const collabSetupSection = document.getElementById('collab-setup-section');
const collabInfoSection = document.getElementById('collab-info-section');
const collabLinkInput = document.getElementById('collab-link-input');
const copyCollabLinkBtn = document.getElementById('copy-collab-link-btn');
const peersList = document.getElementById('peers-list');
const disconnectCollabBtn = document.getElementById('disconnect-collab-btn');

const gitSyncBtn = document.getElementById('git-sync-btn');
const gitSyncModal = document.getElementById('git-sync-modal');
const closeGitSyncBtn = document.getElementById('close-git-sync-btn');
const gitSyncActionBtn = document.getElementById('git-sync-action-btn');
const gitPatInput = document.getElementById('git-pat-input');
const gitRepoInput = document.getElementById('git-repo-input');
const gitBranchInput = document.getElementById('git-branch-input');
const gitXmlPathInput = document.getElementById('git-xml-path-input');
const gitPngSync = document.getElementById('git-png-sync');
const gitSyncStatus = document.getElementById('git-sync-status');
const copyCicdBtn = document.getElementById('copy-cicd-btn');

// Config Modal
const configBtn = document.getElementById('config-btn');
const configModal = document.getElementById('config-modal');
const closeConfigBtn = document.getElementById('close-config-btn');
const saveConfigBtn = document.getElementById('save-config-btn');
const disconnectConfigBtn = document.getElementById('disconnect-config-btn');
const apiKeyInput = document.getElementById('api-key-input');
const configStatusText = document.getElementById('config-status-text');

// --- State ---
let personalApiKey = localStorage.getItem('gemini_api_key') || '';
let isIframeReady = false;
let currentXml = '';
let lastProjectDescription = '';
let isUsingSavedPd = false;

// Collaboration State
let socket = null;
let collabRoomId = '';
let isIncomingUpdate = false;

// GitHub Sync Pending Promise
let gitSyncPendingResolve = null;
let lastPngDataUri = '';

// Initialize UI based on saved key
function updateConfigUI() {
  if (personalApiKey) {
    apiKeyInput.value = personalApiKey;
    configStatusText.innerHTML = `Currently using your <b>Personal API Key</b>.`;
    disconnectConfigBtn.classList.remove('hidden');
  } else {
    apiKeyInput.value = '';
    configStatusText.innerHTML = `No API key connected. Please add your personal Gemini API key to generate C4 diagrams. <a href="https://aistudio.google.com/" target="_blank" style="color: var(--accent-secondary); text-decoration: underline;">Get free key from Google AI Studio</a>.`;
    disconnectConfigBtn.classList.add('hidden');
  }
}
updateConfigUI();

// --- Draw.io Integration ---
window.addEventListener('message', (e) => {
  if (e.source === drawioIframe.contentWindow) {
    try {
      const msg = JSON.parse(e.data);
      if (msg.event === 'init') {
        isIframeReady = true;
        console.log('Draw.io iframe initialized');
        if (currentXml) {
          loadXmlToDrawIo(currentXml);
        }
      } else if (msg.event === 'export') {
        lastPngDataUri = msg.data;
        if (gitSyncPendingResolve) {
          gitSyncPendingResolve(msg.data);
          gitSyncPendingResolve = null;
        } else {
          const a = document.createElement('a');
          a.href = msg.data;
          a.download = 'blueprint-diagram.png';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      } else if (msg.event === 'autosave') {
        lastPngDataUri = '';
        currentXml = msg.xml;
        xmlOutput.textContent = currentXml;
        
        if (socket && socket.connected && !isIncomingUpdate) {
          socket.emit('diagram-update', {
            roomId: collabRoomId,
            xml: currentXml,
            level: 'canvas edit',
            prompt: promptInput.value || lastProjectDescription
          });
        }
      }
    } catch (err) {
      // Ignore parsing errors for unknown messages
    }
  }
});

function loadXmlToDrawIo(xml) {
  if (!isIframeReady) return;
  isIncomingUpdate = true;
  drawioIframe.contentWindow.postMessage(JSON.stringify({
    action: 'load',
    xml: xml,
    autosave: 1
  }), '*');
  setTimeout(() => {
    isIncomingUpdate = false;
  }, 800);
}

// --- UI Interactions ---

// Tabs
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    // Remove active class from all
    tabBtns.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    
    // Add active class to clicked
    btn.classList.add('active');
    const target = document.getElementById(btn.dataset.target);
    target.classList.add('active');
  });
});

// Modal
configBtn.addEventListener('click', () => {
  const errorMsg = document.getElementById('api-key-error');
  if (errorMsg) errorMsg.classList.add('hidden');
  configModal.classList.remove('hidden');
});
closeConfigBtn.addEventListener('click', () => configModal.classList.add('hidden'));

saveConfigBtn.addEventListener('click', async () => {
  const newKey = apiKeyInput.value.trim();
  const errorMsg = document.getElementById('api-key-error');
  if (errorMsg) errorMsg.classList.add('hidden');
  
  if (newKey) {
    const originalText = saveConfigBtn.textContent;
    saveConfigBtn.textContent = 'Validating...';
    saveConfigBtn.disabled = true;
    
    try {
      // Validate key with a tiny request
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${newKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "hi" }] }]
        })
      });
      
      const data = await response.json();
      if (data.error && data.error.code === 400 && data.error.message.includes('API key not valid')) {
        throw new Error('Invalid API Key');
      }
      
      // Success
      personalApiKey = newKey;
      localStorage.setItem('gemini_api_key', personalApiKey);
      updateConfigUI();
      configModal.classList.add('hidden');
    } catch (err) {
      if (errorMsg) errorMsg.classList.remove('hidden');
    } finally {
      saveConfigBtn.textContent = originalText;
      saveConfigBtn.disabled = false;
    }
  } else {
    // Empty key, just close
    updateConfigUI();
    configModal.classList.add('hidden');
  }
});

disconnectConfigBtn.addEventListener('click', () => {
  personalApiKey = '';
  localStorage.removeItem('gemini_api_key');
  updateConfigUI();
});

// Copy XML
copyXmlBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(currentXml).then(() => {
    const originalHtml = copyXmlBtn.innerHTML;
    copyXmlBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    setTimeout(() => { copyXmlBtn.innerHTML = originalHtml; }, 2000);
  });
});

// Download Diagram
downloadBtn.addEventListener('click', () => {
  if (!isIframeReady || !currentXml) return;
  drawioIframe.contentWindow.postMessage(JSON.stringify({
    action: 'export',
    format: 'png',
    bg: '#ffffff',
    spin: 'Exporting...',
    xml: currentXml
  }), '*');
});

// Fullscreen
fullscreenBtn.addEventListener('click', () => {
  outputPanel.classList.toggle('fullscreen');
  if (outputPanel.classList.contains('fullscreen')) {
    fullscreenIcon.innerHTML = `<line x1="8" y1="3" x2="8" y2="8"></line><line x1="3" y1="8" x2="8" y2="8"></line><line x1="16" y1="21" x2="16" y2="16"></line><line x1="21" y1="16" x2="16" y2="16"></line><line x1="3" y1="16" x2="8" y2="16"></line><line x1="8" y1="21" x2="8" y2="16"></line><line x1="16" y1="3" x2="16" y2="8"></line><line x1="21" y1="8" x2="16" y2="8"></line>`;
  } else {
    fullscreenIcon.innerHTML = `<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>`;
  }
});

// --- Chat & Generation Logic ---

function addMessage(text, isUser = false, broadcast = true) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${isUser ? 'user-message' : 'system-message'}`;
  
  const avatar = document.createElement('div');
  avatar.className = `avatar ${isUser ? 'user-avatar' : 'system-avatar'}`;
  avatar.textContent = isUser ? 'U' : '✨';
  
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.textContent = text;
  
  msgDiv.appendChild(avatar);
  msgDiv.appendChild(bubble);
  chatHistory.appendChild(msgDiv);
  
  chatHistory.scrollTop = chatHistory.scrollHeight;
  
  // Broadcast message to peer collaborator
  if (broadcast && isUser && socket && socket.connected) {
    socket.emit('chat-message', { roomId: collabRoomId, text: text, sender: 'Peer' });
  }
}

btnFollowupNo.addEventListener('click', () => {
  followupPrompt.classList.add('hidden');
  chatForm.classList.remove('hidden');
  promptInput.classList.remove('hidden');
  promptInput.required = true;
  savedProjectOverlay.classList.add('hidden');
  lastProjectDescription = '';
  isUsingSavedPd = false;
  promptInput.value = '';
  promptInput.focus();
});

btnFollowupYes.addEventListener('click', () => {
  followupPrompt.classList.add('hidden');
  chatForm.classList.remove('hidden');
  promptInput.classList.add('hidden');
  promptInput.required = false;
  savedProjectOverlay.classList.remove('hidden');
  isUsingSavedPd = true;
});

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  if (!personalApiKey) {
    addMessage("⚠️ API Key required. Please connect your Gemini API Key in the settings (gear icon in the top right) to generate diagrams.", false);
    configModal.classList.remove('hidden');
    apiKeyInput.focus();
    return;
  }
  
  let promptToUse = promptInput.value.trim();
  if (isUsingSavedPd) {
    promptToUse = lastProjectDescription;
  }
  
  const level = c4LevelSelect.value;
  
  if (!promptToUse && level !== 'none') return;
  
  if (!isUsingSavedPd && level !== 'none') {
    promptInput.value = '';
    addMessage(promptToUse, true);
  } else if (isUsingSavedPd && level !== 'none') {
    addMessage(`Generate ${level} diagram for the saved project.`, true);
  }
  
  loadingIndicator.classList.add('active');
  document.getElementById('submit-btn').disabled = true;
  
  if (level === 'none') {
    try {
      const analysisResult = await analyzeUserInput(promptToUse);
      if (analysisResult === 'PROJECT_DESCRIPTION') {
        addMessage("I see you're describing a project architecture! Please select a C4 Diagram Level from the dropdown above to generate your diagram.", false);
      } else {
        addMessage(`${analysisResult}\n\nNote: We have limited responses per minute, so kindly provide a project description and select the respective diagram level.`, false);
      }
    } catch (error) {
      const errMsg = error.message ? error.message.toLowerCase() : '';
      if (errMsg.includes('high demand') || errMsg.includes('overloaded') || errMsg.includes('503')) {
        addMessage('Server busy. Try again some time or try using your personal Gemini API key.', false);
      } else {
        addMessage(`Error: ${error.message}`, false);
      }
    } finally {
      loadingIndicator.classList.remove('active');
      document.getElementById('submit-btn').disabled = false;
    }
    return;
  }

  try {
    currentXml = await generateC4DiagramXml(promptToUse, level);
    
    // Update UI
    xmlOutput.textContent = currentXml;
    diagramEmptyState.style.display = 'none';
    drawioIframe.classList.remove('hidden');
    diagramToolbar.classList.remove('hidden');
    
    loadXmlToDrawIo(currentXml);
    addMessage('I have generated your C4 architecture diagram! You can view it in the visualizer or check the raw XML code.', false);
    
    // Broadcast diagram XML to peer
    if (socket && socket.connected) {
      socket.emit('diagram-update', { roomId: collabRoomId, xml: currentXml, level: level, prompt: promptToUse });
    }
    
    lastProjectDescription = promptToUse;
    chatForm.classList.add('hidden');
    followupPrompt.classList.remove('hidden');
    c4LevelSelect.value = 'none';
    
  } catch (error) {
    const errMsg = error.message ? error.message.toLowerCase() : '';
    if (errMsg.includes('high demand') || errMsg.includes('overloaded') || errMsg.includes('503')) {
      addMessage('Server busy. Try again some time or try using your personal Gemini API key.', false);
    } else {
      addMessage(`Error: ${error.message}`, false);
    }
  } finally {
    loadingIndicator.classList.remove('active');
    document.getElementById('submit-btn').disabled = false;
  }
});

// --- Generation API ---
// Uses personal API key configured in settings
async function generateC4DiagramXml(prompt, level) {
  const activeKey = personalApiKey;
  
  let levelSpecificInstructions = '';
  switch(level) {
    case 'context':
      levelSpecificInstructions = `You are generating a Level 1: System Context Diagram.
FOCUS: Show the system in the center, surrounded by its users and external systems it interacts with. Do NOT show internal technical details like databases or microservices.
STYLE RULES:
- Target System: Use a single blue box (#1168bd).
- Users: Use person/actor shapes.
- External Systems: Use grey boxes (#999999).`;
      break;
    case 'container':
      levelSpecificInstructions = `You are generating a Level 2: Container Diagram.
FOCUS: Show the high-level technical building blocks (containers) like web applications, databases, and microservices within the system, and how they communicate.
STYLE RULES:
- Internal Containers: Use blue boxes (#1168bd).
- Users: Use person/actor shapes.
- External Systems: Use grey boxes (#999999).`;
      break;
    case 'component':
      levelSpecificInstructions = `You are generating a Level 3: Component Diagram.
FOCUS: Zoom into ONE specific container to show its internal components (e.g., controllers, services, repositories).
STYLE RULES:
- Components: Use lighter blue boxes (#85bbf0).
- Container Boundary: Draw a large transparent bounding box with a dashed border around the components.
- Keep external elements minimal if necessary, but focus heavily on the internal components.`;
      break;
    case 'code':
      levelSpecificInstructions = `You are generating a Level 4: Code Diagram.
FOCUS: Show the code-level implementation details (classes, interfaces, objects) of a specific component.
STYLE RULES:
- Use UML Class Diagram notation.
- Represent classes with standard UML class shapes (showing attributes and methods).`;
      break;
    case 'kubernetes':
      levelSpecificInstructions = `You are generating a Kubernetes Cluster Visualization Diagram.
FOCUS: Represent the Kubernetes cluster resources including Ingress, Services, Deployments, ReplicaSets, Pods, and Persistent Volumes. Show namespace or cluster boundaries.
STYLE RULES:
- Cluster/Namespace Boundaries: Use a large bounding box with a dashed border.
- Ingress: Use a coral box (#ff6b6b).
- Services: Use a teal box (#009688) with rounded corners.
- Pods/Deployments: Use blue boxes (#1168bd) nested inside their namespaces.
- Persistent Volumes: Use grey database/cylinder shape (#999999).`;
      break;
    default:
      levelSpecificInstructions = `You are generating a C4 diagram.`;
  }

  const systemInstruction = `You are an expert system architect. Your task is to generate valid Draw.io XML (mxGraphModel) for a C4 diagram based on the user's description.
CRITICAL LAYOUT AND STYLING RULES:
1. SPACING: You MUST space nodes far apart. Place nodes at least 350 pixels apart horizontally and 250 pixels vertically to prevent overlapping. Example: Node 1 (x="100" y="100"), Node 2 (x="500" y="100"), Node 3 (x="500" y="400").
2. LARGE BOXES: Make all container boxes large enough to fit multiline text. Use width="220" and height="140" for standard boxes.
3. EDGE LABELS: For relationships, make the text label a child of the edge. Use <mxGeometry x="-0.2" y="15" relative="1" as="geometry"/> so the text sits neatly below the line and does not overlap the line itself.
4. TEXT WRAPPING: Ensure all shapes include "whiteSpace=wrap;html=1;" in their style.

${levelSpecificInstructions}

Return ONLY the raw <mxGraphModel>...</mxGraphModel> XML, without markdown formatting or code blocks.`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${activeKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${systemInstruction}\n\nUser Description: ${prompt}` }] }]
      })
    });
    
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    
    let text = data.candidates[0].content.parts[0].text;
    // Clean up if the model wrapped it in markdown
    text = text.replace(/```xml/gi, '').replace(/```/g, '').trim();
    return text;
  } catch (err) {
    console.error("API Call Failed", err);
    throw new Error(err.message || "Failed to generate diagram using API.");
  }
}

async function analyzeUserInput(prompt) {
  const activeKey = personalApiKey;
  
  const analysisInstruction = `You are a helpful AI assistant for Blueprint.io, an architecture diagram generator.
The user has submitted a message without selecting a diagram level.
Analyze the user's message:
If it describes a software architecture, system components, or a project layout, respond EXACTLY with:
"PROJECT_DESCRIPTION"

If it is a general conversation, greeting, or question NOT describing an architecture, respond to the user briefly and warmly.`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${activeKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `${analysisInstruction}\n\nUser Message: ${prompt}` }] }]
    })
  });
  
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  
  return data.candidates[0].content.parts[0].text.trim();
}

// --- UI Interaction Event Listeners for New Features ---

// Collab Panel Toggle
collabBtn.addEventListener('click', () => {
  collabPanel.classList.toggle('hidden');
  collabBtn.classList.toggle('active');
});

closeCollabBtn.addEventListener('click', () => {
  collabPanel.classList.add('hidden');
  collabBtn.classList.remove('active');
});

// Import Repo Trigger
importBtn.addEventListener('click', () => {
  repoImportInput.click();
});

repoImportInput.addEventListener('change', (e) => {
  handleRepoImport(e.target.files);
});

// GitHub Sync Modal Trigger
gitSyncBtn.addEventListener('click', () => {
  gitPatInput.value = localStorage.getItem('git_pat') || '';
  gitRepoInput.value = localStorage.getItem('git_repo') || '';
  gitBranchInput.value = localStorage.getItem('git_branch') || 'main';
  gitXmlPathInput.value = localStorage.getItem('git_xml_path') || 'docs/architecture.drawio';
  
  gitSyncStatus.classList.add('hidden');
  gitSyncModal.classList.remove('hidden');
});

closeGitSyncBtn.addEventListener('click', () => {
  gitSyncModal.classList.add('hidden');
});


// --- Repository Auto-Import Logic ---

async function handleRepoImport(files) {
  if (!files || files.length === 0) return;
  
  let totalFiles = files.length;
  let fileNames = [];
  let fileExtensions = {};
  let keyFiles = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const path = file.webkitRelativePath || file.name;
    const parts = path.split('/');
    const name = parts[parts.length - 1];
    
    fileNames.push(name);
    
    const ext = name.split('.').pop().toLowerCase();
    if (ext && ext !== name) {
      fileExtensions[ext] = (fileExtensions[ext] || 0) + 1;
    }
    
    // Check for key indicator files
    if (name === 'package.json') keyFiles.push('Node.js (package.json)');
    else if (name === 'requirements.txt') keyFiles.push('Python (requirements.txt)');
    else if (name === 'pom.xml') keyFiles.push('Java Maven (pom.xml)');
    else if (name === 'build.gradle') keyFiles.push('Java Gradle (build.gradle)');
    else if (name === 'go.mod') keyFiles.push('Go Module (go.mod)');
    else if (name === 'Dockerfile') keyFiles.push('Docker Containerization (Dockerfile)');
    else if (name === 'docker-compose.yml') keyFiles.push('Multi-container Orchestration (docker-compose.yml)');
    else if (name === 'next.config.js' || name === 'next.config.mjs') keyFiles.push('Next.js Framework');
    else if (name === 'vite.config.js' || name === 'vite.config.ts') keyFiles.push('Vite Frontend Tooling');
    else if (name === 'tsconfig.json') keyFiles.push('TypeScript configuration');
  }

  // Detect tech stack based on file extensions and key files
  let techStack = [];
  let backend = '';
  let frontend = '';
  let db = '';
  
  if (fileExtensions['js'] || fileExtensions['jsx'] || fileExtensions['ts'] || fileExtensions['tsx']) {
    techStack.push('JavaScript/TypeScript');
  }
  if (fileExtensions['py']) techStack.push('Python');
  if (fileExtensions['java']) techStack.push('Java');
  if (fileExtensions['go']) techStack.push('Go');
  
  // Specific checks
  const keyFilesStr = fileNames.join(' ');
  
  // Frontends
  if (keyFiles.some(f => f.includes('Next.js'))) {
    frontend = 'Next.js Frontend';
  } else if (keyFilesStr.includes('React') || fileExtensions['jsx'] || fileExtensions['tsx']) {
    frontend = 'React Frontend';
  } else if (keyFilesStr.includes('Vue') || fileExtensions['vue']) {
    frontend = 'Vue.js Frontend';
  } else if (fileExtensions['html']) {
    frontend = 'Static HTML/CSS Frontend';
  }
  
  // Backends
  if (keyFiles.some(f => f.includes('requirements.txt')) || fileNames.some(n => n.includes('main.py') || n.includes('app.py'))) {
    backend = 'Python Web Service (FastAPI/Flask)';
  } else if (keyFiles.some(f => f.includes('pom.xml') || f.includes('build.gradle'))) {
    backend = 'Spring Boot Backend';
  } else if (keyFiles.some(f => f.includes('go.mod'))) {
    backend = 'Go API backend';
  } else if (keyFiles.some(f => f.includes('package.json'))) {
    backend = 'Node.js/Express Backend';
  }

  // Database detection from keywords in file names
  const allNamesLower = keyFilesStr.toLowerCase();
  if (allNamesLower.includes('mongo') || allNamesLower.includes('mongoose')) db = 'MongoDB database';
  else if (allNamesLower.includes('postgres') || allNamesLower.includes('pg')) db = 'PostgreSQL database';
  else if (allNamesLower.includes('mysql')) db = 'MySQL database';
  else if (allNamesLower.includes('sqlite')) db = 'SQLite database';
  else if (allNamesLower.includes('redis')) db = 'Redis cache';
  
  // Generate description prompt
  let detectedSummary = `A software project composed of ${totalFiles} files. `;
  
  let partsList = [];
  if (frontend) partsList.push(`a client-side ${frontend}`);
  if (backend) partsList.push(`a server-side ${backend}`);
  if (db) partsList.push(`connected to a ${db}`);
  if (keyFiles.some(f => f.includes('Dockerfile') || f.includes('docker-compose'))) {
    partsList.push(`containerized with Docker`);
  }
  
  if (partsList.length > 0) {
    detectedSummary += "It consists of " + partsList.join(', ') + ". ";
  } else {
    detectedSummary += `It uses a tech stack including ${techStack.slice(0, 3).join(', ')}. `;
  }
  
  detectedSummary += "Users interact with the frontend, which sends REST API requests to the backend, and the backend queries the database for storage.";
  
  // Update textarea
  promptInput.value = detectedSummary;
  promptInput.focus();
  
  // Add chat bubble
  addMessage(`Scanned ${totalFiles} repository files. Tech stack detected: ${techStack.join(', ') || 'Unknown'}. Automatically generated a system architecture description for you! Feel free to modify it and select a Diagram Level to generate.`, false);
}


// --- Real-time Collaboration (Socket.io) ---

function showCollabStatus(status, type = 'disconnected') {
  collabStatusDot.className = `status-dot ${type}`;
  collabStatusText.textContent = status;
}

// User creates a room
startCollabBtn.addEventListener('click', () => {
  startCollabBtn.disabled = true;
  startCollabBtn.textContent = 'Initializing...';
  showCollabStatus('Creating room...', 'pulsing');
  
  // Generate random room ID (8 characters)
  const generatedId = Math.random().toString(36).substring(2, 10).toUpperCase();
  joinCollabRoom(generatedId);
});

// Copy invite link
copyCollabLinkBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(collabLinkInput.value).then(() => {
    const origHtml = copyCollabLinkBtn.innerHTML;
    copyCollabLinkBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    setTimeout(() => { copyCollabLinkBtn.innerHTML = origHtml; }, 2000);
  });
});

// Join collaboration room
function joinCollabRoom(roomId) {
  collabRoomId = roomId;
  collabBtn.classList.add('active');
  collabPanel.classList.remove('hidden');
  collabSetupSection.classList.add('hidden');
  collabInfoSection.classList.remove('hidden');
  
  const inviteLink = `${window.location.origin}/?room=${roomId}`;
  collabLinkInput.value = inviteLink;
  
  showCollabStatus('Connecting to room...', 'pulsing');
  
  try {
    // Initialize Socket.io client
    socket = io();
    
    socket.on('connect', () => {
      showCollabStatus('Connected', 'connected');
      socket.emit('join-room', roomId);
      
      // Update share link and query params without reloading
      const path = `${window.location.pathname}?room=${roomId}`;
      window.history.pushState({ room: roomId }, document.title, path);
      
      startCollabBtn.textContent = 'Create Collab Room';
      startCollabBtn.disabled = false;
    });
    
    socket.on('room-state', (state) => {
      // Sync initial state from server
      if (state.xml) {
        currentXml = state.xml;
        xmlOutput.textContent = currentXml;
        diagramEmptyState.style.display = 'none';
        drawioIframe.classList.remove('hidden');
        diagramToolbar.classList.remove('hidden');
        loadXmlToDrawIo(currentXml);
      }
      if (state.prompt) {
        promptInput.value = state.prompt;
      }
      if (state.history && state.history.length > 0) {
        syncChatHistory(state.history);
      }
    });
    
    socket.on('user-joined', ({ userId, count }) => {
      addMessage(`A teammate joined the room! (${count} users active)`, false);
      updateUserList(count);
    });
    
    socket.on('user-left', ({ userId, count }) => {
      addMessage(`A teammate left the room. (${count} users active)`, false);
      updateUserList(count);
    });
    
    socket.on('diagram-update', ({ xml, level, prompt }) => {
      if (xml) {
        currentXml = xml;
        xmlOutput.textContent = currentXml;
        diagramEmptyState.style.display = 'none';
        drawioIframe.classList.remove('hidden');
        diagramToolbar.classList.remove('hidden');
        loadXmlToDrawIo(currentXml);
      }
      if (prompt) {
        promptInput.value = prompt;
      }
      addMessage(`Teammate generated/updated the diagram: ${level}`, false);
    });
    
    socket.on('chat-message', ({ text, sender }) => {
      addMessage(text, true, false);
    });
    
    socket.on('disconnect', () => {
      showCollabStatus('Disconnected', 'disconnected');
    });
    
    socket.on('connect_error', (err) => {
      console.error('Connection error:', err);
      showCollabStatus('Connection Failed', 'disconnected');
      startCollabBtn.disabled = false;
      startCollabBtn.textContent = 'Create Collab Room';
    });
    
  } catch (error) {
    console.error(error);
    showCollabStatus('Failed to connect to server.', 'disconnected');
    startCollabBtn.disabled = false;
    startCollabBtn.textContent = 'Create Collab Room';
  }
}

function updateUserList(count) {
  peersList.innerHTML = '';
  const youLi = document.createElement('li');
  youLi.style.display = 'flex';
  youLi.style.alignItems = 'center';
  youLi.style.gap = '8px';
  youLi.innerHTML = `<span class="user-bullet host" style="width: 8px; height: 8px; border-radius: 50%; background: var(--accent-primary); display: inline-block;"></span>You`;
  peersList.appendChild(youLi);
  
  for (let i = 1; i < count; i++) {
    const peerLi = document.createElement('li');
    peerLi.style.display = 'flex';
    peerLi.style.alignItems = 'center';
    peerLi.style.gap = '8px';
    peerLi.innerHTML = `<span class="user-bullet client" style="width: 8px; height: 8px; border-radius: 50%; background: var(--success); display: inline-block;"></span>Collaborator ${i}`;
    peersList.appendChild(peerLi);
  }
}

function handleCollabDisconnect() {
  showCollabStatus('Disconnected', 'disconnected');
  collabSetupSection.classList.remove('hidden');
  collabInfoSection.classList.add('hidden');
  peersList.innerHTML = `<li style="display: flex; align-items: center; gap: 8px;"><span class="user-bullet host" style="width: 8px; height: 8px; border-radius: 50%; background: var(--accent-primary); display: inline-block;"></span>You</li>`;
  
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  
  // Clean URL query param
  if (window.location.search.includes('room=')) {
    window.history.pushState({}, document.title, window.location.pathname);
  }
  
  addMessage('Collaboration session disconnected.', false);
}

disconnectCollabBtn.addEventListener('click', () => {
  handleCollabDisconnect();
});

// Helper: Sync chat history from server
function syncChatHistory(history) {
  const welcome = chatHistory.querySelector('.system-message');
  chatHistory.innerHTML = '';
  if (welcome) chatHistory.appendChild(welcome);
  
  history.forEach(item => {
    addMessage(item.text, item.sender === 'Peer', false);
  });
}


// --- GitHub Sync & CI/CD Push Logic ---

copyCicdBtn.addEventListener('click', () => {
  const yamlText = document.getElementById('cicd-yaml-content').textContent;
  navigator.clipboard.writeText(yamlText).then(() => {
    const origHtml = copyCicdBtn.innerHTML;
    copyCicdBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    setTimeout(() => { copyCicdBtn.innerHTML = origHtml; }, 2000);
  });
});

gitSyncActionBtn.addEventListener('click', async () => {
  const pat = gitPatInput.value.trim();
  const repo = gitRepoInput.value.trim();
  const branch = gitBranchInput.value.trim();
  const xmlPath = gitXmlPathInput.value.trim();
  const pngSync = gitPngSync.value;
  
  if (!pat || !repo || !xmlPath) {
    showGitStatus('Please fill in all required fields.', 'error');
    return;
  }
  
  if (!currentXml) {
    showGitStatus('No diagram XML generated yet. Please generate a diagram first.', 'error');
    return;
  }
  
  // Save details to localStorage
  localStorage.setItem('git_pat', pat);
  localStorage.setItem('git_repo', repo);
  localStorage.setItem('git_branch', branch);
  localStorage.setItem('git_xml_path', xmlPath);
  
  gitSyncActionBtn.disabled = true;
  gitSyncActionBtn.textContent = 'Pushing...';
  showGitStatus('Preparing payload...', 'info');
  
  try {
    // 1. Commit the Draw.io XML file
    showGitStatus('Committing XML diagram...', 'info');
    await pushFileToGithub(pat, repo, branch, xmlPath, currentXml, 'docs: update blueprint-io architecture XML diagram');
    
    // 2. Commit the PNG image file (optional)
    if (pngSync === 'yes') {
      showGitStatus('Generating and exporting PNG...', 'info');
      // Trigger Draw.io PNG export and await resolution
      const pngBase64Data = await exportPngFromDrawIo();
      
      const pngPath = xmlPath.substring(0, xmlPath.lastIndexOf('.')) + '.png';
      showGitStatus('Committing PNG image...', 'info');
      
      const rawBase64 = pngBase64Data.replace(/^data:image\/png;base64,/, '');
      await pushFileToGithub(pat, repo, branch, pngPath, rawBase64, 'docs: update blueprint-io architecture PNG render', true);
    }
    
    showGitStatus('Successfully pushed architecture files to GitHub! 🚀', 'success');
  } catch (error) {
    console.error(error);
    showGitStatus(`GitHub Sync Failed: ${error.message}`, 'error');
  } finally {
    gitSyncActionBtn.disabled = false;
    gitSyncActionBtn.textContent = 'Push to GitHub';
  }
});

function showGitStatus(message, type) {
  gitSyncStatus.classList.remove('hidden');
  gitSyncStatus.textContent = message;
  
  if (type === 'error') {
    gitSyncStatus.style.background = 'rgba(239, 68, 68, 0.15)';
    gitSyncStatus.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    gitSyncStatus.style.color = '#ff8888';
  } else if (type === 'success') {
    gitSyncStatus.style.background = 'rgba(16, 185, 129, 0.15)';
    gitSyncStatus.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    gitSyncStatus.style.color = '#88ff88';
  } else {
    gitSyncStatus.style.background = 'rgba(59, 130, 246, 0.15)';
    gitSyncStatus.style.borderColor = 'rgba(59, 130, 246, 0.4)';
    gitSyncStatus.style.color = '#88ccff';
  }
}

// Function to push a file to Github using REST API v3
async function pushFileToGithub(token, repo, branch, path, content, commitMessage, isBinary = false) {
  const url = `https://api.github.com/repos/${repo}/contents/${path}`;
  
  // Get file sha if it exists
  let sha = '';
  try {
    const getRes = await fetch(`${url}?ref=${branch}`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    if (getRes.ok) {
      const fileData = await getRes.json();
      sha = fileData.sha;
    }
  } catch (e) {
    // File doesn't exist, this is fine
  }
  
  // Encode content to base64 if it's text
  const base64Content = isBinary ? content : btoa(unescape(encodeURIComponent(content)));
  
  const body = {
    message: commitMessage,
    content: base64Content,
    branch: branch
  };
  
  if (sha) {
    body.sha = sha;
  }
  
  const putRes = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  
  if (!putRes.ok) {
    const errData = await putRes.json();
    throw new Error(errData.message || 'Failed to commit file to GitHub.');
  }
}

// Helper to trigger and await PNG base64 export from Draw.io
function exportPngFromDrawIo() {
  return new Promise((resolve, reject) => {
    if (!isIframeReady || !currentXml) {
      reject(new Error('Draw.io is not ready.'));
      return;
    }
    
    gitSyncPendingResolve = resolve;
    
    // Timeout
    setTimeout(() => {
      if (gitSyncPendingResolve === resolve) {
        gitSyncPendingResolve = null;
        reject(new Error('Export request timed out.'));
      }
    }, 10000);
    
    // Trigger export
    drawioIframe.contentWindow.postMessage(JSON.stringify({
      action: 'export',
      format: 'png',
      bg: '#ffffff',
      xml: currentXml
    }), '*');
  });
}


// --- On Load Check for Invitation Room ID ---
window.addEventListener('load', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam) {
    joinCollabRoom(roomParam);
  }
});




