// Background service worker for GitHub API interactions

const GITHUB_API_BASE = 'https://api.github.com';

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'SOLUTION_SUBMITTED') {
        handleSolutionSubmission(request.data);
    }
});

// Handle solution submission
async function handleSolutionSubmission(submissionData) {
    try {
        const { github_token, github_repo } = await chrome.storage.local.get([
            'github_token',
            'github_repo'
        ]);

        if (!github_token || !github_repo) {
            console.log('GitHub not configured. Solution stored locally.');
            storeSolutionLocally(submissionData);
            return;
        }

        // Ensure folders exist before syncing
        await ensureFoldersExist(github_token, github_repo);
        await syncToGitHub(submissionData, github_token, github_repo);
    } catch (error) {
        console.error('Error handling solution:', error);
        storeSolutionLocally(submissionData);
    }
}

// Store solution locally if GitHub sync fails
async function storeSolutionLocally(submissionData) {
    const { pending_syncs = [] } = await chrome.storage.local.get('pending_syncs');
    pending_syncs.push(submissionData);
    await chrome.storage.local.set({ pending_syncs });

    // Update badge to show pending syncs
    chrome.action.setBadgeText({ text: pending_syncs.length.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#1e3a8a' });
}

// Sync solution to GitHub
async function syncToGitHub(submissionData, token, repo) {
    const { number, name, difficulty, code, language } = submissionData;

    // Generate filename in format: ProblemNo-ProblemName.extension
    const sanitizedName = name.replace(/[^a-zA-Z0-9]/g, '-');
    const filename = `${number}-${sanitizedName}.${language}`;
    const path = `${difficulty}/${filename}`;

    // Add comment header to code with proper comment syntax
    const commentStart = getCommentSyntax(language);
    const header = `${commentStart.start}
 * Problem: ${submissionData.fullTitle}
 * Difficulty: ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
 * Date: ${new Date(submissionData.timestamp).toLocaleDateString()}
 ${commentStart.end}

`;
    const fullCode = header + code;

    try {
        // Check if file exists
        const checkUrl = `${GITHUB_API_BASE}/repos/${repo}/contents/${path}`;
        const checkResponse = await fetch(checkUrl, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        let sha = null;
        let isUpdate = false;
        if (checkResponse.ok) {
            const fileData = await checkResponse.json();
            sha = fileData.sha;
            isUpdate = true;
        }

        // Create or update file
        const updateUrl = `${GITHUB_API_BASE}/repos/${repo}/contents/${path}`;
        const message = isUpdate
            ? `Updated Code`
            : `Add solution: ${number} - ${submissionData.fullTitle}`;

        const response = await fetch(updateUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message,
                content: btoa(unescape(encodeURIComponent(fullCode))),
                sha: sha || undefined,
                branch: 'main'
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`GitHub API error: ${response.status} - ${errorData.message}`);
        }

        console.log('Solution synced successfully:', filename);

        // Update last sync time
        await chrome.storage.local.set({
            last_sync: new Date().toISOString(),
            last_synced_file: filename
        });

        // Show success notification
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: isUpdate ? 'Solution Updated' : 'Solution Synced',
            message: `${filename} ${isUpdate ? 'updated on' : 'synced to'} GitHub`
        });

        return true;
    } catch (error) {
        console.error('GitHub sync error:', error);
        await storeSolutionLocally(submissionData);
        
        // Show error notification
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Sync Failed',
            message: `Failed to sync ${filename}. Stored locally.`
        });
        
        return false;
    }
}

// Get comment syntax for different languages
function getCommentSyntax(extension) {
    const blockComment = {
        'cpp': { start: '/*', end: '*/' },
        'java': { start: '/*', end: '*/' },
        'c': { start: '/*', end: '*/' },
        'cs': { start: '/*', end: '*/' },
        'js': { start: '/*', end: '*/' },
        'ts': { start: '/*', end: '*/' },
        'go': { start: '/*', end: '*/' },
        'rs': { start: '/*', end: '*/' },
        'swift': { start: '/*', end: '*/' },
        'kt': { start: '/*', end: '*/' },
        'scala': { start: '/*', end: '*/' },
        'php': { start: '/*', end: '*/' },
    };

    const lineComment = {
        'py': { start: '"""', end: '"""' },
        'rb': { start: '=begin', end: '=end' },
        'sql': { start: '/*', end: '*/' },
    };

    return blockComment[extension] || lineComment[extension] || { start: '/*', end: '*/' };
}

// Ensure folders exist in the repository
async function ensureFoldersExist(token, repo) {
    const folders = ['easy', 'medium', 'hard'];

    for (const folder of folders) {
        try {
            const url = `${GITHUB_API_BASE}/repos/${repo}/contents/${folder}`;
            const checkResponse = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!checkResponse.ok) {
                // Create folder with README
                const readmeUrl = `${GITHUB_API_BASE}/repos/${repo}/contents/${folder}/README.md`;
                const content = `# ${folder.charAt(0).toUpperCase() + folder.slice(1)} Problems

This folder contains LeetCode problems of ${folder} difficulty.`;

                await fetch(readmeUrl, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message: `Create ${folder} folder`,
                        content: btoa(content),
                        branch: 'main'
                    })
                });
                
                console.log(`Created ${folder} folder`);
            }
        } catch (error) {
            console.error(`Error ensuring ${folder} folder exists:`, error);
        }
    }
}

// Initialize folders when GitHub is connected
chrome.storage.onChanged.addListener(async (changes, namespace) => {
    if (namespace === 'local') {
        // Check if both token and repo are now available
        if (changes.github_token || changes.github_repo) {
            const { github_token, github_repo } = await chrome.storage.local.get([
                'github_token',
                'github_repo'
            ]);
            
            if (github_token && github_repo) {
                console.log('GitHub configured, creating folders...');
                await ensureFoldersExist(github_token, github_repo);
            }
        }
    }
});