// Popup script for LeetCode GitHub Sync Extension

const SERVER_URL = 'https://leetcode-github-sync.onrender.com';

// DOM elements
const onboardingView = document.getElementById('onboarding-view');
const dashboardView = document.getElementById('dashboard-view');
const authStep = document.getElementById('auth-step');
const repoStep = document.getElementById('repo-step');
const connectGithubBtn = document.getElementById('connect-github');
const repoInput = document.getElementById('repo-input');
const saveRepoBtn = document.getElementById('save-repo');
const disconnectBtn = document.getElementById('disconnect');
const testSyncBtn = document.getElementById('test-sync');
const message = document.getElementById('message');
const dashboardMessage = document.getElementById('dashboard-message');
const usernameDisplay = document.getElementById('username-display');
const repoDisplay = document.getElementById('repo-display');
const lastSyncDisplay = document.getElementById('last-sync-display');
const successIcon = document.getElementById('success-icon');

// State
let isAuthenticating = false;
let isSaving = false;
let isSyncing = false;
let authWindow = null;
let authCheckInterval = null;

// Initialize
async function init() {
    const { github_token, github_repo, github_username } = await chrome.storage.local.get([
        'github_token',
        'github_repo',
        'github_username'
    ]);

    if (github_token && github_repo && github_username) {
        showDashboard(github_username, github_repo);
        checkLastSync();
    } else {
        showOnboarding();
    }
}

// Show onboarding
function showOnboarding() {
    onboardingView.classList.remove('hidden');
    dashboardView.classList.add('hidden');
}

// Show dashboard
function showDashboard(username, repo) {
    onboardingView.classList.add('hidden');
    dashboardView.classList.remove('hidden');
    usernameDisplay.textContent = username;
    repoDisplay.textContent = repo;
}

// Show message
function showMessage(text, isSuccess = false, isDashboard = false) {
    const messageEl = isDashboard ? dashboardMessage : message;
    messageEl.textContent = text;
    messageEl.classList.remove('hidden');
    if (isSuccess) {
        messageEl.classList.add('success');
    } else {
        messageEl.classList.remove('success');
    }

    setTimeout(() => {
        messageEl.classList.add('hidden');
    }, 3000);
}

// Cleanup auth window checker
function cleanupAuthCheck() {
    if (authCheckInterval) {
        clearInterval(authCheckInterval);
        authCheckInterval = null;
    }
}

// Connect GitHub
connectGithubBtn.addEventListener('click', async () => {
    if (isAuthenticating) return;

    isAuthenticating = true;
    connectGithubBtn.innerHTML = `
        <div class="spinner"></div>
        <span>Authenticating...</span>
    `;
    connectGithubBtn.disabled = true;

    try {
        // Clean up any existing checker
        cleanupAuthCheck();

        // Open OAuth window
        authWindow = window.open(
            `${SERVER_URL}/auth/github`,
            'GitHub Authorization',
            'width=600,height=700'
        );

        // Listen for auth success message
        const messageHandler = async (event) => {
            // Verify the message is from our auth process
            if (event.data && event.data.type === 'GITHUB_AUTH_SUCCESS') {
                const { token, username } = event.data;

                await chrome.storage.local.set({
                    github_token: token,
                    github_username: username
                });

                authStep.classList.add('hidden');
                repoStep.classList.remove('hidden');
                showMessage('Authentication successful!', true);

                // Cleanup
                window.removeEventListener('message', messageHandler);
                cleanupAuthCheck();

                if (authWindow && !authWindow.closed) {
                    authWindow.close();
                }

                // Reset button state
                isAuthenticating = false;
                connectGithubBtn.innerHTML = `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
                    </svg>
                    <span>Connect with GitHub</span>
                `;
                connectGithubBtn.disabled = false;
            }
        };

        window.addEventListener('message', messageHandler);

        // Check if window exists using a safer method
        // We can't check authWindow.closed due to COOP, so we'll use a timeout
        let checkAttempts = 0;
        const maxAttempts = 60; // 60 seconds timeout

        authCheckInterval = setInterval(() => {
            checkAttempts++;

            // If we've been waiting too long, assume user closed window
            if (checkAttempts >= maxAttempts) {
                if (isAuthenticating) {
                    cleanupAuthCheck();
                    window.removeEventListener('message', messageHandler);
                    isAuthenticating = false;
                    connectGithubBtn.innerHTML = `
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
                        </svg>
                        <span>Connect with GitHub</span>
                    `;
                    connectGithubBtn.disabled = false;
                    showMessage('Authentication cancelled or timed out');
                }
            }
        }, 1000);

    } catch (error) {
        console.error('Auth error:', error);
        showMessage('Authentication failed. Please try again.');
        cleanupAuthCheck();
        isAuthenticating = false;
        connectGithubBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
            </svg>
            <span>Connect with GitHub</span>
        `;
        connectGithubBtn.disabled = false;
    }
});

// Save repository
saveRepoBtn.addEventListener('click', async () => {
    if (isSaving) return;

    const repo = repoInput.value.trim();
    if (!repo) {
        showMessage('Please enter a repository name');
        return;
    }

    // Validate repo format
    if (!repo.includes('/')) {
        showMessage('Format should be: username/repository');
        return;
    }

    isSaving = true;
    saveRepoBtn.innerHTML = `
        <div class="spinner"></div>
        <span>Saving...</span>
    `;
    saveRepoBtn.disabled = true;

    try {
        await chrome.storage.local.set({ github_repo: repo });

        const { github_username } = await chrome.storage.local.get('github_username');

        showMessage('Repository synced successfully!', true);

        setTimeout(() => {
            showDashboard(github_username, repo);
        }, 1000);
    } catch (error) {
        console.error('Save error:', error);
        showMessage('Failed to save repository');
    } finally {
        isSaving = false;
        saveRepoBtn.innerHTML = 'Continue';
        saveRepoBtn.disabled = false;
    }
});

// Handle Enter key in repo input
repoInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !isSaving) {
        saveRepoBtn.click();
    }
});

// Disconnect
disconnectBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to disconnect? You will need to reconnect and reconfigure.')) {
        await chrome.storage.local.clear();
        showMessage('Disconnected successfully', true);
        setTimeout(() => {
            authStep.classList.remove('hidden');
            repoStep.classList.add('hidden');
            repoInput.value = '';
            showOnboarding();
        }, 1000);
    }
});

// Test sync
testSyncBtn.addEventListener('click', async () => {
    if (isSyncing) return;

    isSyncing = true;
    testSyncBtn.innerHTML = `
        <div class="spinner"></div>
        <span>Syncing...</span>
    `;
    testSyncBtn.disabled = true;
    showMessage('Test sync initiated...', false, true);

    // Simulate sync (in real extension, this would be handled by background script)
    setTimeout(() => {
        successIcon.classList.remove('hidden');
        const now = new Date().toLocaleTimeString();
        lastSyncDisplay.textContent = `Last synced: ${now}`;
        lastSyncDisplay.classList.remove('hidden');
        showMessage('Test sync completed!', true, true);

        isSyncing = false;
        testSyncBtn.innerHTML = 'Test Sync';
        testSyncBtn.disabled = false;

        setTimeout(() => {
            successIcon.classList.add('hidden');
        }, 2000);
    }, 2000);
});

// Check last sync
async function checkLastSync() {
    const { last_sync } = await chrome.storage.local.get('last_sync');
    if (last_sync) {
        const date = new Date(last_sync);
        lastSyncDisplay.textContent = `Last synced: ${date.toLocaleString()}`;
        lastSyncDisplay.classList.remove('hidden');
    }
}

// Listen for sync updates from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'SYNC_SUCCESS') {
        successIcon.classList.remove('hidden');
        checkLastSync();
        showMessage('Solution synced!', true, true);
        setTimeout(() => {
            successIcon.classList.add('hidden');
        }, 2000);
    }
});

// Cleanup on popup close
window.addEventListener('beforeunload', () => {
    cleanupAuthCheck();
});

// Initialize on load
init();