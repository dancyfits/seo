// load in the required modules
const cheerio       = require('cheerio')
const url           = require('url')
const S             = require('string')
const async         = require('async')
const request       = require('request')
const _             = require('underscore')
const xml2js        = require('xml2js');

// returns the sitemap txt based on the payload
var getSitemapContent = function(payload, options, fn) {

  // get the data
  var data      = payload.getData();

  // is sitemap defined ... ?
  if(data.testingSitemap) return fn(null, data.testingSitemapResponse, data.testingSitemap);

  // do the actual request
  payload.doRequest({
    
    type:     'GET',
    url:      options.url,
    session:  data.session
    
  }, function(err, response, body) {

    // check for a error
    if(err) {

      // output
      payload.error('Problem downloading the website sitemap.xml', err);

      // return error
      return fn(null, response, '');

    }

    // check if the response is 200
    if((response || {}).statusCode !== 200) {

      // debug
      payload.debug('The response code from the sitemap.xml given was ' + ((response || {}).statusCode || 200));

      // nope out of there
      return fn(null, response, '');

    }

    // done
    setImmediate(fn, null, response, body || '');

  })

};

// expose the items
module.exports = exports = function(payload, fn) {

  // start tracking
  payload.start('sitemap');

  // get the data
  var data    = payload.getData()

  // go get the sitemap file
  var uri     = url.parse(data.url);

  // create the actual target
  var href    = url.format( _.extend({}, uri, {

    pathname:     '/sitemap.xml',
    search:       ''

  }) );

  // list of known properties
  const knownProperties = [

    'loc',
    'lastmod',
    'changefreq',
    'priority'

  ];

  // list of required properties
  const requiredProperties = [

    'loc'

  ];

  // the subject address
  const subjectAddress = {

    key:      'seo',
    rule:     'sitemap',
    subject:  href

  };

  // check if not checked already for this site
  payload.isMentioned(subjectAddress, function(err, isMentioned) {

    // check for a error
    if(err) {

      // output to log
      payload.error('Problem checking the sitemap txt', err);

      // finish
      return fn(null);

    }

    // is sitemap not empty
    if(isMentioned === true) {

      // done
      return fn(null);

    }

    // else mention and do the check
    payload.mention(subjectAddress, function() {

      // get the sitemap from site
      getSitemapContent(payload, {

        method:   'GET',
        type:     'GET',
        url:      href,
        timeout:  5 * 1000

      }, function(err, response, sitemapTxt) {

        // check for a error
        if(err) {

          // output to log
          payload.error('Problem checking the sitemap txt', err);

          // finish
          return fn(null);

        }

        // is sitemap not empty
        if(S(sitemapTxt).isEmpty() === true) {

          // done
          return fn(null);

        }

        // check if the server handled the error
        if((response || {}).statusCode !== 200) {

          // all good
          return fn(null);

        }

        // then we check the content of the sitemap
        var contentType = S( ((response || {}).headers || {})['content-type'] || '' ).trim().s.toLowerCase();

        // split the sitemap lines
        var lines = (sitemapTxt || '').split('\n');

        // did we find the content type ?
        if(contentType.indexOf('application/xml') === -1 && 
            contentType.indexOf('text/xml') === -1) {

          // bad return format ...
          payload.addRule({

            type:         'error',
            key:          'sitemap.format',
            message:      'Defined Sitemap must return XML'

          }, {

            message:      'The sitemap at $, returned $ instead of XML',
            display:      'code',
            identifiers:  [ href, contentType ],
            code:         {

              text:     lines.slice(0, 5),
              start:    0,
              end:      lines.slice(0, 5).length + 1,
              subject:  0

            }

          });

          // done
          return fn(null);

        }

        // else we try to parse the response
        xml2js.parseString(sitemapTxt, function (err, result) {

          // generic details of the rule itself, 
          // occurrences give more details to the rule itself
          const rulePrologMeta = {

            key:      'sitemap.prolog',
            message:  'Missing or misconfigured prolog defined for sitemap',
            type:     'error'

          };

          // gets the first line of the file
          var firstLine = S(S(sitemapTxt).trim().s.toLowerCase().split('\n')[0] || '').trim().s;

          // the file must start with the encoding
          if( firstLine.startsWith('<?xml') === false ) {

            // add the occurence
            payload.addRule(rulePrologMeta, {

              message:      'Sitemap must start with $ as part of $',
              identifiers:  [ '<?xml', '<?xml version="1.0" encoding="UTF-8" ?>' ],
              file:         href,
              display:      'code',
              code:         {

                text:       lines.slice(0, 10),
                start:      0,
                end:        lines.slice(0, 10).length + 1,
                subject:    0

              }

            });

          }

          // the file must start with the encoding
          if( firstLine.indexOf('version="1.0"') === -1 ) {

            // add the occurence
            payload.addRule(rulePrologMeta, {

              message:      'Sitemap prolog must contain $ somewhere between $ and $ on the first line',
              identifiers:  [ 'version="1.0"', '<?xml', '?>' ],
              file:         href,
              display:      'code',
              code:         {

                text:       lines.slice(0, 10),
                start:      0,
                end:        lines.slice(0, 10).length + 1,
                subject:    0

              }

            });

          }

          // the file must start with the encoding
          if( firstLine.indexOf('encoding="') === -1 ) {

            // add the occurence
            payload.addRule(rulePrologMeta, {

              message:      'Sitemap prolog must contain the encoding (like $) somewhere between $ and $ on the first line',
              identifiers:  [ 'encoding="UTF-8"', '<?xml', '?>' ],
              file:         href,
              display:      'code',
              code:         {

                text:       lines.slice(0, 10),
                start:      0,
                end:        lines.slice(0, 10).length + 1,
                subject:    0

              }

            });

          }

          // prolog must end with ?>
          if( S(firstLine).endsWith('?>') === false ) {

            // add the occurence
            payload.addRule(rulePrologMeta, {

              message:      'Sitemap prolog have $ as a closing tag',
              identifiers:  [ '?>' ],
              file:         href,
              display:      'code',
              code:         {

                text:       lines.slice(0, 10),
                start:      0,
                end:        lines.slice(0, 10).length + 1,
                subject:    0

              }

            });

          }

          // we got a error O_O, so this was not valid XML ...
          if(err) {

            // register that we are unable to parse this XML ...
            payload.addRule({

              type:         'critical',
              key:          'sitemap.invalid',
              message:      'Unable to parse defined sitemap'

            }, {

              message:      'Unable to parse the sitemap at $ as XML, indicating invalid XML',
              file:         href,
              display:      'code',
              identifiers:  [ href, contentType ],
              code:         {

                text:     lines.slice(0, 20),
                start:    0,
                end:      lines.slice(0, 20).length + 1,
                subject:  0

              }

            });

            // done
            return fn(null);

          }

          // check if blank ... ?
          if(result === null || 
              result === undefined || 
                S(sitemapTxt).isEmpty() === true) {

            // add the rule
            payload.addRule({

              key:          'sitemap.empty',
              message:      'Defined sitemap was empty',
              type:         'error'

            }, {

              message:      'Sitemap at $ should have some content',
              identifiers:  [ '/sitemap.xml' ],
              file:         href,
              display:      'code',
              code:         {

                text:       lines.slice(0, 10),
                start:      0,
                end:        lines.slice(0, 10).length + 1,
                subject:    0

              }

            });

            // stop here then 
            return fn(null);

          }

          // get the keys of the root
          var rootKeys = _.keys(result);

          // constant meta for the schema output
          const ruleSchemaMeta = {

            key:          'sitemap.schema',
            message:      'Defined sitemap contains incorrect schema',
            type:         'error'

          };

          // there should only be one key ...
          if(rootKeys.length !== 1 || 
            (rootKeys[0] || '').toLowerCase() != 'urlset') {

              // add the rule
              payload.addRule(ruleSchemaMeta, {

                message:      'Sitemap should contain only one root node of $',
                identifiers:  [ '<urlset>' ],
                file:         href,
                display:      'code',
                code:         {

                  text:       lines.slice(0, 10),
                  start:      0,
                  end:        lines.slice(0, 10).length + 1,
                  subject:    0

                }

              });

          }

          // end tracking
          payload.end('sitemap');

          // done
          setImmediate(fn, null);

        });

      });

    });

  });

};
