import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'url';
import path from 'path';
import { startDeviceFlow, pollForToken } from './oauth.js';
import { syncScriptsToRepo } from './github.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow;
let accessToken = null;

function createWindow()
{
    mainWindow = new BrowserWindow({
        width: 600,
        height: 500,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () =>
{
    if (process.platform !== 'darwin') app.quit();
});

// Step 1: Renderer asks to start OAuth — we kick off the device flow
ipcMain.handle('oauth:start', async () =>
{
    const { userCode, verificationUri, deviceCode, interval, expiresIn } = await startDeviceFlow();
    // Return the user code + URL to the renderer so it can show the user
    return { userCode, verificationUri };
});

// Step 2: Renderer asks to poll for the token after the user has authorized
ipcMain.handle('oauth:poll', async (_, deviceCode) =>
{
    accessToken = await pollForToken(deviceCode);
    return { success: !!accessToken };
});

// Step 3: Renderer submits the form — run the main github sync
ipcMain.handle('github:sync', async (_, { repoName, accountName }) =>
{
    if (!accessToken)
    {
        return { success: false, error: 'Not authenticated' };
    }

    try
    {
        await syncScriptsToRepo({ repoName, accountName, token: accessToken });
        return { success: true };
    }
    catch (err)
    {
        return { success: false, error: err.message };
    }
});
