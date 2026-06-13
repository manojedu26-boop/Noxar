document.addEventListener('DOMContentLoaded', () => {
  const problemInput = document.getElementById('problem-input');
  const selectionStatusIndicator = document.getElementById('selection-status-indicator');
  const selectionStatusText = document.getElementById('selection-status-text');
  const btnDiagnose = document.getElementById('btn-diagnose');
  const btnClear = document.getElementById('btn-clear');
  const loaderPanel = document.getElementById('loader-panel');
  const resultPanel = document.getElementById('result-panel');
  const resultContent = document.getElementById('result-content');
  const modelSelect = document.getElementById('model-select');


  let scrapedCode = "";

  // Helper to update button state based on text presence
  function updateDiagnoseButtonState() {
    const hasText = problemInput.value.trim().length > 0;
    btnDiagnose.disabled = !hasText;
  }

  // Monitor manual text edits
  problemInput.addEventListener('input', updateDiagnoseButtonState);

  // Listen for the global hotkey clipboard trigger event from Tauri
  if (window.__TAURI__) {
    window.__TAURI__.event.listen('clipboard-trigger', (event) => {
      const clipboardContent = event.payload;
      if (clipboardContent && clipboardContent.trim()) {
        problemInput.value = clipboardContent.trim();
        selectionStatusIndicator.classList.add('active');
        selectionStatusText.innerText = "Clipboard content auto-loaded";
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
    selectionStatusIndicator.classList.remove('active');
    selectionStatusText.innerText = "Stand-alone overlay active";
    resultPanel.style.display = 'none';
    resultContent.innerHTML = "";
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
      const response = await fetch('http://127.0.0.1:8000/diagnose', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          problem_text: textToAnalyze,
          code: scrapedCode,
          selectedModel: modelSelect ? modelSelect.value : 'Fast'
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        streamText += chunk;
        
        // Parse and render HTML incrementally
        resultContent.innerHTML = parseMarkdown(streamText);
        
        // Auto-scroll the results container to follow the stream
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

    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // List items
    html = html.replace(/^\s*-\s+(.*$)/gim, '<li>$1</li>');

    // Wrap list items
    let formatted = '';
    let listOpen = false;
    const newLines = html.split('\n');
    for (let line of newLines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('<li>') || trimmed.startsWith('<ul><li>')) {
        const content = trimmed.replace('<ul>', '').replace('</ul>', '');
        if (!listOpen) {
          formatted += '<ul>\n' + content + '\n';
          listOpen = true;
        } else {
          formatted += content + '\n';
        }
      } else {
        if (listOpen) {
          formatted += '</ul>\n';
          listOpen = false;
        }
        formatted += line + '\n';
      }
    }
    if (listOpen) {
      formatted += '</ul>\n';
    }

    return formatted.trim();
  }
});
