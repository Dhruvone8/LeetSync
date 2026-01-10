// Content script to monitor LeetCode submissions

let lastSubmittedCode = null;
let currentProblemData = null;

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

// Extract the code from the editor
function extractCode() {
    try {
        // Try multiple selectors for different LeetCode layouts
        const codeElements = document.querySelectorAll('.monaco-editor .view-line');
        if (codeElements.length > 0) {
            return Array.from(codeElements)
                .map(line => line.textContent)
                .join('\n');
        }

        // Fallback to textarea if monaco editor not found
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

// Detect language from the editor
function detectLanguage() {
    try {
        const languageButton = document.querySelector('[id*="headlessui-listbox-button"]') ||
            document.querySelector('.rounded-lg.px-3');

        if (languageButton) {
            const langText = languageButton.textContent.toLowerCase();

            const languageMap = {
                'c++': 'cpp',
                'cpp': 'cpp',
                'java': 'java',
                'python': 'py',
                'python3': 'py',
                'javascript': 'js',
                'typescript': 'ts',
                'c': 'c',
                'c#': 'cs',
                'go': 'go',
                'rust': 'rs',
                'kotlin': 'kt',
                'swift': 'swift',
                'ruby': 'rb',
                'scala': 'scala'
            };

            for (const [key, ext] of Object.entries(languageMap)) {
                if (langText.includes(key)) {
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

// Listen for successful submissions
function monitorSubmissions() {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) {
                    // Check for success message
                    const successText = node.textContent || '';
                    if (successText.includes('Accepted') ||
                        successText.includes('Success') ||
                        node.querySelector('[data-e2e-locator="submission-result"]')) {

                        setTimeout(() => {
                            const problemInfo = extractProblemInfo();
                            const code = extractCode();
                            const language = detectLanguage();

                            if (problemInfo && code) {
                                const submissionData = {
                                    ...problemInfo,
                                    code: code,
                                    language: language,
                                    timestamp: new Date().toISOString()
                                };

                                // Check if code has changed
                                const codeHash = btoa(code).slice(0, 50);
                                if (codeHash !== lastSubmittedCode) {
                                    lastSubmittedCode = codeHash;

                                    // Send to background script
                                    chrome.runtime.sendMessage({
                                        type: 'SOLUTION_SUBMITTED',
                                        data: submissionData
                                    });

                                    console.log('LeetCode solution detected:', submissionData);
                                }
                            }
                        }, 1000);
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
            setTimeout(init, 1000);
        }
    }
}).observe(document, { subtree: true, childList: true });