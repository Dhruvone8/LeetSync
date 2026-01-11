// Content script to monitor LeetCode submissions

let lastSubmittedCode = null;
let currentProblemData = null;
let isSubmitting = false;

// Extract problem information from the page
function extractProblemInfo() {
    try {
        const titleElement = document.querySelector('[data-cy="question-title"]') ||
            document.querySelector('.text-title-large');
        const difficultyElement = document.querySelector('[diff]') ||
            document.querySelector('.text-difficulty-easy, .text-difficulty-medium, .text-difficulty-hard');

        if (!titleElement) return null;

        const title = titleElement.textContent.trim();
        const problemNumber = title.split('.')[0].trim();
        const problemName = title.split('.')[1]?.trim() || title;

        let difficulty = 'medium';
        if (difficultyElement) {
            const diffText = difficultyElement.textContent.toLowerCase();
            if (diffText.includes('easy')) difficulty = 'easy';
            else if (diffText.includes('hard')) difficulty = 'hard';
        }

        return {
            number: problemNumber,
            name: problemName.replace(/[^a-zA-Z0-9]/g, ''),
            difficulty: difficulty,
            fullTitle: title
        };
    } catch (error) {
        console.error('Error extracting problem info:', error);
        return null;
    }
}

// Extract the code from the editor - improved version
function extractCode() {
    try {
        // Method 1: Try to get from Monaco editor model
        const editor = document.querySelector('.monaco-editor');
        if (editor && window.monaco) {
            const models = window.monaco.editor.getModels();
            if (models && models.length > 0) {
                // Get the first model (usually the main code editor)
                return models[0].getValue();
            }
        }

        // Method 2: Extract from view lines
        const codeElements = document.querySelectorAll('.monaco-editor .view-line');
        if (codeElements.length > 0) {
            const lines = Array.from(codeElements).map(line => {
                // Get all spans within the line
                const spans = line.querySelectorAll('span');
                if (spans.length > 0) {
                    return Array.from(spans)
                        .map(span => span.textContent)
                        .join('');
                }
                return line.textContent;
            });
            return lines.join('\n');
        }

        // Method 3: Fallback to textarea
        const textarea = document.querySelector('textarea[autocomplete="off"]');
        if (textarea) {
            return textarea.value;
        }

        return null;
    } catch (error) {
        console.error('Error extracting code:', error);
        return null;
    }
}

// Detect language from the editor - fixed extension mapping
function detectLanguage() {
    try {
        // Try to find the language selector button
        const languageButton = document.querySelector('[id*="headlessui-listbox-button"]') ||
            document.querySelector('button[class*="rounded"]');

        if (languageButton) {
            const langText = languageButton.textContent.toLowerCase().trim();

            const languageMap = {
                'c++': 'cpp',
                'cpp': 'cpp',
                'c++14': 'cpp',
                'c++17': 'cpp',
                'c++20': 'cpp',
                'java': 'java',
                'python': 'py',
                'python3': 'py',
                'javascript': 'js',
                'typescript': 'ts',
                'c': 'c',
                'c#': 'cs',
                'csharp': 'cs',
                'go': 'go',
                'golang': 'go',
                'rust': 'rs',
                'kotlin': 'kt',
                'swift': 'swift',
                'ruby': 'rb',
                'scala': 'scala',
                'php': 'php',
                'mysql': 'sql',
                'mssql': 'sql',
                'oracle': 'sql'
            };

            for (const [key, ext] of Object.entries(languageMap)) {
                if (langText.includes(key)) {
                    console.log('Detected language:', key, '-> extension:', ext);
                    return ext;
                }
            }
        }

        return 'txt';
    } catch (error) {
        console.error('Error detecting language:', error);
        return 'txt';
    }
}

// Monitor for submit button clicks
function monitorSubmitButton() {
    // Find and monitor the submit button
    const observer = new MutationObserver(() => {
        const submitButton = document.querySelector('button[data-e2e-locator="console-submit-button"]') ||
            Array.from(document.querySelectorAll('button')).find(btn =>
                btn.textContent.trim().toLowerCase() === 'submit'
            );

        if (submitButton && !submitButton.dataset.monitored) {
            submitButton.dataset.monitored = 'true';
            submitButton.addEventListener('click', () => {
                console.log('Submit button clicked');
                isSubmitting = true;
                // Store current code when submit is clicked
                const currentCode = extractCode();
                if (currentCode) {
                    sessionStorage.setItem('leetcode_pending_code', currentCode);
                    sessionStorage.setItem('leetcode_pending_language', detectLanguage());
                }
            });
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Listen for successful submissions - improved detection
function monitorSubmissions() {
    const observer = new MutationObserver((mutations) => {
        if (!isSubmitting) return;

        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) {
                    // Check for the specific success indicator
                    const isAccepted = node.textContent?.includes('Accepted') ||
                        node.querySelector('[class*="text-green"]')?.textContent?.includes('Accepted') ||
                        node.querySelector('[data-e2e-locator="submission-result"]')?.textContent?.includes('Accepted');

                    if (isAccepted) {
                        console.log('Accepted solution detected');

                        setTimeout(() => {
                            const problemInfo = extractProblemInfo();
                            // Get the code that was stored when submit was clicked
                            const code = sessionStorage.getItem('leetcode_pending_code') || extractCode();
                            const language = sessionStorage.getItem('leetcode_pending_language') || detectLanguage();

                            if (problemInfo && code) {
                                const submissionData = {
                                    ...problemInfo,
                                    code: code,
                                    language: language,
                                    timestamp: new Date().toISOString()
                                };

                                // Check if code has changed from last submission
                                const codeHash = btoa(unescape(encodeURIComponent(code))).slice(0, 50);
                                if (codeHash !== lastSubmittedCode) {
                                    lastSubmittedCode = codeHash;

                                    // Send to background script
                                    chrome.runtime.sendMessage({
                                        type: 'SOLUTION_SUBMITTED',
                                        data: submissionData
                                    });

                                    console.log('LeetCode solution detected and sent:', {
                                        problem: submissionData.fullTitle,
                                        language: language,
                                        codeLength: code.length
                                    });
                                }

                                // Clear pending code
                                sessionStorage.removeItem('leetcode_pending_code');
                                sessionStorage.removeItem('leetcode_pending_language');
                            }

                            isSubmitting = false;
                        }, 1500); // Wait for submission result to fully load
                    }
                }
            });
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Initialize
function init() {
    currentProblemData = extractProblemInfo();
    if (currentProblemData) {
        console.log('LeetCode GitHub Sync: Monitoring problem', currentProblemData.fullTitle);
    }
    monitorSubmitButton();
    monitorSubmissions();
}

// Wait for page to be fully loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Re-initialize when navigating to a new problem (SPA behavior)
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        if (url.includes('/problems/')) {
            isSubmitting = false;
            lastSubmittedCode = null;
            setTimeout(init, 1000);
        }
    }
}).observe(document, { subtree: true, childList: true });