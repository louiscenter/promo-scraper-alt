const app = require('electron').app
const ipcRenderer = require('electron').ipcRenderer

const path = require('path')

const mapl = require('map-limit')
const jsdom = require('jsdom')
const dateFormat = require('dateformat')

onload = function () {
  const webview = document.getElementById('twitter')

  // get user login from main process
  var user = {}
  ipcRenderer.on('get-user-info-reply', function (event, arg) {
    user = arg
  })

  ipcRenderer.send('get-user-info', '')

  // login
  setTimeout(function () {
    var login = `
      document.getElementsByClassName('js-username-field')[0].value = '${ user.username }'
      document.getElementsByClassName('js-password-field')[0].value = '${ user.password }'
      document.querySelectorAll('input[name="remember_me"]')[1].checked = false
      document.querySelector('button[type="submit"]').click()
    `

    webview.executeJavaScript(login, false, function (result) {
      scroll()
    })
  }, 3000)

  // scroll to bottom 4 times
  var counter = 0;

  function scroll () {
    setTimeout(function () {
      if (counter < 4) {
        var scroll = 'window.scrollTo(0, 999999)'

        webview.executeJavaScript(scroll, false, function (result) {
          counter++
          scroll()
        })
      } else {
        var getTweets = `
          var promoted = document.getElementsByClassName('promoted-tweet')
          var position = window.scrollY

          var array = []
          for (var tweet of promoted) {
            var html = tweet.innerHTML
            var rect = tweet.getBoundingClientRect()

            array.push({
              html: html,
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height,
              position: position
            })
          }

          array
        `

        webview.executeJavaScript(getTweets, false, function (result) {
          var tweets = result

          if (tweets.length === 0) {
            app.quit()
          }
          mapl(tweets, 1, function(tweet, next) {
            scrape(tweet, next)
          }, function(err, results) {
            app.quit()
          })
        })
      }
    }, 3000)
  }

  // scrape information from promoted tweets
  function scrape (tweet, next) {
    jsdom.env(tweet.html, function (err, window) {
      if (err) {
        throw err
      } else {
        // extract username, url, text from HTML markup
        var username = window.document.getElementsByClassName('js-action-profile-name')[1].getElementsByTagName('b')[0].textContent
        var url = 'https://twitter.com' + window.document.getElementsByClassName('js-permalink')[0].href
        var text = window.document.getElementsByClassName('js-tweet-text')[0].textContent

        // compose timestamp (eg. 2016-12-25_09-00-05-175)
        var timestamp = dateFormat(new Date(), 'yyyy-mm-dd_HH-MM-ss-l')

        // compose filename
        var filename = path.resolve(__dirname, `${timestamp}_${username}`)

        // compose text file content
        var output = `Username: ${username}\n\nURL: ${url}\n\nTweet: ${text}`

        // export data
        saveText(filename, output)
        saveImage(filename, tweet, next)
      }
    })
  }

  // save to text file
  function saveText (filename, output) {
    ipcRenderer.send('save-text', {
      filename: filename,
      text: output
    })
  }

  // save to PNG
  function saveImage (filename, tweet, next) {
    var position
    if (tweet.y < 0) {
      position = (tweet.position - Math.abs(tweet.y))
    } else {
      position = (tweet.position + tweet.y)
    }

    var scrollTo = 'window.scrollTo(0, ' + (position - 48) + ')'

    webview.executeJavaScript(scrollTo, false, function (result) {
      webview.executeJavaScript('window.devicePixelRatio', false, function (result) {
        // get device pixel ratio for screenshot purposes
        var pixelRatio = Number(result)

        var rect = {
          x: 337 * pixelRatio,
          y: 48 * pixelRatio,
          width: tweet.width * pixelRatio,
          height: (tweet.height + 48) * pixelRatio
        }

        setTimeout(function () {
          webview.capturePage(rect, function (image) {
            next(null, 0)
            ipcRenderer.send('save-image', {
              filename: filename,
              image: image.toPNG()
            })
          })
        }, 3000)
      })
    })
  }
}
