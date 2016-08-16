const app = require('electron').app
const ipcRenderer = require('electron').ipcRenderer

const path = require('path')

const mapl = require('map-limit')
const jsdom = require('jsdom')
const dateFormat = require('dateformat')

onload = function () {
  // webview element
  const webview = document.getElementById('twitter')

  // get user login from main process
  var user = {}
  ipcRenderer.on('get-user-info-reply', function (event, arg) {
    user = arg
  })

  ipcRenderer.send('get-user-info', '')

  // login after 3 seconds
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

  // scroll to bottom 4 times @ intervals of 3 seconds
  var scrollCounter = 0;

  function scroll () {
    setTimeout(function () {
      if (scrollCounter < 4) {
        var scrollTo = 'window.scrollTo(0, 999999)'

        webview.executeJavaScript(scrollTo, false, function (result) {
          scrollCounter++
          scroll()
        })
      } else {
        // start scraping
        var getTweets = `
          var array = []
          var promoted = document.getElementsByClassName('promoted-tweet')

          for (var tweet of promoted) {
            array.push(tweet)
          }

          array
        `

        // query DOM for all promoted tweets
        webview.executeJavaScript(getTweets, false, function (result) {
          var ads = result

          // quit if there are no promoted tweets
          if (ads.length === 0) {
            ipcRenderer.send('quit', '')
          } else {
            // iterate through promoted tweets one at a time
            var tweetCounter = 0

            mapl(ads, 1, function(tweet, next) {
              // convert innerHTML of promoted tweet to DOM
              var query = `document.getElementsByClassName('promoted-tweet')[${ tweetCounter }].innerHTML`
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

                    // get bounds of promoted tweet for screenshot
                    var query = `
                      var bound = document.getElementsByClassName('promoted-tweet')[${ tweetCounter }].getBoundingClientRect()
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
                      var ad = {
                        y: result[0].y,
                        width: result[0].width,
                        height: result[0].height
                      }

                      var y = {
                        viewport: result[1],
                        ad: result[1] + ad.y
                      }

                      // scroll to ad
                      var query = `window.scrollTo(0, ${ y.ad - 48 })`

                      webview.executeJavaScript(query, false, function (result) {
                        // get device pixel ratio for screenshot purposes
                        var query = 'window.devicePixelRatio'

                        webview.executeJavaScript(query, false, function (result) {
                          var pixelRatio = Number(result)

                          // create bound rect for screenshot
                          var rect = {
                            x: 337 * pixelRatio,
                            y: 48 * pixelRatio,
                            width: tweet.width * pixelRatio,
                            height: tweet.height * pixelRatio
                          }

                          // screenshot ad after 2 seconds
                          setTimeout(function () {
                            webview.capturePage(rect, function (image) {
                              // move onto next ad
                              tweetCounter++
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
              // quit after all ads are saved
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
