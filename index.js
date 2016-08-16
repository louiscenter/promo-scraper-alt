var fs = require('fs')

const app = require('electron').app
const BrowserWindow = require('electron').BrowserWindow
const ipcMain = require('electron').ipcMain

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win

function createWindow () {
  // Create the browser window.
  win = new BrowserWindow({width: 960, height: 600})
  var contents = win.webContents

  // and load the index.html of the app.
  win.loadURL(`file://${__dirname}/index.html`)

  // Emitted when the window is closed.
  win.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    win = null
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createWindow()
  }
})

ipcMain.on('quit', function (event, arg) {
  app.quit()
})

ipcMain.on('get-user-info', function (event, user) {
  event.sender.send('get-user-info-reply', {
    username: process.argv[2],
    password: process.argv[3]
  })
})

// save to text
ipcMain.on('save-text', function (event, tweet) {
  fs.writeFile(tweet.filename + '.txt', tweet.text, (err) => {
    if (err) {
      throw err
    } else {
      console.log('Saved a text file!')
    }
  });
})

// save to PNG
ipcMain.on('save-image', function (event, tweet) {
  fs.writeFile(tweet.filename + '.png', tweet.image, (err) => {
    if (err) {
      throw err
    } else {
      console.log('Saved an image!')
    }
  });
})
