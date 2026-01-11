// Background service worker - DEBUG VERSION

const GITHUB_API_BASE = 'https://api.github.com';

console.log('🚀 Background service worker started');

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 Message received:', request.type);

    if (request.type === 'SOLUTION_SUBMITTED') {
        console.log('📦 Solution data received:', request.data);
        handleSolutionSubmission(request.data);
        sendResponse({ status: 'received' });
    }

    return true; // Keep channel open for async response
});

// Handle solution submission
async function handleSolutionSubmission(submissionData) {
    console.log('🔄 Processing solution submission...');

    try {
        const { github_token, github_repo } = await chrome.storage.local.get([
            'github_token',
            'github_repo'
        ]);

        console.log('🔑 GitHub config:', {
            hasToken: !!github_token,
            hasRepo: !!github_repo,
            repo: github_repo
        });

        if (!github_token || !github_repo) {
            console.warn('⚠️ GitHub not configured. Storing locally.');
            await storeSolutionLocally(submissionData);
            return;
        }

        // Ensure folders exist
        console.log('📁 Ensuring folders exist...');
        await ensureFoldersExist(github_token, github_repo);

        // Sync to GitHub
        console.log('🔄 Syncing to GitHub...');
        await syncToGitHub(submissionData, github_token, github_repo);

    } catch (error) {
        console.error('❌ Error handling solution:', error);
        await storeSolutionLocally(submissionData);
    }
}

// Store solution locally
async function storeSolutionLocally(submissionData) {
    console.log('💾 Storing solution locally...');
    const { pending_syncs = [] } = await chrome.storage.local.get('pending_syncs');
    pending_syncs.push(submissionData);
    await chrome.storage.local.set({ pending_syncs });
    console.log('✅ Stored locally. Pending syncs:', pending_syncs.length);

    // Update badge
    chrome.action.setBadgeText({ text: pending_syncs.length.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#1e3a8a' });
}

// Sync solution to GitHub
async function syncToGitHub(submissionData, token, repo) {
    const { number, name, difficulty, code, language } = submissionData;

    console.log('📝 Preparing file:', {
        number,
        name,
        difficulty,
        language
    });

    // Generate filename: ProblemNo-ProblemName.extension
    const sanitizedName = name.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-');
    const filename = `${number}-${sanitizedName}.${language}`;
    const path = `${difficulty}/${filename}`;

    console.log('📄 Generated path:', path);

    // Add comment header
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
        console.log('🔍 Checking if file exists...');
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
            console.log('📝 File exists, will update. SHA:', sha);
        } else {
            console.log('📄 File does not exist, will create new');
        }

        // Create or update file
        const updateUrl = `${GITHUB_API_BASE}/repos/${repo}/contents/${path}`;
        const message = isUpdate
            ? `Updated Code`
            : `Add solution: ${number} - ${submissionData.fullTitle}`;

        console.log('📤 Commit message:', message);
        console.log('🚀 Sending to GitHub...');

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

        console.log('📡 Response status:', response.status);

        if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ GitHub API error:', errorData);
            throw new Error(`GitHub API error: ${response.status} - ${errorData.message}`);
        }

        const responseData = await response.json();
        console.log('✅ GitHub response:', responseData);

        // Update storage
        await chrome.storage.local.set({
            last_sync: new Date().toISOString(),
            last_synced_file: filename
        });

        // Show notification
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: isUpdate ? 'Solution Updated' : 'Solution Synced',
            message: `${filename} ${isUpdate ? 'updated on' : 'synced to'} GitHub`,
            priority: 2
        });

        console.log('🎉 Sync completed successfully!');
        return true;

    } catch (error) {
        console.error('❌ GitHub sync error:', error);
        await storeSolutionLocally(submissionData);

        // Show error notification
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Sync Failed',
            message: `Failed to sync ${filename}. Stored locally.`,
            priority: 2
        });

        return false;
    }
}

// Get comment syntax for language
function getCommentSyntax(extension) {
    const syntaxMap = {
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
        'py': { start: '"""', end: '"""' },
        'rb': { start: '=begin', end: '=end' },
        'sql': { start: '/*', end: '*/' },
    };

    return syntaxMap[extension] || { start: '/*', end: '*/' };
}

// Ensure folders exist
async function ensureFoldersExist(token, repo) {
    console.log('📁 Checking/creating difficulty folders...');
    const folders = ['easy', 'medium', 'hard'];

    for (const folder of folders) {
        try {
            console.log(`📂 Checking ${folder} folder...`);
            const url = `${GITHUB_API_BASE}/repos/${repo}/contents/${folder}`;
            const checkResponse = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (checkResponse.ok) {
                console.log(`✅ ${folder} folder exists`);
            } else {
                console.log(`📝 Creating ${folder} folder...`);
                const readmeUrl = `${GITHUB_API_BASE}/repos/${repo}/contents/${folder}/README.md`;
                const content = `# ${folder.charAt(0).toUpperCase() + folder.slice(1)} Problems

This folder contains LeetCode problems of ${folder} difficulty.`;

                const createResponse = await fetch(readmeUrl, {
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

                if (createResponse.ok) {
                    console.log(`✅ Created ${folder} folder`);
                } else {
                    const errorData = await createResponse.json();
                    console.error(`❌ Failed to create ${folder} folder:`, errorData);
                }
            }
        } catch (error) {
            console.error(`❌ Error with ${folder} folder:`, error);
        }
    }
    console.log('✅ Folder check complete');
}

// Listen for storage changes
chrome.storage.onChanged.addListener(async (changes, namespace) => {
    if (namespace === 'local') {
        console.log('🔄 Storage changed:', Object.keys(changes));

        if (changes.github_token || changes.github_repo) {
            const { github_token, github_repo } = await chrome.storage.local.get([
                'github_token',
                'github_repo'
            ]);

            if (github_token && github_repo) {
                console.log('🔑 GitHub credentials detected, setting up folders...');
                await ensureFoldersExist(github_token, github_repo);
            }
        }
    }
});

console.log('✅ Background script ready and listening');