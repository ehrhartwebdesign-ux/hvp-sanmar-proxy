/**
 * HVP SanMar Proxy Server
 * Handles CORS-blocked SanMar SOAP API calls on behalf of the browser.
 * Deploy to Render.com (free tier) — see README for instructions.
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const xml2js = require('xml2js');

const app = express();
const PORT = process.env.PORT || 3000;

// Allow requests from anywhere (the quote tool can be opened from any machine)
app.use(cors());
app.use(express.json());

// ── SanMar SOAP endpoints ──
const SM_PRODUCT_URL  = 'https://ws.sanmar.com:8080/promostandards/ProductDataService/ProductDataServiceBinding?WSDL';
const SM_PRICING_URL  = 'https://ws.sanmar.com:8080/SanMarWebService/SanMarPricingServicePort?wsdl';
const SM_IMG_CDN      = 'https://cdnl.sanmar.com/catalog/images/imglib/mresjpg/';

// ── Health check ──
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'HVP SanMar Proxy', version: '1.0.0' });
});

// ── Test credentials ──
app.post('/api/test', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

  try {
    const result = await callProductSOAP(username, password, 'PC61');
    if (result.error) return res.status(401).json({ error: 'Invalid credentials or SanMar unreachable', detail: result.error });
    res.json({ ok: true, message: 'Credentials valid — SanMar connection working.' });
  } catch (e) {
    res.status(500).json({ error: 'Connection failed', detail: e.message });
  }
});

// ── Product lookup: style info + colors + image URLs ──
app.post('/api/product', async (req, res) => {
  const { username, password, style } = req.body;
  if (!username || !password || !style) return res.status(400).json({ error: 'Missing username, password, or style' });

  try {
    const data = await callProductSOAP(username, password, style.toUpperCase());
    if (data.error) return res.status(404).json({ error: data.error });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Product lookup failed', detail: e.message });
  }
});

// ── Pricing lookup: cost per size for a style+color ──
app.post('/api/pricing', async (req, res) => {
  const { username, password, style, color } = req.body;
  if (!username || !password || !style) return res.status(400).json({ error: 'Missing required fields' });

  try {
    const data = await callPricingSOAP(username, password, style.toUpperCase(), color || '');
    if (data.error) return res.status(404).json({ error: data.error });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Pricing lookup failed', detail: e.message });
  }
});

// ── Image proxy: fetches SanMar CDN image and returns as base64 ──
app.get('/api/image/:style', async (req, res) => {
  const style = req.params.style.toUpperCase();
  const color = req.query.color || style;

  // Try multiple SanMar image URL patterns
  const urls = [
    `${SM_IMG_CDN}${style}_${color.replace(/\s+/g, '_').toUpperCase()}.jpg`,
    `${SM_IMG_CDN}${style}_${style}.jpg`,
    `${SM_IMG_CDN}${style.toLowerCase()}_${style.toLowerCase()}.jpg`,
  ];

  for (const url of urls) {
    try {
      const resp = await fetch(url, { timeout: 8000 });
      if (resp.ok) {
        const buffer = await resp.buffer();
        if (buffer.length > 1000) {
          const b64 = buffer.toString('base64');
          return res.json({ 
            style, 
            imageUrl: url,
            imageB64: b64,
            mimeType: 'image/jpeg'
          });
        }
      }
    } catch (e) { /* try next */ }
  }

  res.status(404).json({ error: 'Image not found for style ' + style });
});

// ═══════════════════════════════════════
// SOAP HELPERS
// ═══════════════════════════════════════

async function callProductSOAP(username, password, style) {
  // SanMar PromoStandards Product Data Service v2.0.0
  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:ns="http://www.promostandards.org/WSDL/ProductDataService/2.0.0/"
  xmlns:shared="http://www.promostandards.org/WSDL/ProductDataService/2.0.0/SharedObjects/">
  <soapenv:Header/>
  <soapenv:Body>
    <ns:GetProductRequest>
      <ns:wsVersion>2.0.0</ns:wsVersion>
      <ns:id>${username}</ns:id>
      <ns:password>${password}</ns:password>
      <ns:localizationCountry>US</ns:localizationCountry>
      <ns:localizationLanguage>en</ns:localizationLanguage>
      <ns:productId>${style}</ns:productId>
      <ns:partId></ns:partId>
      <ns:colorName></ns:colorName>
      <ns:ApparelSizeArray></ns:ApparelSizeArray>
    </ns:GetProductRequest>
  </soapenv:Body>
</soapenv:Envelope>`;

  const resp = await fetch(SM_PRODUCT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': 'GetProduct',
    },
    body: soapBody,
    timeout: 15000,
  });

  const text = await resp.text();
  
  if (!resp.ok) {
    return { error: `SanMar returned HTTP ${resp.status}` };
  }

  try {
    const parsed = await xml2js.parseStringPromise(text, { explicitArray: false, ignoreAttrs: true });
    
    // Navigate the SOAP response
    const env = parsed['soapenv:Envelope'] || parsed['soap:Envelope'] || parsed['Envelope'];
    const body = env && (env['soapenv:Body'] || env['soap:Body'] || env['Body']);
    
    if (!body) return { error: 'Invalid SOAP response' };
    
    // Check for fault
    const fault = body['soapenv:Fault'] || body['soap:Fault'] || body['Fault'];
    if (fault) {
      const msg = fault.faultstring || fault.message || 'Unknown SOAP fault';
      return { error: String(msg) };
    }

    const getResp = body['ns2:GetProductResponse'] || body['GetProductResponse'] || 
                    Object.values(body)[0];
    
    if (!getResp) return { error: 'No product response in SOAP body' };

    // Extract product info
    const product = getResp.Product || getResp.product;
    if (!product) return { error: 'Product not found: ' + style };

    const productName = product.productName || product.ProductName || style;
    const description = product.description || product.Description || '';

    // Extract colors from ProductPartArray
    const colors = [];
    const partArray = product.ProductPartArray || {};
    const parts = partArray.ProductPart || [];
    const partsArr = Array.isArray(parts) ? parts : [parts];

    partsArr.forEach(part => {
      if (!part) return;
      const colorName = (part.ColorArray && part.ColorArray.Color && part.ColorArray.Color.colorName) 
                        || part.colorName || '';
      if (colorName && !colors.includes(colorName)) colors.push(colorName);
    });

    return {
      style: style,
      name: productName,
      description: description,
      colors: colors,
    };

  } catch (e) {
    return { error: 'Failed to parse SanMar response: ' + e.message };
  }
}

async function callPricingSOAP(username, password, style, color) {
  // SanMar Pricing Service
  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:san="http://www.sanmar.com/webservice">
  <soapenv:Header/>
  <soapenv:Body>
    <san:getPricingAndAvailability>
      <san:arg0>
        <san:style>${style}</san:style>
        <san:color>${color}</san:color>
        <san:sizeIndex>0</san:sizeIndex>
        <san:caseQty>0</san:caseQty>
        <san:userInfo>
          <san:userName>${username}</san:userName>
          <san:userPassword>${password}</san:userPassword>
        </san:userInfo>
      </san:arg0>
    </san:getPricingAndAvailability>
  </soapenv:Body>
</soapenv:Envelope>`;

  const resp = await fetch(SM_PRICING_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': 'getPricingAndAvailability',
    },
    body: soapBody,
    timeout: 15000,
  });

  const text = await resp.text();
  if (!resp.ok) return { error: `SanMar pricing returned HTTP ${resp.status}` };

  try {
    const parsed = await xml2js.parseStringPromise(text, { explicitArray: false, ignoreAttrs: true });
    const env = parsed['soapenv:Envelope'] || parsed['soap:Envelope'] || parsed['Envelope'];
    const body = env && (env['soapenv:Body'] || env['soap:Body'] || env['Body']);
    if (!body) return { error: 'Invalid pricing response' };

    const fault = body['soapenv:Fault'] || body['soap:Fault'] || body['Fault'];
    if (fault) return { error: String(fault.faultstring || 'Pricing fault') };

    // Extract pricing — navigate to the response data
    const returnObj = body['ns2:getPricingAndAvailabilityResponse'] || 
                      body['getPricingAndAvailabilityResponse'] ||
                      Object.values(body)[0];

    const returnVal = returnObj && (returnObj['return'] || returnObj.return);
    if (!returnVal) return { error: 'No pricing data returned' };

    // Build size->price map
    const pricing = {};
    const listPrice = returnVal.listPrice || {};
    
    // SanMar returns prices by size index; map to size names
    const sizeNames = ['XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'];
    const prices = Array.isArray(listPrice) ? listPrice : [listPrice];
    
    prices.forEach((p, i) => {
      const size = sizeNames[i] || ('Size'+(i+1));
      const price = parseFloat(p.price || p._ || p) || 0;
      if (price > 0) pricing[size] = price;
    });

    // Also try to get a simpler structure
    const priceSXL = parseFloat(returnVal.priceSXL || returnVal.price || 0);
    const price2XL = parseFloat(returnVal.price2XL || 0);
    const price3XL = parseFloat(returnVal.price3XL || 0);
    const price4XL = parseFloat(returnVal.price4XL || 0);

    return {
      style, color,
      pricing,
      // Convenience fields if SanMar returns them directly
      priceSXL: priceSXL || null,
      price2XL: price2XL || null,
      price3XL: price3XL || null,
      price4XL: price4XL || null,
      raw: Object.keys(pricing).length > 0 ? pricing : null,
    };

  } catch (e) {
    return { error: 'Failed to parse pricing response: ' + e.message };
  }
}

// ── Start ──
app.listen(PORT, () => {
  console.log(`HVP SanMar Proxy running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/`);
});

// ── Spec sheet: fabric, features, colors, sizes for a style ──
app.post('/api/specsheet', async (req, res) => {
  const { username, password, style } = req.body;
  if (!username || !password || !style) return res.status(400).json({ error: 'Missing fields' });

  try {
    // Get product data from SanMar which contains fabric/feature info
    const productData = await callProductSOAP(username, password, style.toUpperCase());
    if (productData.error) return res.status(404).json({ error: productData.error });

    // Also fetch the image
    let imageB64 = null;
    const imgUrls = [
      `${SM_IMG_CDN}${style.toUpperCase()}_${style.toUpperCase()}.jpg`,
      `${SM_IMG_CDN}${style.toLowerCase()}_${style.toLowerCase()}.jpg`,
    ];
    for (const url of imgUrls) {
      try {
        const r = await fetch(url, { timeout: 6000 });
        if (r.ok) {
          const buf = await r.buffer();
          if (buf.length > 1000) { imageB64 = buf.toString('base64'); break; }
        }
      } catch (e) {}
    }

    // Parse features from SanMar product description
    const descText = productData.description || '';
    const features = descText
      .split(/[.\n]/)
      .map(s => s.trim())
      .filter(s => s.length > 8 && s.length < 120);

    // Extract fabric weight from description
    const weightMatch = descText.match(/(\d+(?:\.\d+)?\s*(?:oz|g\/m2|gsm)[^,.\n]*)/i);
    const weight = weightMatch ? weightMatch[1].trim() : null;

    // Fabric content
    const fabricMatch = descText.match(/(\d+%[^.\n]+(?:cotton|polyester|fleece|blend|jersey|pique)[^.\n]*)/i);
    const fabric = fabricMatch ? fabricMatch[1].trim() : null;

    res.json({
      style: style.toUpperCase(),
      name: productData.name,
      description: productData.description,
      fabric: fabric,
      weight: weight,
      features: features.slice(0, 8),
      colors: productData.colors || [],
      sizes: ['XS','S','M','L','XL','2XL','3XL','4XL'], // SanMar standard; refine per product if needed
      imageB64: imageB64,
    });

  } catch (e) {
    res.status(500).json({ error: 'Spec sheet fetch failed: ' + e.message });
  }
});
