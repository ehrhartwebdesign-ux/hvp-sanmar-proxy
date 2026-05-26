/**
 * HVP SanMar Proxy Server v4
 * Per SanMar Web Services Integration Guide v24.3
 *
 * CREDENTIAL NOTES:
 * - This proxy uses your sanmar.com USERNAME + PASSWORD (web services)
 * - FTP credentials are DIFFERENT - not used here
 * - Web services must be enabled: email sanmarintegrations@sanmar.com
 */

'use strict';

const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');
const xml2js  = require('xml2js');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Always return JSON, never crash the process
process.on('unhandledRejection', function(reason) {
  console.error('Unhandled rejection:', reason);
});
process.on('uncaughtException', function(err) {
  console.error('Uncaught exception:', err);
});

// ── SanMar endpoints ──
const PS_PRODUCT  = 'https://ws.sanmar.com:8080/promostandards/ProductDataServiceBindingV2';
const SM_PRICING  = 'https://ws.sanmar.com:8080/SanMarWebService/SanMarPricingServicePort';
const SM_IMG_BASE = 'https://cdnl.sanmar.com/catalog/images/imglib/mresjpg/';

// ─────────────────────────────────────
// HEALTH / PING
// ─────────────────────────────────────
app.get('/', function(req, res) {
  res.json({ status: 'ok', service: 'HVP SanMar Proxy', version: '4.0.0' });
});

// Render free tier keep-alive ping
app.get('/ping', function(req, res) {
  res.json({ pong: true, time: new Date().toISOString() });
});

// ─────────────────────────────────────
// TEST CREDENTIALS
// POST { username, password }
// ─────────────────────────────────────
app.post('/api/test', async function(req, res) {
  try {
    var username = req.body.username;
    var password = req.body.password;

    if (!username || !password) {
      return res.status(400).json({ error: 'Missing username or password' });
    }

    var soap = '<?xml version="1.0" encoding="UTF-8"?>'
      + '<soapenv:Envelope'
      + ' xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"'
      + ' xmlns:ns="http://www.promostandards.org/WSDL/ProductDataService/2.0.0/"'
      + ' xmlns:shar="http://www.promostandards.org/WSDL/ProductDataService/2.0.0/SharedObjects/">'
      + '<soapenv:Header/><soapenv:Body>'
      + '<ns:GetProductSellableRequest>'
      + '<shar:wsVersion>2.0.0</shar:wsVersion>'
      + '<shar:id>' + username + '</shar:id>'
      + '<shar:password>' + password + '</shar:password>'
      + '<shar:productId>PC61</shar:productId>'
      + '<shar:isSellable>true</shar:isSellable>'
      + '</ns:GetProductSellableRequest>'
      + '</soapenv:Body></soapenv:Envelope>';

    var r = await fetch(PS_PRODUCT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': 'GetProductSellable' },
      body: soap,
      timeout: 15000
    });

    var text = await r.text();
    var lower = text.toLowerCase();

    if (r.status === 403) {
      return res.json({ error: 'HTTP 403 from SanMar. Your account may not have web services enabled yet. Email sanmarintegrations@sanmar.com with your customer number to request access.' });
    }
    if (r.status === 401) {
      return res.json({ error: 'HTTP 401 - Invalid credentials. Use your sanmar.com username and password (not FTP credentials).' });
    }
    if (!r.ok) {
      return res.json({ error: 'SanMar returned HTTP ' + r.status, rawStart: text.substring(0, 300) });
    }
    if (lower.includes('errorcode>105') || lower.includes('errorcode>100') || (lower.includes('authentication') && lower.includes('fail'))) {
      return res.json({ error: 'Authentication failed. Check your sanmar.com username and password. Note: web services must be separately enabled by emailing sanmarintegrations@sanmar.com.' });
    }
    if (lower.includes('errorcode>104') || lower.includes('unauthorized')) {
      return res.json({ error: 'Account not authorized for web services. Email sanmarintegrations@sanmar.com to enable access (1-2 business days).' });
    }
    if (lower.includes('fault')) {
      var fm = text.match(/<faultstring[^>]*>([^<]+)<\/faultstring>/i);
      return res.json({ error: 'SOAP fault: ' + (fm ? fm[1] : 'unknown'), rawStart: text.substring(0, 300) });
    }

    res.json({ ok: true, message: 'Connected to SanMar. Credentials valid.' });

  } catch(e) {
    res.json({ error: 'Proxy error: ' + e.message });
  }
});

// ─────────────────────────────────────
// DEBUG — raw SOAP response
// POST { username, password, style }
// ─────────────────────────────────────
app.post('/api/debug-pricing', async function(req, res) {
  try {
    var username       = req.body.username;
    var password       = req.body.password;
    var customerNumber = req.body.customerNumber || '';
    var style          = (req.body.style || 'PC61').toUpperCase();
    var color          = req.body.color || 'White';
    if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
    var soap = '<?xml version="1.0" encoding="UTF-8"?>'
      + '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:san="http://impl.webservice.integration.sanmar.com/">'
      + '<soapenv:Header/><soapenv:Body>'
      + '<san:getPricing><san:arg0>'
      + '<san:style>' + style + '</san:style>'
      + '<san:color>' + color + '</san:color>'
      + '<san:sizeIndex>0</san:sizeIndex>'
      + '<san:caseQty>0</san:caseQty>'
      + '<san:userInfo>'
      + '<san:sanMarCustomerNumber>' + customerNumber + '</san:sanMarCustomerNumber>'
      + '<san:sanMarUserName>' + username + '</san:sanMarUserName>'
      + '<san:sanMarUserPassword>' + password + '</san:sanMarUserPassword>'
      + '</san:userInfo>'
      + '</san:arg0></san:getPricing>'
      + '</soapenv:Body></soapenv:Envelope>';
    var r = await fetch(SM_PRICING, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': 'getPricing' },
      body: soap,
      timeout: 15000
    });
    var text = await r.text();
    res.json({ httpStatus: r.status, httpOk: r.ok, rawXml: text.substring(0, 4000) });
  } catch(e) {
    res.json({ error: e.message });
  }
});

app.post('/api/debug', async function(req, res) {
  try {
    var username = req.body.username;
    var password = req.body.password;
    var style    = (req.body.style || 'PC61').toUpperCase();

    if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

    var soap = buildGetProductSoap(username, password, style);
    var r = await fetch(PS_PRODUCT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': 'GetProduct' },
      body: soap,
      timeout: 15000
    });
    var text = await r.text();
    res.json({
      httpStatus: r.status,
      httpOk: r.ok,
      rawXml: text.substring(0, 3000),
      hasError: text.toLowerCase().includes('fault') || text.toLowerCase().includes('error'),
      hasProduct: text.toLowerCase().includes('product')
    });
  } catch(e) {
    res.json({ error: e.message });
  }
});

// ─────────────────────────────────────
// PRODUCT LOOKUP
// POST { username, password, style }
// ─────────────────────────────────────
app.post('/api/product', async function(req, res) {
  try {
    var username = req.body.username;
    var password = req.body.password;
    var style    = (req.body.style || '').toUpperCase();
    if (!username || !password || !style) return res.status(400).json({ error: 'Missing fields' });
    var data = await getProduct(username, password, style);
    res.json(data);
  } catch(e) {
    res.json({ error: e.message });
  }
});

// ─────────────────────────────────────
// PRICING LOOKUP
// POST { username, password, customerNumber, style, color }
// ─────────────────────────────────────
app.post('/api/pricing', async function(req, res) {
  try {
    var username       = req.body.username;
    var password       = req.body.password;
    var customerNumber = req.body.customerNumber;
    var style          = (req.body.style || '').toUpperCase();
    var color          = req.body.color || '';

    if (!username || !password || !style) return res.status(400).json({ error: 'Missing fields' });
    if (!customerNumber) return res.status(400).json({ error: 'Customer number required for pricing. Add it in Settings.' });

    var data = await getPricing(username, password, customerNumber, style, color);
    res.json(data);
  } catch(e) {
    res.json({ error: e.message });
  }
});

// ─────────────────────────────────────
// IMAGE PROXY
// GET /api/image/:style?color=Navy
// ─────────────────────────────────────
app.get('/api/image/:style', async function(req, res) {
  try {
    var style = req.params.style.toUpperCase();
    var color = (req.query.color || '').replace(/\s+/g, '_').toUpperCase();
    var urls = [
      SM_IMG_BASE + style + '_' + (color || style) + '.jpg',
      SM_IMG_BASE + style + '_' + style + '.jpg',
      SM_IMG_BASE + style.toLowerCase() + '_' + style.toLowerCase() + '.jpg'
    ];
    for (var i = 0; i < urls.length; i++) {
      try {
        var r = await fetch(urls[i], { timeout: 8000 });
        if (r.ok) {
          var buf = await r.buffer();
          if (buf.length > 1000) {
            return res.json({ style: style, imageUrl: urls[i], imageB64: buf.toString('base64'), mimeType: 'image/jpeg' });
          }
        }
      } catch(e) { /* try next */ }
    }
    res.status(404).json({ error: 'Image not found for ' + style });
  } catch(e) {
    res.json({ error: e.message });
  }
});

// ─────────────────────────────────────
// SPEC SHEET
// POST { username, password, style }
// ─────────────────────────────────────
app.post('/api/specsheet', async function(req, res) {
  try {
    var username = req.body.username;
    var password = req.body.password;
    var style    = (req.body.style || '').toUpperCase();
    if (!username || !password || !style) return res.status(400).json({ error: 'Missing fields' });

    var results = await Promise.all([
      getProduct(username, password, style),
      fetchImageB64(style, '')
    ]);
    var productData = results[0];
    var imgB64      = results[1];

    if (productData.error) return res.status(404).json(productData);

    var desc = productData.description || '';
    var wm   = desc.match(/(\d+(?:\.\d+)?\s*(?:oz|g\/m2|gsm)[^,.\n]*)/i);
    var fm   = desc.match(/(\d+%[^.\n]{3,60}(?:cotton|polyester|fleece|blend|jersey|pique|spandex)[^.\n]*)/i);
    var feats = desc.split(/[.\n]/).map(function(s){ return s.trim(); }).filter(function(s){ return s.length > 10 && s.length < 140; });

    res.json({
      style: style,
      name: productData.name,
      description: desc,
      fabric: fm ? fm[1].trim() : null,
      weight: wm ? wm[1].trim() : null,
      features: feats.slice(0, 8),
      colors: productData.colors || [],
      sizes: productData.sizes || ['XS','S','M','L','XL','2XL','3XL','4XL'],
      imageB64: imgB64
    });
  } catch(e) {
    res.json({ error: e.message });
  }
});

// ═════════════════════════════════════
// SOAP HELPERS
// ═════════════════════════════════════

function buildGetProductSoap(username, password, style) {
  return '<?xml version="1.0" encoding="UTF-8"?>'
    + '<soapenv:Envelope'
    + ' xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"'
    + ' xmlns:ns="http://www.promostandards.org/WSDL/ProductDataService/2.0.0/"'
    + ' xmlns:shar="http://www.promostandards.org/WSDL/ProductDataService/2.0.0/SharedObjects/">'
    + '<soapenv:Header/><soapenv:Body>'
    + '<ns:GetProductRequest>'
    + '<shar:wsVersion>2.0.0</shar:wsVersion>'
    + '<shar:id>' + username + '</shar:id>'
    + '<shar:password>' + password + '</shar:password>'
    + '<shar:localizationCountry>US</shar:localizationCountry>'
    + '<shar:localizationLanguage>en</shar:localizationLanguage>'
    + '<shar:productId>' + style + '</shar:productId>'
    + '</ns:GetProductRequest>'
    + '</soapenv:Body></soapenv:Envelope>';
}

async function getProduct(username, password, style) {
  var r = await fetch(PS_PRODUCT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': 'GetProduct' },
    body: buildGetProductSoap(username, password, style),
    timeout: 15000
  });
  var text = await r.text();
  if (!r.ok) return { error: 'SanMar HTTP ' + r.status };

  try {
    // Parse with explicitArray:true so we always get arrays — no type-checking needed
    var parsed = await xml2js.parseStringPromise(text, { explicitArray: true, ignoreAttrs: true });

    // Walk envelope: keys keep their XML source prefix (S:, ns2:, or none for default ns)
    var env  = findKey(parsed,  'Envelope') || parsed;
    var body = findKey(env,     'Body')     || {};

    // Check for SOAP fault
    var fault = findKey(body, 'Fault');
    if (fault) {
      var faultArr = Array.isArray(fault) ? fault : [fault];
      var fs = arrVal(faultArr[0], 'faultstring');
      return { error: 'SOAP fault: ' + fs };
    }

    var resp = findKey(body, 'GetProductResponse');
    if (!resp) return { error: 'No GetProductResponse in reply', rawStart: text.substring(0, 400) };
    var respObj = Array.isArray(resp) ? resp[0] : resp;

    // PromoStandards error check
    var ec = arrVal(respObj, 'errorCode');
    if (ec && ec !== '0') {
      return { error: 'SanMar error ' + ec + ': ' + arrVal(respObj, 'description') };
    }

    var productArr = findKey(respObj, 'Product');
    if (!productArr) return { error: 'Product ' + style + ' not found' };
    var product = Array.isArray(productArr) ? productArr[0] : productArr;

    // productName is a single tag -> ['Port & Co...'] with explicitArray:true
    var name = arrVal(product, 'productName') || style;

    // description is MULTIPLE tags -> array of strings; join them
    var descRaw = findKey(product, 'description') || [];
    var descArr = Array.isArray(descRaw) ? descRaw : [descRaw];
    var description = descArr.map(function(d) {
      return typeof d === 'string' ? d.trim() : (d && d['_'] ? d['_'].trim() : '');
    }).filter(Boolean).join(' ');

    // Colors and sizes from ProductPartArray
    var colors = [], sizes = [];
    var partArrayRaw = findKey(product, 'ProductPartArray');
    if (partArrayRaw) {
      var partArrayObj = Array.isArray(partArrayRaw) ? partArrayRaw[0] : partArrayRaw;
      var partsRaw = findKey(partArrayObj, 'ProductPart') || [];
      var parts = Array.isArray(partsRaw) ? partsRaw : [partsRaw];

      parts.filter(Boolean).forEach(function(part) {
        // Colors
        var colorArrayRaw = findKey(part, 'ColorArray');
        if (colorArrayRaw) {
          var colorArrayObj = Array.isArray(colorArrayRaw) ? colorArrayRaw[0] : colorArrayRaw;
          var colorObjs = findKey(colorArrayObj, 'Color') || [];
          if (!Array.isArray(colorObjs)) colorObjs = [colorObjs];
          colorObjs.filter(Boolean).forEach(function(c) {
            var cn = arrVal(c, 'colorName');
            if (cn && colors.indexOf(cn) < 0) colors.push(cn);
          });
        }
        // Sizes
        var sizeRaw = findKey(part, 'ApparelSize');
        if (sizeRaw) {
          var sizeObj = Array.isArray(sizeRaw) ? sizeRaw[0] : sizeRaw;
          var lbl = arrVal(sizeObj, 'labelSize');
          if (lbl && sizes.indexOf(lbl) < 0) sizes.push(lbl);
        }
      });
    }

    return { style: style, name: name, description: description, colors: colors, sizes: sizes };

  } catch(e) {
    return { error: 'Parse error: ' + e.message, rawStart: text.substring(0, 400) };
  }
}


async function getPricing(username, password, customerNumber, style, color) {
  var soap = '<?xml version="1.0" encoding="UTF-8"?>'
    + '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:san="http://impl.webservice.integration.sanmar.com/">'
    + '<soapenv:Header/><soapenv:Body>'
    + '<san:getPricing><san:arg0>'
    + '<san:style>' + style + '</san:style>'
    + '<san:color>' + color + '</san:color>'
    + '<san:sizeIndex>0</san:sizeIndex>'
    + '<san:caseQty>0</san:caseQty>'
    + '<san:userInfo>'
    + '<san:sanMarCustomerNumber>' + customerNumber + '</san:sanMarCustomerNumber>'
    + '<san:sanMarUserName>' + username + '</san:sanMarUserName>'
    + '<san:sanMarUserPassword>' + password + '</san:sanMarUserPassword>'
    + '</san:userInfo>'
    + '</san:arg0></san:getPricing>'
    + '</soapenv:Body></soapenv:Envelope>';

  var r = await fetch(SM_PRICING, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': 'getPricing' },
    body: soap,
    timeout: 15000
  });
  var text = await r.text();
  if (!r.ok) return { error: 'SanMar pricing HTTP ' + r.status, rawStart: text.substring(0, 400) };

  try {
    var parsed = await xml2js.parseStringPromise(text, { explicitArray: true, ignoreAttrs: true });
    var env  = findKey(parsed, 'Envelope') || parsed;
    var body = findKey(env,    'Body')     || {};

    var fault = findKey(body, 'Fault');
    if (fault) {
      var fArr = Array.isArray(fault) ? fault : [fault];
      return { error: 'SOAP fault: ' + arrVal(fArr[0], 'faultstring') };
    }

    // SanMar pricing response: <ns2:getPricingResponse><return>...</return></ns2:getPricingResponse>
    var resp = findKey(body, 'getPricingResponse');
    if (!resp) return { error: 'No pricing response', rawStart: text.substring(0, 400) };
    var respObj = Array.isArray(resp) ? resp[0] : resp;

    var retArr = findKey(respObj, 'return');
    if (!retArr) return { error: 'No return element in pricing response', rawStart: text.substring(0, 400) };
    var ret = Array.isArray(retArr) ? retArr[0] : retArr;

    // Check for error
    var errOccurred = arrVal(ret, 'errorOccurred');
    if (errOccurred === 'true') {
      return { error: arrVal(ret, 'message') || 'Pricing error from SanMar' };
    }

    // Build size->price map from responseList array
    var pricing = {};
    var sizeNames = ['XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'];
    var listRaw = findKey(ret, 'responseList') || [];
    var items = Array.isArray(listRaw) ? listRaw : [listRaw];

    items.filter(Boolean).forEach(function(item, i) {
      // Try multiple possible price field names
      var price = parseFloat(
        arrVal(item, 'ourPriceA') ||
        arrVal(item, 'piecePrice') ||
        arrVal(item, 'salePrice') ||
        '0'
      );
      var sz = arrVal(item, 'size') || sizeNames[i] || '';
      if (price > 0 && sz) pricing[sz] = price;
    });

    // Convenience fields
    function p(s) { return pricing[s] || null; }
    var sxl = p('S') || p('M') || p('L') || p('XL') || null;

    return {
      style: style, color: color,
      priceSXL: sxl,
      price2XL: p('2XL'),
      price3XL: p('3XL'),
      price4XL: p('4XL'),
      raw: Object.keys(pricing).length > 0 ? pricing : null
    };
  } catch(e) {
    return { error: 'Pricing parse error: ' + e.message, rawStart: text.substring(0, 400) };
  }
}


async function fetchImageB64(style, color) {
  var c = (color || '').replace(/\s+/g, '_').toUpperCase();
  var urls = [
    SM_IMG_BASE + style + '_' + (c || style) + '.jpg',
    SM_IMG_BASE + style + '_' + style + '.jpg',
    SM_IMG_BASE + style.toLowerCase() + '_' + style.toLowerCase() + '.jpg'
  ];
  for (var i = 0; i < urls.length; i++) {
    try {
      var r = await fetch(urls[i], { timeout: 7000 });
      if (r.ok) {
        var buf = await r.buffer();
        if (buf.length > 1000) return buf.toString('base64');
      }
    } catch(e) { /* try next */ }
  }
  return null;
}

// Walk object finding key by suffix, ignoring namespace prefixes
function findKey(obj, name) {
  if (!obj || typeof obj !== 'object') return null;
  var lower = name.toLowerCase();
  var keys  = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i].toLowerCase();
    if (k === lower || k.slice(k.lastIndexOf(':') + 1) === lower) return obj[keys[i]];
  }
  return null;
}

function safeStr(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.trim();
  if (Array.isArray(val)) return val.length > 0 ? safeStr(val[0]) : '';
  if (typeof val === 'object' && val['_']) return String(val['_']).trim();
  return '';
}

// Get first value from an explicitArray:true parsed object key
function arrVal(obj, key) {
  if (!obj) return '';
  var found = findKey(obj, key);
  if (!found) return '';
  if (Array.isArray(found)) return safeStr(found[0]);
  return safeStr(found);
}

// ─────────────────────────────────────
app.listen(PORT, function() {
  console.log('HVP SanMar Proxy v4 running on port ' + PORT);
});
