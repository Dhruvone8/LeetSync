// Background service worker for GitHub API interactions

const GITHUB_API_BASE = 'https://api.github.com';
let syncQueue = [];

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

    // Generate filename
    const filename = `${number}-${name}.${language}`;
    const path = `${difficulty}/${filename}`;

    // Add comment header to code
    const header = `/*
 * Problem: ${submissionData.fullTitle}
 * Difficulty: ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
 * Date: ${new Date(submissionData.timestamp).toLocaleDateString()}
 */

`;
    const fullCode = header + code;

    try {
        // Check if file exists
        const checkUrl = `${GITHUB_API_BASE}/repos/${repo}/contents/${path}`;
        const checkResponse = await fetch(checkUrl, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        let sha = null;
        if (checkResponse.ok) {
            const fileData = await checkResponse.json();
            sha = fileData.sha;
        }

        // Create or update file
        const updateUrl = `${GITHUB_API_BASE}/repos/${repo}/contents/${path}`;
        const message = sha
            ? `Update solution: ${filename}`
            : `Add solution: ${filename}`;

        const response = await fetch(updateUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
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
            throw new Error(`GitHub API error: ${response.status}`);
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
            title: 'Solution Synced',
            message: `${filename} synced to GitHub`
        });

        return true;
    } catch (error) {
        console.error('GitHub sync error:', error);
        await storeSolutionLocally(submissionData);
        return false;
    }
}

// Ensure folders exist in the repository
async function ensureFoldersExist(token, repo) {
    const folders = ['easy', 'medium', 'hard'];

    for (const folder of folders) {
        try {
            const url = `${GITHUB_API_BASE}/repos/${repo}/contents/${folder}/README.md`;
            const checkResponse = await fetch(url, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!checkResponse.ok) {
                // Create folder with README
                const content = `# ${folder.charAt(0).toUpperCase() + folder.slice(1)} Problems

This folder contains LeetCode problems of ${folder} difficulty.`;

                await fetch(url, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `token ${token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message: `Create ${folder} folder`,
                        content: btoa(content),
                        branch: 'main'
                    })
                });
            }
        } catch (error) {
            console.error(`Error ensuring ${folder} folder exists:`, error);
        }
    }
}

// Initialize folders when GitHub is connected
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.github_token && changes.github_repo) {
        const token = changes.github_token.newValue;
        const repo = changes.github_repo.newValue;
        if (token && repo) {
            ensureFoldersExist(token, repo);
        }
    }
});