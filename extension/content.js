// Helper to retrieve Monaco Editor code by injecting a script into the page context
function getMonacoCode() {
  return new Promise((resolve) => {
    const eventName = 'NOXAR_RETRIEVED_CODE_' + Math.random().toString(36).substring(2, 9);
    
    // Listen for custom event response
    const handler = (event) => {
      window.removeEventListener(eventName, handler);
      resolve(event.detail.code || "");
    };
    window.addEventListener(eventName, handler);

    // Set a timeout in case page doesn't have monaco or script fails
    const timeout = setTimeout(() => {
      window.removeEventListener(eventName, handler);
      resolve("");
    }, 400);

    // Inject code to run in page context (MAIN world)
    try {
      const script = document.createElement('script');
      script.textContent = `
        (function() {
          let code = "";
          try {
            if (window.monaco && window.monaco.editor) {
              const editors = window.monaco.editor.getEditors();
              if (editors && editors.length > 0) {
                const activeModel = editors[0].getModel();
                if (activeModel) {
                  code = activeModel.getValue();
                }
              }
              if (!code) {
                const models = window.monaco.editor.getModels();
                if (models && models.length > 0) {
                  const userModels = models.filter(m => {
                    const path = m.uri.path;
                    return !path.includes('node_modules') && !path.includes('lib.d.ts') && !path.includes('typescript');
                  });
                  if (userModels.length > 0) {
                    code = userModels[0].getValue();
                  } else {
                    code = models[0].getValue();
                  }
                }
              }
            }
          } catch(e) {
            console.error("NOXAR: Error getting Monaco code", e);
          }
          window.dispatchEvent(new CustomEvent('${eventName}', { detail: { code } }));
        })();
      `;
      document.documentElement.appendChild(script);
      script.remove();
    } catch (e) {
      console.error("NOXAR: Failed to inject script", e);
      clearTimeout(timeout);
      resolve("");
    }
  });
}

// Scrapes the problem statement text using a prioritized list of selectors
function getProblemText() {
  const descriptionSelectors = [
    '[data-track-load="description_content"]', // LeetCode
    '.elfjS',
    '.question-content',
    '.question-description',
    '.question-detail',
    '.problem-statement', // Codeforces, Codechef
    '#problem-statement', // Codechef
    '.problem-description',
    '#problem-description',
    '.problem_statement',
    '#problem-body'
  ];

  for (const selector of descriptionSelectors) {
    const el = document.querySelector(selector);
    if (el && el.innerText && el.innerText.trim()) {
      return el.innerText.trim();
    }
  }

  // Fallback: Selected text or body text
  const selection = window.getSelection().toString().trim();
  if (selection) {
    return selection;
  }

  return "";
}

// Scrapes the code solution with fallback checks
async function getCode() {
  // 1. Try Monaco Editor via injection (for LeetCode, Codechef, etc.)
  const monacoCode = await getMonacoCode();
  if (monacoCode && monacoCode.trim()) {
    return monacoCode;
  }

  // 2. Scan all textareas on the page for code-like contents or editor identifiers
  const allTextareas = Array.from(document.querySelectorAll('textarea'));
  
  // First pass: look for typical editor class/ID/name patterns
  const prioritizedSelectors = [
    'textarea[name="sourceCode"]',
    '#sourceCode',
    'textarea.editor',
    '.ace_text-input',
    'textarea[name="source"]',
    'textarea[name="code"]',
    'textarea.code-editor',
    'textarea#code',
    '.code-area textarea'
  ];
  for (const selector of prioritizedSelectors) {
    const el = document.querySelector(selector);
    if (el && el.value && el.value.trim()) {
      return el.value.trim();
    }
  }

  // Second pass: scan textareas by scanning their properties for editor indicators
  for (const ta of allTextareas) {
    const name = (ta.name || "").toLowerCase();
    const id = (ta.id || "").toLowerCase();
    const className = (ta.className || "").toLowerCase();
    
    if (
      name.includes('code') || id.includes('code') || className.includes('code') ||
      name.includes('source') || id.includes('source') || className.includes('editor') ||
      className.includes('ace_text')
    ) {
      if (ta.value && ta.value.trim().length > 10) {
        return ta.value.trim();
      }
    }
  }

  // Third pass: heuristic scan of all textareas for code-like structures
  for (const ta of allTextareas) {
    const val = ta.value || "";
    if (
      val.trim().length > 20 && 
      (val.includes('#include') || val.includes('def ') || val.includes('class ') || val.includes('import ') || val.includes('public static void main'))
    ) {
      return val.trim();
    }
  }

  // 4. Fallback: Selection text if it looks like code
  const selectedText = window.getSelection().toString().trim();
  if (selectedText && (selectedText.includes('class ') || selectedText.includes('def ') || selectedText.includes('#include') || selectedText.includes('import '))) {
    return selectedText;
  }

  return "";
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getSelection") {
    const selectedText = window.getSelection().toString();
    sendResponse({ text: selectedText });
  } else if (request.action === "getLeetCodeData") {
    getCode().then((code) => {
      const problemText = getProblemText();
      sendResponse({
        problem_text: problemText,
        code: code,
        title: document.title,
        url: window.location.href
      });
    });
    return true; // Keep message channel open for asynchronous response
  }
  return true;
});
