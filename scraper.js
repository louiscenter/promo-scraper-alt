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
        var scrollTo = 'window.scrollTo(0, 999999)'

        webview.executeJavaScript(scrollTo, false, function (result) {
          counter++
          scroll()
        })
      } else {
        var getTweets = `
          var array = []
          var promoted = document.getElementsByClassName('promoted-tweet')

          for (var tweet of promoted) {
            array.push(tweet)
          }

          array
        `

        webview.executeJavaScript(getTweets, false, function (result) {
          var tweets = result

          if (tweets.length === 0) {
            ipcRenderer.send('quit', '')
          } else {
            var counter = 0
            mapl(tweets, 1, function(tweet, next) {
              var query = `document.getElementsByClassName('promoted-tweet')[${ counter }].innerHTML`

              webview.executeJavaScript(query, false, function (result) {
                jsdom.env(result, function (err, window) {
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

                    // export text file
                    ipcRenderer.send('save-text', {
                      filename: filename,
                      text: output
                    })

                    var query = `
                      var bound = document.getElementsByClassName('promoted-tweet')[${ counter }].getBoundingClientRect()
                      var rect = {
                        y: bound.top,
                        width: bound.width,
                        height: bound.height
                      }
                      var y = window.scrollY

                      var array = [rect, y]
                      array
                    `

                    webview.executeJavaScript(query, false, function (result) {

                      var tweet = {
                        y: result[0].y,
                        width: result[0].width,
                        height: result[0].height
                      }

                      var position = result[1] + tweet.y
                      var query = `window.scrollTo(0, ${ position - 48 })`

                      webview.executeJavaScript(query, false, function (result) {
                        webview.executeJavaScript('window.devicePixelRatio', false, function (result) {
                          // get device pixel ratio for screenshot purposes
                          var pixelRatio = Number(result)

                          var rect = {
                            x: 337 * pixelRatio,
                            y: 48 * pixelRatio,
                            width: tweet.width * pixelRatio,
                            height: tweet.height * pixelRatio
                          }

                          setTimeout(function () {
                            webview.capturePage(rect, function (image) {
                              counter++
                              next(null, 0)
                              ipcRenderer.send('save-image', {
                                filename: filename,
                                image: image.toPNG()
                              })
                            })
                          }, 2000)
                        })
                      })
                    })
                  }
                })
              })
            }, function(err, results) {
              setTimeout(function () {
                ipcRenderer.send('quit', '')
              }, 5000)
            })
          }
        })
      }
    }, 3000)
  }
}
