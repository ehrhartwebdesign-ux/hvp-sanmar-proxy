'use strict';
require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const db       = require('./src/db');
const fetch    = require('node-fetch');
const xml2js   = require('xml2js');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '25mb' }));

// ─────────────────────────────────────
// API ROUTES
// ─────────────────────────────────────
app.use('/api/auth',      require('./src/routes/auth'));
app.use('/api/quotes',    require('./src/routes/quotes'));
app.use('/api/customers', require('./src/routes/customers'));
app.use('/api/email',     require('./src/routes/email'));

// ─────────────────────────────────────
// SANMAR PROXY (built in — no separate Render service needed)
// ─────────────────────────────────────
const SM_PRODUCT  = 'https://ws.sanmar.com:8080/promostandards/ProductDataServiceBindingV2';
const SM_PRICING  = 'https://ws.sanmar.com:8080/SanMarWebService/SanMarPricingServicePort';
const SM_IMG_BASE = 'https://cdnl.sanmar.com/catalog/images/imglib/mresjpg/';
const { requireAuth } = require('./src/middleware/auth');

function findKey(obj, name) {
  if (Array.isArray(obj)) obj = obj[0];
  if (!obj || typeof obj !== 'object') return null;
  var lower = name.toLowerCase();
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i].toLowerCase();
    if (k === lower || k.slice(k.lastIndexOf(':') + 1) === lower) return obj[keys[i]];
  }
  return null;
}
function arrVal(obj, key) {
  var found = findKey(obj, key);
  if (!found) return '';
  if (Array.isArray(found)) {
    var v = found[0];
    return typeof v === 'string' ? v.trim() : (v && v['_'] ? String(v['_']).trim() : '');
  }
  if (typeof found === 'string') return found.trim();
  return found['_'] ? String(found['_']).trim() : '';
}

// POST /api/product
app.post('/api/product', requireAuth, async function(req, res) {
  try {
    var username = req.body.username;
    var password = req.body.password;
    var style    = (req.body.style || '').toUpperCase();
    if (!username || !password || !style) return res.status(400).json({ error: 'Missing fields' });

    var soap = '<?xml version="1.0" encoding="UTF-8"?>'
      + '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"'
      + ' xmlns:ns="http://www.promostandards.org/WSDL/ProductDataService/2.0.0/"'
      + ' xmlns:shar="http://www.promostandards.org/WSDL/ProductDataService/2.0.0/SharedObjects/">'
      + '<soapenv:Header/><soapenv:Body><ns:GetProductRequest>'
      + '<shar:wsVersion>2.0.0</shar:wsVersion>'
      + '<shar:id>' + username + '</shar:id>'
      + '<shar:password>' + password + '</shar:password>'
      + '<shar:localizationCountry>US</shar:localizationCountry>'
      + '<shar:localizationLanguage>en</shar:localizationLanguage>'
      + '<shar:productId>' + style + '</shar:productId>'
      + '</ns:GetProductRequest></soapenv:Body></soapenv:Envelope>';

    var r = await fetch(SM_PRODUCT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': 'GetProduct' },
      body: soap, timeout: 15000
    });
    var text = await r.text();
    if (!r.ok) return res.json({ error: 'SanMar HTTP ' + r.status });

    var parsed = await xml2js.parseStringPromise(text, { explicitArray: true, ignoreAttrs: true });
    var env  = findKey(parsed, 'Envelope') || parsed;
    var body = findKey(env, 'Body') || {};
    var fault = findKey(body, 'Fault');
    if (fault) return res.json({ error: 'SOAP fault: ' + arrVal(Array.isArray(fault) ? fault : [fault], 'faultstring') });

    var resp = findKey(body, 'GetProductResponse');
    if (!resp) return res.json({ error: 'No product response', rawStart: text.substring(0, 300) });
    var respObj = Array.isArray(resp) ? resp[0] : resp;
    var ec = arrVal(respObj, 'errorCode');
    if (ec && ec !== '0') return res.json({ error: 'SanMar error ' + ec + ': ' + arrVal(respObj, 'description') });

    var productArr = findKey(respObj, 'Product');
    if (!productArr) return res.json({ error: 'Product not found' });
    var product = Array.isArray(productArr) ? productArr[0] : productArr;

    var name    = arrVal(product, 'productName') || style;
    var descRaw = findKey(product, 'description') || [];
    var descArr = Array.isArray(descRaw) ? descRaw : [descRaw];
    var bullets = descArr.map(function(d) {
      return typeof d === 'string' ? d.trim() : (d && d['_'] ? d['_'].trim() : '');
    }).filter(function(d) { return d.length > 2; });

    var colors = [], sizes = [];
    var partArr = findKey(product, 'ProductPartArray') || {};
    var parts   = findKey(partArr, 'ProductPart') || [];
    if (!Array.isArray(parts)) parts = [parts];
    parts.filter(Boolean).forEach(function(part) {
      var ca  = findKey(part, 'ColorArray') || {};
      var cos = findKey(ca, 'Color') || [];
      if (!Array.isArray(cos)) cos = [cos];
      cos.filter(Boolean).forEach(function(c) {
        var cn = arrVal(c, 'colorName');
        if (cn && colors.indexOf(cn) < 0) colors.push(cn);
      });
      var sa  = findKey(part, 'ApparelSize') || {};
      var lbl = arrVal(sa, 'labelSize');
      if (lbl && sizes.indexOf(lbl) < 0) sizes.push(lbl);
    });

    res.json(JSON.parse(JSON.stringify({ style, name, description: bullets.join(' '), bullets, colors, sizes })));
  } catch(e) {
    console.error('Product error:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/pricing
app.post('/api/pricing', requireAuth, async function(req, res) {
  try {
    var username       = req.body.username;
    var password       = req.body.password;
    var customerNumber = req.body.customerNumber;
    var style          = (req.body.style || '').toUpperCase();
    var color          = req.body.color || '';
    if (!username || !password || !style || !customerNumber) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    var sizesToFetch = ['S', 'XL', '2XL', '3XL', '4XL'];
    var pricing = {};

    for (var si = 0; si < sizesToFetch.length; si++) {
      var sz   = sizesToFetch[si];
      var soap = '<?xml version="1.0" encoding="UTF-8"?>'
        + '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"'
        + ' xmlns:impl="http://impl.webservice.integration.sanmar.com/">'
        + '<soapenv:Header/><soapenv:Body><impl:getPricing><arg0>'
        + '<color>' + color + '</color><size>' + sz + '</size><style>' + style + '</style>'
        + '<sizeIndex></sizeIndex><casePrice></casePrice><dozenPrice></dozenPrice>'
        + '<inventoryKey></inventoryKey><myPrice></myPrice><piecePrice></piecePrice>'
        + '<salePrice></salePrice><saleStartDate></saleStartDate><saleEndDate></saleEndDate>'
        + '<incentivePrice></incentivePrice>'
        + '</arg0><arg1>'
        + '<sanMarCustomerNumber>' + customerNumber + '</sanMarCustomerNumber>'
        + '<sanMarUserName>' + username + '</sanMarUserName>'
        + '<sanMarUserPassword>' + password + '</sanMarUserPassword>'
        + '<senderId></senderId><senderPassword></senderPassword>'
        + '</arg1></impl:getPricing></soapenv:Body></soapenv:Envelope>';
      try {
        var r = await fetch(SM_PRICING, {
          method: 'POST',
          headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': 'getPricing' },
          body: soap, timeout: 12000
        });
        var text = await r.text();
        if (!r.ok) continue;
        var parsed = await xml2js.parseStringPromise(text, { explicitArray: true, ignoreAttrs: true });
        var env  = findKey(parsed, 'Envelope') || parsed;
        var body = findKey(env, 'Body') || {};
        if (findKey(body, 'Fault')) continue;
        var resp = findKey(body, 'getPricingResponse');
        if (!resp) continue;
        var respObj = Array.isArray(resp) ? resp[0] : resp;
        var retArr  = findKey(respObj, 'return');
        if (!retArr) continue;
        var ret = Array.isArray(retArr) ? retArr[0] : retArr;
        if (arrVal(ret, 'errorOccurred') === 'true') continue;
        var listRaw = findKey(ret, 'listResponse');
        if (!listRaw) continue;
        var items = Array.isArray(listRaw) ? listRaw : [listRaw];
        items.filter(Boolean).forEach(function(item) {
          var myP    = parseFloat(arrVal(item, 'myPrice')    || '0');
          var pieceP = parseFloat(arrVal(item, 'piecePrice') || '0');
          var price  = myP > 0 ? myP : pieceP;
          var itemSz = arrVal(item, 'size') || sz;
          if (price > 0 && itemSz) pricing[itemSz] = price;
        });
      } catch(e) { /* try next size */ }
    }

    function p(s) { return pricing[s] || null; }
    res.json({
      style, color,
      priceSXL: p('S') || p('M') || p('L') || p('XL'),
      price2XL: p('2XL'), price3XL: p('3XL'), price4XL: p('4XL'),
      raw: Object.keys(pricing).length > 0 ? pricing : null
    });
  } catch(e) {
    console.error('Pricing error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/image/:style?color=
app.get('/api/image/:style', requireAuth, async function(req, res) {
  try {
    var style     = req.params.style.toUpperCase();
    var colorCode = (req.query.color || '').replace(/\s+/g, '_').toUpperCase().replace(/[^A-Z0-9_]/g, '');
    var urls = [
      SM_IMG_BASE + style + '_' + colorCode + '.jpg',
      SM_IMG_BASE + style + '_' + style + '.jpg',
      SM_IMG_BASE + style.toLowerCase() + '_' + style.toLowerCase() + '.jpg'
    ].filter(function(u, i, a) { return a.indexOf(u) === i && u.indexOf('_.jpg') < 0; });

    for (var i = 0; i < urls.length; i++) {
      try {
        var r = await fetch(urls[i], { timeout: 7000 });
        if (r.ok) {
          var buf = await r.buffer();
          if (buf.length > 1000) {
            return res.json({ imageUrl: urls[i], imageB64: buf.toString('base64'), mimeType: 'image/jpeg' });
          }
        }
      } catch(e) { /* try next */ }
    }
    res.status(404).json({ error: 'Image not found for ' + style });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────
// SERVE REACT FRONTEND (built files)
// ─────────────────────────────────────
const FRONTEND = path.join(__dirname, 'frontend', 'build');
app.use(express.static(FRONTEND));
app.get('*', function(req, res) {
  res.sendFile(path.join(FRONTEND, 'index.html'));
});

// ─────────────────────────────────────
// START
// ─────────────────────────────────────
process.on('unhandledRejection', function(r) { console.error('Unhandled rejection:', r); });
process.on('uncaughtException',  function(e) { console.error('Uncaught exception:', e); });

app.listen(PORT, async function() {
  console.log('HVP Quoting App running on port ' + PORT);
  await db.initDb();
});
