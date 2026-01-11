// content.js - Robust LeetCode Sync
console.log('🚀 LeetCode GitHub Sync Extension Loaded');

// --- 1. Code Extraction Logic (Main World Injection) ---
function injectCodeExtractor() {
    if (document.getElementById('leetcode-sync-injected')) return;
    const script = document.createElement('script');
    script.id = 'leetcode-sync-injected';
    script.textContent = `
        window.__leetcodeSyncExtractCode = function() {
            try {
                if (window.monaco && window.monaco.editor) {
                    const models = window.monaco.editor.getModels();
                    if(models.length > 0) return models[models.length - 1].getValue(); 
                }
            } catch (e) { console.error('Extraction error:', e); }
            return null;
        };
        window.addEventListener('leetcode-sync-extract-code', function(e) {
            const code = window.__leetcodeSyncExtractCode();
            window.dispatchEvent(new CustomEvent('leetcode-sync-code-response', {
                detail: { requestId: e.detail.requestId, code: code }
            }));
        });
    `;
    (document.head || document.documentElement).appendChild(script);
}

// --- 2. Helper Functions ---
function getCodeFromInjector() {
    return new Promise((resolve) => {
        const requestId = Date.now().toString();
        const handler = (e) => {
            if (e.detail.requestId === requestId) {
                window.removeEventListener('leetcode-sync-code-response', handler);
                resolve(e.detail.code);
            }
        };
        window.addEventListener('leetcode-sync-code-response', handler);
        window.dispatchEvent(new CustomEvent('leetcode-sync-extract-code', { detail: { requestId } }));
        setTimeout(() => {
            window.removeEventListener('leetcode-sync-code-response', handler);
            resolve(null);
        }, 1000);
    });
}

function getProblemInfo() {
    const titleElem = document.querySelector('.text-title-large a') ||
        document.querySelector('[data-cy="question-title"]');
    if (!titleElem) return null;

    const fullTitle = titleElem.innerText;
    const [rawNum, ...nameParts] = fullTitle.split('.');

    // Difficulty
    let difficulty = 'Medium';
    const diffElem = document.querySelector('.text-difficulty-easy') ||
        document.querySelector('.text-difficulty-medium') ||
        document.querySelector('.text-difficulty-hard');
    if (diffElem) difficulty = diffElem.innerText;

    // Fallback difficulty check using text content if class missing
    if (!diffElem) {
        const text = document.body.innerText;
        if (text.includes('Easy')) difficulty = 'Easy';
        else if (text.includes('Hard')) difficulty = 'Hard';
    }

    return {
        number: rawNum.trim(),
        name: nameParts.join('.').trim(),
        difficulty: difficulty.trim(), // Keep Case (Easy/Medium/Hard) for folder naming
        url: window.location.href
    };
}

function detectLanguage() {
    // Try to find the language button text
    const langBtn = document.querySelector('button[id*="headlessui-listbox-button"]');
    if (langBtn) return mapLanguage(langBtn.innerText);
    return 'cpp'; // Default
}

function mapLanguage(langText) {
    langText = langText.toLowerCase();
    if (langText.includes('c++')) return 'cpp';
    if (langText.includes('java') && !langText.includes('script')) return 'java';
    if (langText.includes('python')) return 'py';
    if (langText.includes('javascript')) return 'js';
    if (langText.includes('typescript')) return 'ts';
    if (langText.includes('sql')) return 'sql';
    if (langText.includes('c#')) return 'cs';
    return 'txt';
}

// --- 3. Submission Monitoring (The Fix) ---
async function handleSubmissionClick() {
    console.log('🖱️ Submit clicked. Watching for success...');

    // 1. Capture Data IMMEDIATELY (in case the editor clears/changes)
    const code = await getCodeFromInjector();
    const problem = getProblemInfo();
    const language = detectLanguage();

    if (!code || !problem) {
        console.error('❌ Could not capture initial data');
        return;
    }

    // 2. Poll for "Accepted" status
    let attempts = 0;
    const maxAttempts = 20; // Look for 20 seconds (1s interval)

    const pollInterval = setInterval(() => {
        attempts++;

        // Success indicators in LeetCode UI
        const successElem = document.querySelector('[data-e2e-locator="submission-result-success-text"]') ||
            Array.from(document.querySelectorAll('span, div')).find(el => el.innerText === 'Accepted' && el.className.includes('green'));

        if (successElem) {
            clearInterval(pollInterval);
            console.log('✅ Submission Accepted!');

            // Send to background
            chrome.runtime.sendMessage({
                type: 'SOLUTION_SUBMITTED',
                data: {
                    ...problem,
                    code: code,
                    language: language,
                    timestamp: new Date().toISOString()
                }
            }, (res) => {
                console.log('📤 Sent to background:', res);
            });
        } else if (document.body.innerText.includes('Wrong Answer') || document.body.innerText.includes('Runtime Error')) {
            // Stop polling if failed
            clearInterval(pollInterval);
            console.log('❌ Submission failed (Wrong Answer/Error)');
        }

        if (attempts >= maxAttempts) clearInterval(pollInterval);
    }, 1000);
}

// --- 4. Initialization ---
function init() {
    injectCodeExtractor();

    // Watch for the Submit Button
    // We use a document-level click listener to catch the button even if it re-renders
    document.addEventListener('click', (e) => {
        const target = e.target;
        // Check if the clicked element (or parent) is the submit button
        if (target.innerText === 'Submit' || target.closest('[data-e2e-locator="console-submit-button"]')) {
            handleSubmissionClick();
        }
    }, true);
}

// Start
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();