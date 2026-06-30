import 'dotenv/config';
import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'url';
import path from 'path';
import { startDeviceFlow, pollForToken } from './oauth.js';
import { syncScriptsToRepo, getUserOrgs } from './github.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));



let mainWindow;
let accessToken = null;

function createWindow()
{
    mainWindow = new BrowserWindow({
        width: 600,
        height: 1100,
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

// Renderer asks to start OAuth — we kick off the device flow
ipcMain.handle('oauth:start', async () =>
{
    const { userCode, verificationUri, deviceCode, interval, expiresIn } = await startDeviceFlow();
    // Return the user code + URL to the renderer so it can show the user
    return { userCode, verificationUri, deviceCode };
});

// Renderer asks to poll for the token after the user has authorized
ipcMain.handle('oauth:poll', async (_, deviceCode) =>
{
    accessToken = await pollForToken(deviceCode);
    return { success: !!accessToken };
});

ipcMain.handle('github:getorgs', async (_, deviceCode) =>
{
    const orgResp = await getUserOrgs({ token: accessToken });
    return orgResp;
});

// Renderer submits the form — run the main github sync
ipcMain.handle('github:sync', async (_, { accountName, crmOrgId, cookie, xZcsrfToken, userAgent, domain, org }) =>
{
    if (!accessToken)
    {
        return { success: false, error: 'Not authenticated' };
    }

    try
    {
        await syncScriptsToRepo({
            token: accessToken, accountName, crmOrgId, cookie, xZcsrfToken, userAgent, domain, org,
            webContents: mainWindow.webContents
        });
        return { success: true };
    }
    catch (err)
    {
        return { success: false, error: err.message };
    }
});
