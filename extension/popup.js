document.addEventListener('DOMContentLoaded', () => {
  const problemInput = document.getElementById('problem-input');
  const selectionStatusIndicator = document.getElementById('selection-status-indicator');
  const selectionStatusText = document.getElementById('selection-status-text');
  const btnDiagnose = document.getElementById('btn-diagnose');
  const btnClear = document.getElementById('btn-clear');
  const loaderPanel = document.getElementById('loader-panel');
  const resultPanel = document.getElementById('result-panel');
  const resultContent = document.getElementById('result-content');

  let scrapedCode = "";

  // Helper to update button state based on text presence
  function updateDiagnoseButtonState() {
    const hasText = problemInput.value.trim().length > 0;
    btnDiagnose.disabled = !hasText;
  }

  // Monitor manual text edits
  problemInput.addEventListener('input', updateDiagnoseButtonState);

  // Capture text selection and code from active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) return;
    const tab = tabs[0];

    if (!tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:")) {
      selectionStatusText.innerText = "System page - manual entry only";
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: "getLeetCodeData" }, (response) => {
      if (chrome.runtime.lastError) {
        // Content script might need programmatic injection
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        }, () => {
          if (chrome.runtime.lastError) {
            selectionStatusText.innerText = "No page data captured";
            return;
          }
          chrome.tabs.sendMessage(tab.id, { action: "getLeetCodeData" }, (retryResponse) => {
            handleLeetCodeResponse(retryResponse);
          });
        });
      } else {
        handleLeetCodeResponse(response);
      }
    });
  });

  function handleLeetCodeResponse(response) {
    if (response) {
      if (response.problem_text && response.problem_text.trim()) {
        problemInput.value = response.problem_text.trim();
      }
      
      if (response.code && response.code.trim()) {
        scrapedCode = response.code.trim();
      }

      if (response.problem_text && response.problem_text.trim() && response.code && response.code.trim()) {
        selectionStatusIndicator.classList.add('active');
        selectionStatusText.innerText = "Problem and solution loaded";
      } else if (response.problem_text && response.problem_text.trim()) {
        selectionStatusIndicator.classList.add('active');
        selectionStatusText.innerText = "Problem statement loaded";
      } else if (response.code && response.code.trim()) {
        selectionStatusIndicator.classList.add('active');
        selectionStatusText.innerText = "Code solution loaded";
      } else {
        selectionStatusText.innerText = "No selection - manual entry enabled";
      }
    } else {
      selectionStatusText.innerText = "No selection - manual entry enabled";
    }
    updateDiagnoseButtonState();
  }

  // Clear button click
  btnClear.addEventListener('click', () => {
    problemInput.value = "";
    scrapedCode = "";
    selectionStatusIndicator.classList.remove('active');
    selectionStatusText.innerText = "Waiting for page selection...";
    resultPanel.style.display = 'none';
    updateDiagnoseButtonState();
  });

  // Diagnose button click
  btnDiagnose.addEventListener('click', async () => {
    const textToAnalyze = problemInput.value.trim();
    if (!textToAnalyze) return;

    // Loading State
    loaderPanel.style.display = 'flex';
    resultPanel.style.display = 'none';
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
      loaderPanel.style.display = 'none';
      resultPanel.style.display = 'block';

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
        buffer = lines.pop(); // Keep last partial line

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            const dataContent = trimmed.substring(6);
            streamText += dataContent;
            
            // Parse and render HTML incrementally
            resultContent.innerHTML = parseMarkdown(streamText);
            
            // Auto-scroll the popup container or result panel to the bottom to follow the stream
            resultPanel.scrollTop = resultPanel.scrollHeight;
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim().startsWith("data: ")) {
        const dataContent = buffer.trim().substring(6);
        streamText += dataContent;
        resultContent.innerHTML = parseMarkdown(streamText);
        resultPanel.scrollTop = resultPanel.scrollHeight;
      }
    } catch (error) {
      loaderPanel.style.display = 'none';
      resultPanel.style.display = 'block';
      console.error(error);
      resultContent.innerHTML = `
        <div style="color: #b91c1c; font-weight: 600; margin-bottom: 8px;">Analysis Failed</div>
        <p>${error.message}</p>
        <p style="font-size: 11px; color: #6b7280; margin-top: 8px;">
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
