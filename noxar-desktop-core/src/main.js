document.addEventListener('DOMContentLoaded', () => {
  const problemInput = document.getElementById('problem-input');
  const btnDiagnose = document.getElementById('btn-diagnose');
  const btnClear = document.getElementById('btn-clear');
  const loaderPanel = document.getElementById('loader-panel');
  const resultPanel = document.getElementById('result-panel');
  const resultContent = document.getElementById('result-content');
  const dockingCoin = document.getElementById('docking-coin');
  const mainCard = document.getElementById('main-card');
  const modelSelect = document.getElementById('model-select');

  // Initialize free tokens
  if (window.localStorage.getItem('noxar_tokens_remaining') === null) {
    window.localStorage.setItem('noxar_tokens_remaining', '15000');
  }

  let scrapedCode = "";

  // Helper to update button state based on text presence
  function updateDiagnoseButtonState() {
    const hasText = problemInput.value.trim().length > 0;
    btnDiagnose.disabled = !hasText;
  }

  // Monitor manual text edits
  problemInput.addEventListener('input', updateDiagnoseButtonState);

  // Listen for the global hotkey clipboard trigger event from Electron IPC
  if (window.electronAPI) {
    window.electronAPI.onClipboardTrigger((clipboardContent) => {
      if (clipboardContent && clipboardContent.trim()) {
        problemInput.value = clipboardContent.trim();
        updateDiagnoseButtonState();
        
        // Auto-trigger the diagnostic analysis loop
        btnDiagnose.click();
      }
    });
  }

  // Clear button click
  btnClear.addEventListener('click', () => {
    problemInput.value = "";
    scrapedCode = "";
    resultPanel.classList.add('hidden');
    resultContent.innerHTML = "";
    updateDiagnoseButtonState();
  });

  // Minimize button click (transitions card to coin state)
  const btnMinimize = document.getElementById('btn-minimize');
  if (btnMinimize) {
    btnMinimize.addEventListener('click', () => {
      if (window.electronAPI) {
        window.electronAPI.minimizeToCoin();
      }
      if (mainCard) {
        mainCard.style.display = 'none';
      }
      if (dockingCoin) {
        dockingCoin.classList.remove('hidden');
      }
      document.body.style.backgroundColor = 'transparent';
    });
  }

  // Track coin dragging state
  let isDragging = false;
  let hasDragged = false;
  let startX = 0;
  let startY = 0;

  if (dockingCoin) {
    dockingCoin.addEventListener('mousedown', (e) => {
      isDragging = true;
      hasDragged = false;
      startX = e.screenX;
      startY = e.screenY;
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (isDragging) {
        const deltaX = e.screenX - startX;
        const deltaY = e.screenY - startY;
        
        if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
          hasDragged = true;
        }
        
        startX = e.screenX;
        startY = e.screenY;
        
        if (window.electronAPI && window.electronAPI.dragWindow) {
          window.electronAPI.dragWindow({ deltaX, deltaY });
        }
      }
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    dockingCoin.addEventListener('click', (e) => {
      if (hasDragged) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      
      if (window.electronAPI) {
        window.electronAPI.expandFromCoin();
      }
      dockingCoin.classList.add('hidden');
      mainCard.style.display = '';
      document.body.style.backgroundColor = '';
    });
  }

  // Listen for the window restore event (e.g. triggered on second instance launch)
  if (window.electronAPI && window.electronAPI.onWindowRestoreUi) {
    window.electronAPI.onWindowRestoreUi(() => {
      if (dockingCoin) {
        dockingCoin.classList.add('hidden');
      }
      if (mainCard) {
        mainCard.style.display = '';
      }
      document.body.style.backgroundColor = '';
    });
  }

  // Diagnose button click
  btnDiagnose.addEventListener('click', async () => {
    const textToAnalyze = problemInput.value.trim();
    if (!textToAnalyze) return;

    // Paywall Token Limit Check
    const tokensRemaining = parseInt(window.localStorage.getItem('noxar_tokens_remaining') || '0', 10);
    if (tokensRemaining <= 0) {
      const paywallModal = document.getElementById('paywall-modal');
      if (paywallModal) {
        paywallModal.classList.remove('hidden');
      }
      return;
    }

    // Loading State
    loaderPanel.classList.remove('hidden');
    resultPanel.classList.add('hidden');
    resultContent.innerHTML = "";
    btnDiagnose.disabled = true;
    btnClear.disabled = true;

    try {
      const selectEl = document.querySelector('select');
      const modelValue = selectEl ? selectEl.value : 'Fast';

      const response = await fetch('https://noxar.onrender.com/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          text: textToAnalyze,
          code: scrapedCode,
          selectedModel: modelValue
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Server error ${response.status}`);
      }

      // Hide loader and show result panel immediately since we're streaming
      loaderPanel.classList.add('hidden');
      resultPanel.classList.remove('hidden');

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let streamText = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        let lines = buffer.split("\n");
        buffer = lines.pop(); // Keep the last partial line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            const dataContent = trimmed.substring(6);
            streamText += dataContent;
            
            // Decrement local tokens
            const currentTokens = parseInt(window.localStorage.getItem('noxar_tokens_remaining') || '0', 10);
            const newTokens = Math.max(0, currentTokens - dataContent.length);
            window.localStorage.setItem('noxar_tokens_remaining', newTokens.toString());
            
            // Parse and render HTML incrementally
            resultContent.innerHTML = parseMarkdown(streamText);
            
            // Auto-scroll the results container to follow the stream
            resultContent.scrollTop = resultContent.scrollHeight;

            if (newTokens <= 0) {
              await reader.cancel();
              const paywallModal = document.getElementById('paywall-modal');
              if (paywallModal) {
                paywallModal.classList.remove('hidden');
              }
              break;
            }
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim().startsWith("data: ")) {
        const dataContent = buffer.trim().substring(6);
        streamText += dataContent;
        resultContent.innerHTML = parseMarkdown(streamText);
        resultContent.scrollTop = resultContent.scrollHeight;
      }
    } catch (error) {
      loaderPanel.classList.add('hidden');
      resultPanel.classList.remove('hidden');
      console.error(error);
      resultContent.innerHTML = `
        <div class="text-[#b91c1c] font-semibold mb-2">Analysis Failed</div>
        <p>${error.message}</p>
        <p class="text-[11px] text-gray-500 mt-2">
          Please check that your FastAPI backend is running locally on port 8000 (<code>uvicorn main:app</code>).
        </p>
      `;
    } finally {
      btnDiagnose.disabled = false;
      btnClear.disabled = false;
    }
  });

  // Regex markdown parser
  function parseMarkdown(md) {
    // 1. Stream buffer stabilization for code blocks
    let textToParse = md;
    const codeBlockCount = (md.match(/```/g) || []).length;
    if (codeBlockCount % 2 !== 0) {
      textToParse += "\n```";
    }

    let html = textToParse
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // 2. Code blocks with language-specific syntax support
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const langClass = lang ? ` class="language-${lang.toLowerCase()}"` : '';
      return `<pre><code${langClass}>${code.trim()}</code></pre>`;
    });
    // Fallback for code blocks without a newline after the language tag or standard blocks
    html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
      return `<pre><code>${code.trim()}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // 3. Tables with stream buffer stabilization
    const lines = html.split('\n');
    let inTable = false;
    let tableHtml = '';
    let outputLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Stabilize table row check during streaming
      if (line.startsWith('|')) {
        if (!inTable) {
          inTable = true;
          tableHtml = '<table>';
        }
        if (line.includes('---')) {
          continue;
        }
        
        // Virtually close incomplete table lines during stream decoding
        const cleanLine = line.endsWith('|') ? line : line + '|';
        const cells = cleanLine.split('|').slice(1, -1);
        const cellType = tableHtml.includes('<th>') ? 'td' : 'th';
        
        let rowHtml = '<tr>';
        for (const cell of cells) {
          rowHtml += `<${cellType}>${cell.trim()}</${cellType}>`;
        }
        rowHtml += '</tr>';
        tableHtml += rowHtml;
      } else {
        if (inTable) {
          inTable = false;
          tableHtml += '</table>';
          outputLines.push(tableHtml);
          tableHtml = '';
        }
        outputLines.push(lines[i]);
      }
    }
    if (inTable) {
      tableHtml += '</table>';
      outputLines.push(tableHtml);
    }
    html = outputLines.join('\n');

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    
    // Support numbered headers generated by reasoning models
    html = html.replace(/^\d+\.\s+([^\n]*(🧮|🌲|⏳|🚨|💻)[^\n]*)$/gim, '<h3>$1</h3>');

    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // 4. Parse lists with support for nesting
    const listLines = html.split('\n');
    let outputLinesAfterLists = [];
    let listStack = []; // stores indentation levels

    for (let i = 0; i < listLines.length; i++) {
      const line = listLines[i];
      const listMatch = line.match(/^(\s*)-\s+(.*)$/);

      if (listMatch) {
        const indent = listMatch[1].length;
        const content = listMatch[2];
        let prefix = '';

        if (listStack.length === 0) {
          listStack.push(indent);
          prefix = '<ul><li>';
        } else {
          const topIndent = listStack[listStack.length - 1];
          if (indent > topIndent) {
            listStack.push(indent);
            prefix = '<ul><li>';
          } else if (indent === topIndent) {
            prefix = '</li><li>';
          } else {
            // Pop until top of stack <= indent
            while (listStack.length > 0 && listStack[listStack.length - 1] > indent) {
              listStack.pop();
              prefix += '</li></ul>';
            }
            if (listStack.length > 0 && listStack[listStack.length - 1] === indent) {
              prefix += '</li><li>';
            } else {
              listStack.push(indent);
              prefix += '<ul><li>';
            }
          }
        }
        outputLinesAfterLists.push(prefix + content);
      } else {
        // Close all open lists
        if (listStack.length > 0) {
          let suffix = '';
          while (listStack.length > 0) {
            listStack.pop();
            suffix += '</li></ul>';
          }
          outputLinesAfterLists.push(suffix);
        }
        outputLinesAfterLists.push(line);
      }
    }

    if (listStack.length > 0) {
      let suffix = '';
      while (listStack.length > 0) {
        listStack.pop();
        suffix += '</li></ul>';
      }
      outputLinesAfterLists.push(suffix);
    }

    // Join with newlines and then convert newlines to <br> to prevent inline text squishing
    return outputLinesAfterLists.join('\n').trim().replace(/\n/g, '<br>');
  }
});
