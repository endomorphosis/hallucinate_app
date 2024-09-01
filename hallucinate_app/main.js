import Main from "electron/main";

export const createWindow = () => {
    // Create the browser window.
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            preload: path.join(__dirname, "./node/main.js"),
        },
    });
    
    // and load the index.html of the app.
    mainWindow.loadFile("index.html");

    mainWindow.whenReady().then(() => {
        mainWindow.on("activate", () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow();
                mainWindow.webContents.on("did-finish-load", () => {
                    mainWindow.webContents.send("ping", "whoooooooh!");
                });

                mainWindow.addEventListener('DOMContentLoaded', () => {
                    const replaceText = (selector, text) => {
                        const element = document.getElementById(selector)
                        if (element) element.innerText = text
                    }

                    for (const dependency of ['chrome', 'node', 'electron']) {
                        replaceText(`${dependency}-version`, process.versions[dependency])
                    }

                })

            }
        })

    });

    mainWindow.on("window-all-closed", () => {
        if (process.platform !== "darwin") {
            app.quit();
        }
    })

    // Open the DevTools.
    mainWindow.webContents.openDevTools();
    
    // Emitted when the window is closed.
    mainWindow.on("closed", () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        mainWindow = null;
    });


}

