// Content script to monitor LeetCode submissions

let lastSubmittedCode = null;
let isSubmitting = false;

// Extract problem information from the page
function extractProblemInfo() {
    try {
        const titleElement = document.querySelector('[data-cy="question-title"]') ||
            document.querySelector('.text-title-large') ||
            document.querySelector('a[href*="/problems/"]');

        if (!titleElement) return null;

        const title = titleElement.textContent.trim();

        // Extract problem number and name
        let problemNumber = '';
        let problemName = '';

        if (title.includes('.')) {
            const parts = title.split('.');
            problemNumber = parts[0].trim();
            problemName = parts.slice(1).join('.').trim();
        } else {
            // If no number in title, try to extract from URL
            const urlMatch = window.location.pathname.match(/\/problems\/([^\/]+)/);
            if (urlMatch) {
                problemName = urlMatch[1].split('-').map(w =>
                    w.charAt(0).toUpperCase() + w.slice(1)
                ).join('');
            }
            problemNumber = '0'; // fallback
        }

        // Extract difficulty
        let difficulty = 'medium';
        const difficultyElement = document.querySelector('[diff]') ||
            document.querySelector('.text-difficulty-easy, .text-difficulty-medium, .text-difficulty-hard') ||
            document.querySelector('[class*="difficulty"]');

        if (difficultyElement) {
            const diffText = difficultyElement.textContent.toLowerCase();
            if (diffText.includes('easy')) difficulty = 'easy';
            else if (diffText.includes('hard')) difficulty = 'hard';
            else if (diffText.includes('medium')) difficulty = 'medium';
        }

        // Clean problem name - keep alphanumeric and basic characters
        const cleanName = problemName
            .replace(/[^a-zA-Z0-9\s-]/g, '')
            .replace(/\s+/g, '')
            .trim();

        return {
            number: problemNumber,
            name: cleanName || 'Problem',
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
        // Method 1: Try Monaco editor API
        if (window.monaco && window.monaco.editor) {
            const models = window.monaco.editor.getModels();
            if (models && models.length > 0) {
                // Get the first model (usually the main code editor)
                const code = models[0].getValue();
                if (code && code.trim().length > 0) {
                    console.log('Code extracted via Monaco API');
                    return code;
                }
            }
        }

        // Method 2: Extract from view lines (backup method)
        const viewLines = document.querySelectorAll('.view-line');
        if (viewLines.length > 0) {
            const lines = Array.from(viewLines).map(line => {
                // Get text content, preserving spacing
                const spans = line.querySelectorAll('span span');
                if (spans.length > 0) {
                    return Array.from(spans).map(span => span.textContent).join('');
                }
                return line.textContent;
            });
            const code = lines.join('\n');
            if (code && code.trim().length > 0) {
                console.log('Code extracted via view lines');
                return code;
            }
        }

        // Method 3: Look for textarea fallback
        const textarea = document.querySelector('textarea[autocomplete="off"]');
        if (textarea && textarea.value) {
            console.log('Code extracted via textarea');
            return textarea.value;
        }

        console.warn('Could not extract code from editor');
        return null;
    } catch (error) {
        console.error('Error extracting code:', error);
        return null;
    }
}

// Detect language from the editor
function detectLanguage() {
    try {
        // Find the language selector button
        const languageButton = document.querySelector('[id*="headlessui-listbox-button"]') ||
            document.querySelector('button[class*="rounded"]') ||
            document.querySelector('[class*="lang"]');

        if (languageButton) {
            const langText = languageButton.textContent.toLowerCase().trim();

            const languageMap = {
                'c++': 'cpp',
                'cpp': 'cpp',
                'c++14': 'cpp',
                'c++17': 'cpp',
                'c++20': 'cpp',
                'c++23': 'cpp',
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
                'oracle': 'sql',
                'postgresql': 'sql'
            };

            for (const [key, ext] of Object.entries(languageMap)) {
                if (langText.includes(key)) {
                    console.log('Detected language:', key, '-> extension:', ext);
                    return ext;
                }
            }
        }

        console.warn('Could not detect language, using default');
        return 'txt';
    } catch (error) {
        console.error('Error detecting language:', error);
        return 'txt';
    }
}

// Monitor for submit button clicks
function monitorSubmitButton() {
    const observer = new MutationObserver(() => {
        const submitButton = document.querySelector('button[data-e2e-locator="console-submit-button"]') ||
            Array.from(document.querySelectorAll('button')).find(btn =>
                btn.textContent.trim().toLowerCase() === 'submit'
            );

        if (submitButton && !submitButton.dataset.monitored) {
            submitButton.dataset.monitored = 'true';
            submitButton.addEventListener('click', () => {
                console.log('Submit button clicked - preparing to capture solution');
                isSubmitting = true;

                // Capture current state immediately
                const currentCode = extractCode();
                const currentLang = detectLanguage();
                const currentProblem = extractProblemInfo();

                if (currentCode && currentLang && currentProblem) {
                    sessionStorage.setItem('leetcode_pending_code', currentCode);
                    sessionStorage.setItem('leetcode_pending_language', currentLang);
                    sessionStorage.setItem('leetcode_pending_problem', JSON.stringify(currentProblem));
                    console.log('Captured submission data:', {
                        problem: currentProblem.fullTitle,
                        language: currentLang,
                        codeLength: currentCode.length
                    });
                }
            });
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Listen for successful submissions
function monitorSubmissions() {
    const observer = new MutationObserver((mutations) => {
        if (!isSubmitting) return;

        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) {
                    // Check for success indicators
                    const textContent = node.textContent || '';
                    const isAccepted = textContent.includes('Accepted') ||
                        node.querySelector('[class*="text-green"]')?.textContent?.includes('Accepted') ||
                        node.querySelector('[data-e2e-locator="submission-result"]')?.textContent?.includes('Accepted') ||
                        node.querySelector('[class*="success"]')?.textContent?.includes('Accepted');

                    if (isAccepted) {
                        console.log('✓ Accepted solution detected!');

                        // Wait for UI to stabilize, then process
                        setTimeout(() => {
                            const code = sessionStorage.getItem('leetcode_pending_code');
                            const language = sessionStorage.getItem('leetcode_pending_language');
                            const problemJson = sessionStorage.getItem('leetcode_pending_problem');

                            let problemInfo = null;
                            if (problemJson) {
                                try {
                                    problemInfo = JSON.parse(problemJson);
                                } catch (e) {
                                    console.error('Error parsing problem info:', e);
                                }
                            }

                            // Fallback to live extraction if needed
                            if (!problemInfo) {
                                problemInfo = extractProblemInfo();
                            }
                            if (!code) {
                                code = extractCode();
                            }
                            if (!language) {
                                language = detectLanguage();
                            }

                            if (problemInfo && code && language) {
                                const submissionData = {
                                    ...problemInfo,
                                    code: code,
                                    language: language,
                                    timestamp: new Date().toISOString()
                                };

                                // Check if this is a duplicate submission
                                const codeHash = btoa(unescape(encodeURIComponent(code))).slice(0, 50);
                                if (codeHash !== lastSubmittedCode) {
                                    lastSubmittedCode = codeHash;

                                    // Send to background script
                                    chrome.runtime.sendMessage({
                                        type: 'SOLUTION_SUBMITTED',
                                        data: submissionData
                                    }, (response) => {
                                        if (chrome.runtime.lastError) {
                                            console.error('Message error:', chrome.runtime.lastError);
                                        } else {
                                            console.log('Solution sent to background script successfully');
                                        }
                                    });

                                    console.log('📤 LeetCode solution captured:', {
                                        problem: submissionData.fullTitle,
                                        number: submissionData.number,
                                        difficulty: submissionData.difficulty,
                                        language: language,
                                        codeLength: code.length
                                    });
                                } else {
                                    console.log('Duplicate submission detected, skipping');
                                }

                                // Clear pending data
                                sessionStorage.removeItem('leetcode_pending_code');
                                sessionStorage.removeItem('leetcode_pending_language');
                                sessionStorage.removeItem('leetcode_pending_problem');
                            } else {
                                console.error('Missing data:', {
                                    hasProblemInfo: !!problemInfo,
                                    hasCode: !!code,
                                    hasLanguage: !!language
                                });
                            }

                            isSubmitting = false;
                        }, 2000);
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
    const currentProblem = extractProblemInfo();
    if (currentProblem) {
        console.log('🎯 LeetCode GitHub Sync: Monitoring problem', currentProblem.fullTitle);
    }
    monitorSubmitButton();
    monitorSubmissions();
}

// Wait for page to be fully loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    setTimeout(init, 1000);
}

// Re-initialize when navigating to a new problem (SPA behavior)
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        if (url.includes('/problems/')) {
            console.log('🔄 Problem page changed, reinitializing...');
            isSubmitting = false;
            lastSubmittedCode = null;
            setTimeout(init, 1500);
        }
    }
}).observe(document, { subtree: true, childList: true });