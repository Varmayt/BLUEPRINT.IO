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
const saveDiagramBtn = document.getElementById('save-diagram-btn');
const addPageBtn = document.getElementById('add-page-btn');
const pagesList = document.getElementById('pages-list');

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
const EMPTY_DIAGRAM_XML = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>`;
let diagramPages = [];
let activePageId = '';
let currentXml = EMPTY_DIAGRAM_XML;
let lastProjectDescription = '';
let isUsingSavedPd = false;

// Collaboration State
let socket = null;
let collabRoomId = '';
let isIncomingUpdate = false;
let incomingUpdateTimeout = null;

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
      let msg;
      if (typeof e.data === 'string') {
        try {
          msg = JSON.parse(e.data);
        } catch (err) {
          return; // Ignore non-JSON strings
        }
      } else if (typeof e.data === 'object' && e.data !== null) {
        msg = e.data;
      } else {
        return;
      }

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
        
        // Update active page XML
        const activePage = diagramPages.find(p => p.id === activePageId);
        if (activePage) {
          activePage.xml = currentXml;
          debounceSaveActiveDiagram();
        }
        
        if (isIncomingUpdate) {
          isIncomingUpdate = false;
          if (incomingUpdateTimeout) {
            clearTimeout(incomingUpdateTimeout);
            incomingUpdateTimeout = null;
          }
        } else {
          if (socket && socket.connected) {
            socket.emit('diagram-update', {
              roomId: collabRoomId,
              xml: currentXml,
              level: 'canvas edit',
              prompt: promptInput.value || lastProjectDescription
            });
          }
        }
      }
    } catch (err) {
      console.error('Message handler error:', err);
    }
  }
});

function loadXmlToDrawIo(xml) {
  if (!isIframeReady) return;
  isIncomingUpdate = true;
  
  if (incomingUpdateTimeout) clearTimeout(incomingUpdateTimeout);
  incomingUpdateTimeout = setTimeout(() => {
    isIncomingUpdate = false;
    incomingUpdateTimeout = null;
  }, 1500); // safety fallback in case no autosave event is fired
  
  drawioIframe.contentWindow.postMessage(JSON.stringify({
    action: 'load',
    xml: xml,
    autosave: 1
  }), '*');
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
      // Validate key with a tiny request via proxy
      const response = await fetch('/api/gemini-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: newKey,
          contents: [{ role: "user", parts: [{ text: "hi" }] }]
        })
      });
      
      const data = await response.json();
      if (data.error) {
        throw new Error(data.error.message || 'Invalid API Key');
      }
      
      // Success
      personalApiKey = newKey;
      localStorage.setItem('gemini_api_key', personalApiKey);
      updateConfigUI();
      configModal.classList.add('hidden');
    } catch (err) {
      if (errorMsg) {
        errorMsg.textContent = err.message || 'Invalid API Key. Please check and try again.';
        errorMsg.classList.remove('hidden');
      }
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
    
    const activePage = diagramPages.find(p => p.id === activePageId);
    let pageToLoad = activePage;
    
    if (activePage && !isDiagramXmlEmpty(activePage.xml)) {
      // Current active page has data, so create a new page!
      let maxNum = 0;
      diagramPages.forEach(p => {
        const namePart = p.id.replace('diagram_', '');
        const num = parseInt(namePart);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      });
      const nextNum = maxNum + 1;
      const newId = `diagram_${nextNum}`;
      const newName = `Diagram ${nextNum}`;
      const newFilename = `diagram_${nextNum}.xml`;
      
      pageToLoad = {
        id: newId,
        name: newName,
        filename: newFilename,
        xml: currentXml
      };
      
      diagramPages.push(pageToLoad);
      activePageId = newId;
    } else if (pageToLoad) {
      pageToLoad.xml = currentXml;
    }
    
    await saveDiagramToWorkspace(pageToLoad);
    renderPagesBar();
    
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
Node Types to use: "actor" (for people/users), "container" (for our main system), "external" (for third party services/systems).`;
      break;
    case 'container':
      levelSpecificInstructions = `You are generating a Level 2: Container Diagram.
FOCUS: Show the high-level technical building blocks (containers) like web applications, databases, and microservices within the system, and how they communicate.
Node Types to use: "actor" (for people/users), "container" (for web app, API service, microservices), "database" (for databases/caches), "external" (for external systems/third party services).`;
      break;
    case 'component':
      levelSpecificInstructions = `You are generating a Level 3: Component Diagram.
FOCUS: Zoom into ONE specific container to show its internal components (e.g., controllers, services, repositories).
Node Types to use: "container" (for components), "database" (for local container databases/external systems).`;
      break;
    default:
      levelSpecificInstructions = `You are generating a C4 diagram.`;
  }

  const systemInstruction = `You are an expert system architect. Your task is to analyze the user's description and generate a clean, structured JSON representation of a C4 diagram.
  
${levelSpecificInstructions}

Return ONLY a valid JSON object matching the following structure:
{
  "diagramType": "${level}",
  "nodes": [
    { "id": "unique_node_id", "name": "Display Name", "type": "actor|container|database|external", "tech": "Technology or category (e.g. React, Node.js, PostgreSQL)", "description": "Brief description of what this does" }
  ],
  "edges": [
    { "source": "source_node_id", "target": "target_node_id", "label": "Describe connection interaction (e.g., Uses, Sends requests)", "protocol": "e.g. HTTP/JSON, gRPC, JDBC" }
  ]
}

Ensure all nodes have unique string IDs (no spaces, e.g. "api_service", "user"). Ensure all edges refer to existing node IDs.
Do NOT include any markdown code formatting (like \`\`\`json) or trailing text. Return raw JSON text only.`;

  try {
    const response = await fetch('/api/gemini-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-gemini-key': activeKey
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${systemInstruction}\n\nUser Description: ${prompt}` }] }]
      })
    });
    
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    
    let text = '';
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
      text = data.candidates[0].content.parts[0].text;
    } else {
      throw new Error("Unable to generate response from Gemini API. The request might have been blocked by safety filters.");
    }
    
    // Extract JSON block if LLM wrapped in code block
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      text = match[0];
    }
    
    const graphData = JSON.parse(text.trim());
    const generatedXml = layoutDiagram(graphData);
    return generatedXml;
  } catch (err) {
    console.error("API Call/Layout Failed", err);
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

  try {
    const response = await fetch('/api/gemini-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-gemini-key': activeKey
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${analysisInstruction}\n\nUser Message: ${prompt}` }] }]
      })
    });
    
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    
    let text = '';
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
      text = data.candidates[0].content.parts[0].text;
    } else {
      throw new Error("Unable to analyze message due to empty API response.");
    }
    return text.trim();
  } catch (err) {
    console.error("Analyze Call Failed", err);
    throw new Error(err.message || "Failed to analyze prompt.");
  }
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
  
  if (!personalApiKey) {
    addMessage("⚠️ API Key required. Please connect your Gemini API Key in the settings (gear icon in the top right) to analyze the codebase structure.", false);
    configModal.classList.remove('hidden');
    apiKeyInput.focus();
    return;
  }
  
  // Show message indicator and enable loading state
  loadingIndicator.classList.add('active');
  document.getElementById('submit-btn').disabled = true;
  addMessage("Scanning repository and parsing project files...", false);
  
  try {
    const ignoreDirs = ['node_modules', '.git', '.venv', '.next', 'dist', 'build', 'target', 'bin', 'obj', 'venv', 'env', '__pycache__', '.idea', '.vscode'];
    const configFilenames = [
      'package.json', 'pom.xml', 'requirements.txt', 'go.mod', 'docker-compose.yml', 'docker-compose.yaml', 
      'Dockerfile', 'Cargo.toml', 'mix.exs', 'build.gradle', 'Gemfile', 'composer.json',
      'next.config.js', 'next.config.mjs', 'vite.config.js', 'vite.config.ts', 'tsconfig.json'
    ];
    
    // Determine the root name from the first path
    let rootName = 'root';
    for (let i = 0; i < files.length; i++) {
      const path = files[i].webkitRelativePath || files[i].name;
      const parts = path.split('/');
      if (parts.length > 0 && parts[0]) {
        rootName = parts[0];
        break;
      }
    }
    
    const tree = { name: rootName, type: 'directory', children: [] };
    const configs = [];
    let scannedFilesCount = 0;
    
    const yieldControl = () => new Promise(resolve => setTimeout(resolve, 0));
    
    for (let i = 0; i < files.length; i++) {
      if (i > 0 && i % 500 === 0) {
        await yieldControl();
      }
      
      const file = files[i];
      const path = file.webkitRelativePath || file.name;
      const parts = path.split('/');
      const name = parts[parts.length - 1];
      
      // Filter out ignored folders
      const shouldIgnore = parts.some(p => ignoreDirs.includes(p));
      if (shouldIgnore) continue;
      
      scannedFilesCount++;
      
      // Insert path into directory tree
      insertPath(tree, parts);
      
      // Check if it is a configuration file we want to read
      if (configFilenames.includes(name)) {
        if (configs.length < 50) {
          try {
            const content = await file.text();
            configs.push({
              path: path,
              name: name,
              content: content
            });
          } catch (e) {
            console.warn(`Failed to read file ${path}:`, e);
          }
        } else {
          configs.push({
            path: path,
            name: name,
            content: "[File content omitted: too many configuration files in codebase]"
          });
        }
      }
    }
    
    // Helper to insert paths into the tree
    function insertPath(treeNode, pathParts) {
      let current = treeNode;
      // skip the root folder name itself if it matches treeNode.name
      const startIdx = pathParts[0] === treeNode.name ? 1 : 0;
      
      for (let j = startIdx; j < pathParts.length; j++) {
        const part = pathParts[j];
        if (!part) continue;
        
        const isLast = (j === pathParts.length - 1);
        
        let child = current.children.find(c => c.name === part);
        if (!child) {
          child = {
            name: part,
            type: isLast ? 'file' : 'directory'
          };
          if (!isLast) {
            child.children = [];
          }
          current.children.push(child);
        }
        current = child;
      }
    }
    
    if (scannedFilesCount === 0) {
      addMessage("⚠️ No valid source files found in the uploaded folder.", false);
      return;
    }
    
    addMessage(`Analyzing config files and directory layout for ${scannedFilesCount} source files...`, false);
    
    const detailedDescription = await analyzeCodebaseWithGemini(configs, tree);
    
    // Update input area with detailed architectural analysis
    promptInput.value = detailedDescription;
    promptInput.focus();
    
    addMessage(`Successfully analyzed codebase! Gemini has auto-generated a rich, detailed system architecture description in the input field. Select a Diagram Level and click the Generate button to design it!`, false);
    
  } catch (err) {
    addMessage(`⚠️ Repository import or analysis failed: ${err.message}`, false);
    console.error(err);
  } finally {
    loadingIndicator.classList.remove('active');
    document.getElementById('submit-btn').disabled = false;
  }
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
      handleCollabDisconnect();
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
    const getRes = await fetch('/api/github-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `${url}?ref=${branch}`,
        method: 'GET',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Blueprint-io-Client'
        }
      })
    });
    if (getRes.ok) {
      const fileData = await getRes.json();
      sha = fileData.sha;
    }
  } catch (e) {
    // File doesn't exist, this is fine
  }
  
  // Encode content to base64 using TextEncoder (standard, non-deprecated method)
  let base64Content;
  if (isBinary) {
    base64Content = content;
  } else {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    base64Content = btoa(String.fromCharCode(...data));
  }
  
  const body = {
    message: commitMessage,
    content: base64Content,
    branch: branch
  };
  
  if (sha) {
    body.sha = sha;
  }
  
  const putRes = await fetch('/api/github-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: url,
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Blueprint-io-Client'
      },
      body: body
    })
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

// --- Diagram Pages Bar and Persistence Helper Functions ---

function isDiagramXmlEmpty(xml) {
  if (!xml) return true;
  if (xml === EMPTY_DIAGRAM_XML) return true;
  // If there are 2 or fewer mxCell tags, it's considered empty
  const cellCount = (xml.match(/<mxCell/g) || []).length;
  return cellCount <= 2;
}

function layoutDiagram(graph) {
  const { diagramType, nodes, edges } = graph;
  
  if (!nodes || !Array.isArray(nodes)) return EMPTY_DIAGRAM_XML;
  
  // Classify layers
  const inEdges = {};
  const outEdges = {};
  nodes.forEach(n => {
    inEdges[n.id] = [];
    outEdges[n.id] = [];
  });
  if (edges && Array.isArray(edges)) {
    edges.forEach(e => {
      if (inEdges[e.target]) inEdges[e.target].push(e);
      if (outEdges[e.source]) outEdges[e.source].push(e);
    });
  }
  
  // Assign rows/levels
  const levels = {};
  nodes.forEach(n => {
    const typeLower = (n.type || '').toLowerCase();
    if (typeLower === 'actor' || typeLower === 'user' || typeLower === 'person') {
      levels[n.id] = 0;
    } else if (typeLower === 'database' || typeLower === 'db' || typeLower === 'cache' || typeLower === 'external' || typeLower === 'third-party') {
      levels[n.id] = 3;
    } else {
      // General component or container
      const isClient = inEdges[n.id] && inEdges[n.id].length === 0;
      if (isClient) {
        levels[n.id] = 1;
      } else {
        levels[n.id] = 2;
      }
    }
  });
  
  // Group nodes by level
  const rows = [[], [], [], []];
  nodes.forEach(n => {
    const lvl = levels[n.id] !== undefined ? levels[n.id] : 2;
    rows[lvl].push(n);
  });
  
  // Remove empty rows
  const activeRows = rows.filter(r => r.length > 0);
  
  // Compute positions
  const rowHeight = 280;
  const colWidth = 380;
  const nodeWidth = 220;
  const nodeHeight = 140;
  
  const positions = {};
  activeRows.forEach((rowNodes, rowIndex) => {
    const rowY = rowIndex * rowHeight + 100;
    const rowWidthTotal = rowNodes.length * colWidth;
    rowNodes.forEach((node, colIndex) => {
      const nodeX = colIndex * colWidth + (800 - rowWidthTotal) / 2 + 100;
      positions[node.id] = { x: nodeX, y: rowY };
    });
  });
  
  // Build XML elements
  let xml = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>';
  
  nodes.forEach(n => {
    const pos = positions[n.id] || { x: 100, y: 100 };
    let style = "whiteSpace=wrap;html=1;align=center;verticalAlign=top;spacingTop=8;fontSize=12;";
    const typeLower = (n.type || '').toLowerCase();
    
    // Choose styling/colors based on type
    if (typeLower === 'actor' || typeLower === 'user' || typeLower === 'person') {
      style += "shape=mxgraph.basic.person;fillColor=#1168bd;strokeColor=#0b4884;fontColor=#ffffff;";
    } else if (typeLower === 'database' || typeLower === 'db') {
      style += "shape=cylinder;fillColor=#2b2b2b;strokeColor=#1a1a1a;fontColor=#ffffff;";
    } else if (typeLower === 'external' || typeLower === 'third-party') {
      style += "fillColor=#7a7a7a;strokeColor=#555555;fontColor=#ffffff;";
    } else {
      // standard container
      style += "fillColor=#1168bd;strokeColor=#0b4884;fontColor=#ffffff;rounded=1;";
    }
    
    // Format text
    const label = `<b>${n.name || 'Component'}</b><br/>[${n.tech || n.type || 'Container'}]<br/><br/>${n.description || ''}`;
    const safeLabel = escapeXml(label);
    
    xml += `<mxCell id="${n.id}" value="${safeLabel}" style="${style}" vertex="1" parent="1">`;
    xml += `<mxGeometry x="${pos.x}" y="${pos.y}" width="${nodeWidth}" height="${nodeHeight}" as="geometry"/>`;
    xml += `</mxCell>`;
  });
  
  if (edges && Array.isArray(edges)) {
    edges.forEach((e, idx) => {
      const edgeId = `edge_${idx}`;
      const label = e.label ? `<b>${e.label}</b>` + (e.protocol ? `<br/>[${e.protocol}]` : '') : '';
      const safeLabel = escapeXml(label);
      
      let style = "edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#1168bd;strokeWidth=2;fontSize=10;";
      xml += `<mxCell id="${edgeId}" value="${safeLabel}" style="${style}" edge="1" parent="1" source="${e.source}" target="${e.target}">`;
      xml += `<mxGeometry relative="1" as="geometry">`;
      xml += `<mxPoint as="offset" y="15"/>`;
      xml += `</mxGeometry>`;
      xml += `</mxCell>`;
    });
  }
  
  xml += '</root></mxGraphModel>';
  return xml;
}

function escapeXml(unsafe) {
  return (unsafe || '').replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

async function saveDiagramToWorkspace(page) {
  try {
    const response = await fetch('/api/save-diagram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: page.filename, xml: page.xml })
    });
    if (!response.ok) {
      throw new Error('Save API returned error');
    }
  } catch (err) {
    console.error('Failed to save diagram to workspace:', err);
  }
}

let saveTimeout = null;
function debounceSaveActiveDiagram() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    const activePage = diagramPages.find(p => p.id === activePageId);
    if (activePage) {
      saveDiagramToWorkspace(activePage);
    }
  }, 1000);
}

function renderPagesBar() {
  if (!pagesList) return;
  pagesList.innerHTML = '';
  
  diagramPages.forEach(page => {
    const tab = document.createElement('div');
    tab.className = `page-tab ${page.id === activePageId ? 'active' : ''}`;
    tab.dataset.id = page.id;
    
    const title = document.createElement('span');
    title.textContent = page.name;
    title.style.cursor = 'pointer';
    title.addEventListener('click', () => switchPage(page.id));
    tab.appendChild(title);
    
    if (diagramPages.length > 1) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'page-close-btn';
      closeBtn.innerHTML = '&times;';
      closeBtn.title = 'Delete Page';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deletePage(page.id);
      });
      tab.appendChild(closeBtn);
    }
    
    pagesList.appendChild(tab);
  });
}

async function switchPage(pageId) {
  if (pageId === activePageId) return;
  activePageId = pageId;
  const page = diagramPages.find(p => p.id === pageId);
  if (page) {
    currentXml = page.xml;
    xmlOutput.textContent = currentXml;
    renderPagesBar();
    loadXmlToDrawIo(currentXml);
  }
}

async function deletePage(pageId) {
  const pageIndex = diagramPages.findIndex(p => p.id === pageId);
  if (pageIndex === -1) return;
  
  const pageToDelete = diagramPages[pageIndex];
  
  try {
    await fetch('/api/delete-diagram', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: pageToDelete.filename })
    });
  } catch (err) {
    console.error('Failed to delete diagram from workspace:', err);
  }
  
  diagramPages.splice(pageIndex, 1);
  
  if (activePageId === pageId) {
    const newActiveIndex = Math.max(0, pageIndex - 1);
    activePageId = diagramPages[newActiveIndex].id;
    currentXml = diagramPages[newActiveIndex].xml;
  }
  
  renderPagesBar();
  xmlOutput.textContent = currentXml;
  loadXmlToDrawIo(currentXml);
  addMessage(`Deleted diagram page "${pageToDelete.name}".`, false);
}

async function loadDiagramsFromWorkspace() {
  try {
    const res = await fetch('/api/list-diagrams');
    if (res.ok) {
      const data = await res.json();
      diagramPages = data && data.length > 0 ? data : [];
      
      // Determine the next page number to avoid naming conflicts
      let maxNum = 0;
      diagramPages.forEach(p => {
        const namePart = p.id.replace('diagram_', '');
        const num = parseInt(namePart);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      });
      const nextNum = maxNum + 1;
      const newId = `diagram_${nextNum}`;
      const newName = `Diagram ${nextNum}`;
      const newFilename = `diagram_${nextNum}.xml`;
      
      const newPage = {
        id: newId,
        name: newName,
        filename: newFilename,
        xml: EMPTY_DIAGRAM_XML
      };
      
      diagramPages.push(newPage);
      activePageId = newId;
      currentXml = EMPTY_DIAGRAM_XML;
      
      renderPagesBar();
      xmlOutput.textContent = currentXml;
      if (isIframeReady) {
        loadXmlToDrawIo(currentXml);
      }
    }
  } catch (err) {
    console.error('Failed to load workspace diagrams:', err);
  }
}

// Bind Save Diagram button listener
saveDiagramBtn.addEventListener('click', async () => {
  const activePage = diagramPages.find(p => p.id === activePageId);
  if (!activePage) return;
  
  const spanEl = saveDiagramBtn.querySelector('span');
  const svgEl = saveDiagramBtn.querySelector('svg');
  const originalText = spanEl.textContent;
  
  spanEl.textContent = 'Saving...';
  saveDiagramBtn.disabled = true;
  
  try {
    await saveDiagramToWorkspace(activePage);
    
    // Success feedback
    const originalSvg = svgEl.innerHTML;
    svgEl.innerHTML = `<polyline points="20 6 9 17 4 12"></polyline>`;
    spanEl.textContent = 'Saved!';
    
    setTimeout(() => {
      svgEl.innerHTML = originalSvg;
      spanEl.textContent = originalText;
      saveDiagramBtn.disabled = false;
    }, 2000);
    
    addMessage(`Diagram page "${activePage.name}" saved to local file "${activePage.filename}"!`, false);
  } catch (err) {
    addMessage(`Failed to save diagram: ${err.message}`, false);
    spanEl.textContent = originalText;
    saveDiagramBtn.disabled = false;
  }
});

// Bind Add Page button listener
addPageBtn.addEventListener('click', async () => {
  let maxNum = 0;
  diagramPages.forEach(p => {
    const namePart = p.id.replace('diagram_', '');
    const num = parseInt(namePart);
    if (!isNaN(num) && num > maxNum) {
      maxNum = num;
    }
  });
  const nextNum = maxNum + 1;
  const newId = `diagram_${nextNum}`;
  const newName = `Diagram ${nextNum}`;
  const newFilename = `diagram_${nextNum}.xml`;
  
  const newPage = {
    id: newId,
    name: newName,
    filename: newFilename,
    xml: EMPTY_DIAGRAM_XML
  };
  
  diagramPages.push(newPage);
  activePageId = newId;
  currentXml = EMPTY_DIAGRAM_XML;
  
  await saveDiagramToWorkspace(newPage);
  renderPagesBar();
  xmlOutput.textContent = currentXml;
  loadXmlToDrawIo(currentXml);
  
  addMessage(`Created new diagram page "${newName}"!`, false);
});

// Deep codebase analysis helper using Gemini
async function analyzeCodebaseWithGemini(configs, tree) {
  if (!personalApiKey) {
    throw new Error("API Key is required to perform deep codebase architecture reasoning. Please configure your key in settings.");
  }
  
  // Format configurations text
  let configsSummary = "";
  configs.forEach(cfg => {
    configsSummary += `\n--- File: ${cfg.path} ---\n${cfg.content}\n`;
  });
  
  // Format directory tree briefly
  let treeText = "";
  if (tree && tree.children) {
    treeText = JSON.stringify(tree, (key, val) => {
      if (key === 'size') return undefined; // remove file sizes to save tokens
      return val;
    }, 2);
  }

  const analysisInstruction = `You are a Principal Software Architect. Your task is to analyze the folder structure and raw configuration files of a codebase and write a highly detailed, comprehensive architectural description of the system.
  
Do NOT generalize or use generic templates. Identify all specific technologies, languages, libraries, and frameworks declared in the files.
Be extremely thorough. Ensure you call out:
1. Programming languages, package versions, and client-side web frameworks.
2. Backend API frameworks, databases, caches, queues, and workflows (e.g. Restate, Aidbox, PostgreSQL, Redis, RabbitMQ, Kafka).
3. Service-to-service communication protocols and data flows.
4. Any external integrations or SaaS providers.

Respond with a rich, structured description detailing these components and how they connect. Avoid placeholders like "database". Write "Aidbox FHIR database" or "Restate workflow handler" if found in the files.`;

  const response = await fetch('/api/gemini-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-gemini-key': personalApiKey
    },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [{
          text: `${analysisInstruction}\n\n=== Directory Tree ===\n${treeText}\n\n=== Configuration Files ===\n${configsSummary}`
        }]
      }]
    })
  });
  
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Gemini proxy returned an error during codebase analysis');
  }
  
  const resData = await response.json();
  if (resData.candidates && resData.candidates[0] && resData.candidates[0].content && resData.candidates[0].content.parts && resData.candidates[0].content.parts[0]) {
    return resData.candidates[0].content.parts[0].text.trim();
  } else {
    throw new Error("Unable to generate codebase analysis from Gemini API.");
  }
}



// --- On Load Check for Invitation Room ID ---
window.addEventListener('load', () => {
  // Load workspace diagrams
  loadDiagramsFromWorkspace();

  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam) {
    joinCollabRoom(roomParam);
  }
});



